import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"
import {
  createWorkflowClient,
  type WorkflowClient,
} from "@repo-edu/application-contract"
import {
  defaultAppSettings,
  type PersistedAppSettings,
} from "@repo-edu/domain/settings"
import {
  type CourseBacking,
  type CourseSummary,
  type PersistedCourse,
  persistedAppSettingsKind,
  persistedCourseKind,
} from "@repo-edu/domain/types"
import { clearWorkflowClient } from "../contexts/workflow-client.js"
import {
  persistCourseDisplayName,
  pruneLoadedSubmissionFoldersForCourses,
  resolveActiveSurfaceRedirectForCourses,
  resolveDuplicateCourseSource,
} from "../hooks/use-courses.js"
import {
  clearPersisterRegistry,
  type PersisterRegistry,
  setPersisterRegistry,
} from "../persistence/persister-registry.js"
import { useAppSettingsStore } from "../stores/app-settings-store.js"
import { useCourseStore } from "../stores/course-store.js"
import { useUiStore } from "../stores/ui-store.js"

function makeSettings(
  overrides: Partial<PersistedAppSettings> = {},
): PersistedAppSettings {
  return {
    ...defaultAppSettings,
    kind: persistedAppSettingsKind,
    ...overrides,
  }
}

function courseSummary(id: string, backing: CourseBacking): CourseSummary {
  return {
    id,
    backing,
    displayName: id,
    updatedAt: "2026-05-25T00:00:00.000Z",
  }
}

function makeCourse(overrides: Partial<PersistedCourse> = {}): PersistedCourse {
  return {
    kind: persistedCourseKind,
    backing: "lms",
    revision: 0,
    id: "course-1",
    displayName: "Course 1",
    lmsConnectionId: null,
    organization: null,
    lmsCourseId: null,
    idSequences: {
      nextGroupSeq: 1,
      nextGroupSetSeq: 1,
      nextMemberSeq: 1,
      nextAssignmentSeq: 1,
      nextTeamSeq: 1,
    },
    roster: {
      connection: null,
      students: [],
      staff: [],
      groups: [],
      groupSets: [],
      assignments: [],
    },
    repositoryTemplate: null,
    searchFolder: null,
    analysisInputs: {},
    updatedAt: "2026-05-25T00:00:00.000Z",
    ...overrides,
  }
}

beforeEach(() => {
  clearWorkflowClient()
  clearPersisterRegistry()
  useAppSettingsStore.getState().reset()
  useCourseStore.getState().clear()
  useUiStore.getState().reset()
})

function installPersisterRegistry(overrides: {
  settingsFlush?: () => Promise<void> | void
  courseFlush?: () => Promise<void> | void
}) {
  const persister = {
    flush: async () => {},
    waitForIdle: async () => {},
    adoptCurrentSnapshot: () => {},
    dispose: () => {},
  }
  setPersisterRegistry({
    appSettings: {
      ...persister,
      flush: async () => {
        await overrides.settingsFlush?.()
      },
    },
    course: {
      ...persister,
      flush: async () => {
        await overrides.courseFlush?.()
      },
    },
    flush: async () => {},
    waitForIdle: async () => {},
    dispose: () => {},
  } satisfies PersisterRegistry)
}

function installSettingsFlushCounter(onFlush: () => void) {
  installPersisterRegistry({
    settingsFlush: () => {
      onFlush()
    },
  })
}

describe("course refresh submission pruning", () => {
  it("marks the course list ready when an empty list has loaded", () => {
    assert.equal(useUiStore.getState().courseListLoaded, false)

    useUiStore.getState().setCourseList([])

    assert.equal(useUiStore.getState().courseListLoaded, true)
  })

  it("redirects active submissions whose attached course is stale", () => {
    assert.deepStrictEqual(
      resolveActiveSurfaceRedirectForCourses(
        {
          kind: "submission",
          path: "/submissions/ada",
          courseId: "course-1",
        },
        [courseSummary("course-1", "repobee")],
      ),
      {
        surface: { kind: "course", courseId: "course-1" },
        courseBacking: "repobee",
      },
    )

    assert.deepStrictEqual(
      resolveActiveSurfaceRedirectForCourses(
        {
          kind: "submission",
          path: "/submissions/ada",
          courseId: "missing",
        },
        [courseSummary("course-2", "lms")],
      ),
      {
        surface: { kind: "course", courseId: "course-2" },
        courseBacking: "lms",
      },
    )
  })

  it("keeps valid attached submissions on the submission surface", () => {
    assert.equal(
      resolveActiveSurfaceRedirectForCourses(
        {
          kind: "submission",
          path: "/submissions/ada",
          courseId: "course-1",
        },
        [courseSummary("course-1", "lms")],
      ),
      null,
    )
  })

  it("does not flush app settings when submission recents do not change", () => {
    let flushCalls = 0
    installSettingsFlushCounter(() => {
      flushCalls += 1
    })
    useAppSettingsStore.getState().hydrate(makeSettings())

    const changed = pruneLoadedSubmissionFoldersForCourses([
      courseSummary("course-1", "lms"),
    ])

    assert.equal(changed, false)
    assert.equal(flushCalls, 0)
  })

  it("flushes loaded settings only when stale submission recents are pruned", async () => {
    let flushCalls = 0
    installSettingsFlushCounter(() => {
      flushCalls += 1
    })
    useAppSettingsStore.getState().hydrate(makeSettings())
    useAppSettingsStore.getState().pushRecentSubmissionFolder({
      path: "/submissions/ada",
      courseId: "course-1",
    })

    assert.equal(
      pruneLoadedSubmissionFoldersForCourses([
        courseSummary("course-1", "lms"),
      ]),
      false,
    )
    assert.equal(flushCalls, 0)

    assert.equal(pruneLoadedSubmissionFoldersForCourses([]), true)
    await new Promise((resolve) => setTimeout(resolve, 0))

    assert.equal(flushCalls, 1)
    assert.deepStrictEqual(
      useAppSettingsStore.getState().settings.recentSubmissionFolders,
      [],
    )
  })
})

describe("course management persistence", () => {
  it("duplicates the active course from the flushed in-memory source", async () => {
    const activeCourse = makeCourse({
      displayName: "Dirty active course",
      revision: 2,
    })
    let flushCalls = 0
    let loadCalls = 0
    useCourseStore.setState({
      course: activeCourse,
      status: "loaded",
    })
    installPersisterRegistry({
      courseFlush: () => {
        flushCalls += 1
        useCourseStore.getState().applySaveStamp(activeCourse.id, {
          revision: 3,
          updatedAt: "2026-05-25T00:00:01.000Z",
        })
      },
    })
    const workflowClient = createWorkflowClient({
      "course.load": async () => {
        loadCalls += 1
        return makeCourse({ displayName: "Disk stale course" })
      },
    }) as unknown as WorkflowClient

    const source = await resolveDuplicateCourseSource(
      workflowClient,
      activeCourse.id,
    )

    assert.equal(flushCalls, 1)
    assert.equal(loadCalls, 0)
    assert.equal(source.displayName, "Dirty active course")
    assert.equal(source.revision, 3)
  })

  it("renames the active course through the store and course persister", async () => {
    const activeCourse = makeCourse({ revision: 4 })
    let flushCalls = 0
    let loadCalls = 0
    let saveCalls = 0
    useCourseStore.setState({
      course: activeCourse,
      status: "loaded",
    })
    installPersisterRegistry({
      courseFlush: () => {
        flushCalls += 1
        const currentCourse = useCourseStore.getState().course
        assert.ok(currentCourse)
        useCourseStore.getState().applySaveStamp(currentCourse.id, {
          revision: currentCourse.revision + 1,
          updatedAt: "2026-05-25T00:00:02.000Z",
        })
      },
    })
    const workflowClient = createWorkflowClient({
      "course.load": async () => {
        loadCalls += 1
        return activeCourse
      },
      "course.save": async (course) => {
        saveCalls += 1
        return {
          revision: course.revision + 1,
          updatedAt: "2026-05-25T00:00:03.000Z",
        }
      },
    }) as unknown as WorkflowClient

    await persistCourseDisplayName(
      workflowClient,
      activeCourse.id,
      "Renamed active course",
    )

    const storedCourse = useCourseStore.getState().course
    assert.ok(storedCourse)
    assert.equal(flushCalls, 1)
    assert.equal(loadCalls, 0)
    assert.equal(saveCalls, 0)
    assert.equal(storedCourse.displayName, "Renamed active course")
    assert.equal(storedCourse.revision, 5)
  })
})

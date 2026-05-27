import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"
import {
  defaultAppSettings,
  type PersistedAppSettings,
} from "@repo-edu/domain/settings"
import {
  type CourseBacking,
  type CourseSummary,
  persistedAppSettingsKind,
} from "@repo-edu/domain/types"
import { clearWorkflowClient } from "../contexts/workflow-client.js"
import {
  pruneLoadedSubmissionFoldersForCourses,
  resolveActiveSurfaceRedirectForCourses,
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

beforeEach(() => {
  clearWorkflowClient()
  clearPersisterRegistry()
  useAppSettingsStore.getState().reset()
  useCourseStore.getState().clear()
  useUiStore.getState().reset()
})

function installSettingsFlushCounter(onFlush: () => void) {
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
        onFlush()
      },
    },
    course: persister,
    flush: async () => {},
    waitForIdle: async () => {},
    dispose: () => {},
  } satisfies PersisterRegistry)
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

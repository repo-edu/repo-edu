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
  persistedAppSettingsKind,
} from "@repo-edu/domain/types"
import {
  clearWorkflowClient,
  setWorkflowClient,
} from "../contexts/workflow-client.js"
import {
  pruneLoadedSubmissionFoldersForCourses,
  resolveActiveSurfaceRedirectForCourses,
} from "../hooks/use-courses.js"
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
  useAppSettingsStore.getState().reset()
  useCourseStore.getState().clear()
  useUiStore.getState().reset()
})

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

  it("does not save app settings before settings have loaded", () => {
    let saveCalls = 0
    const client = createWorkflowClient({
      "settings.loadApp": async () => makeSettings(),
      "settings.saveApp": async (settings) => {
        saveCalls += 1
        return settings
      },
    })
    setWorkflowClient(client as unknown as WorkflowClient)
    useAppSettingsStore
      .getState()
      .pushRecentSubmissionFolder({ path: "/submissions/ada", courseId: "old" })

    const changed = pruneLoadedSubmissionFoldersForCourses([])

    assert.equal(changed, false)
    assert.equal(saveCalls, 0)
    assert.deepStrictEqual(
      useAppSettingsStore.getState().settings.recentSubmissionFolders,
      [{ path: "/submissions/ada", courseId: "old" }],
    )
  })

  it("saves loaded settings only when stale submission recents are pruned", async () => {
    let saveCalls = 0
    const client = createWorkflowClient({
      "settings.loadApp": async () => makeSettings(),
      "settings.saveApp": async (settings) => {
        saveCalls += 1
        return settings
      },
    })
    setWorkflowClient(client as unknown as WorkflowClient)
    await useAppSettingsStore.getState().load()
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
    assert.equal(saveCalls, 0)

    assert.equal(pruneLoadedSubmissionFoldersForCourses([]), true)
    await new Promise((resolve) => setTimeout(resolve, 0))

    assert.equal(saveCalls, 1)
    assert.deepStrictEqual(
      useAppSettingsStore.getState().settings.recentSubmissionFolders,
      [],
    )
  })
})

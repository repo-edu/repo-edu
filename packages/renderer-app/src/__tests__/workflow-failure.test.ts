import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"
import {
  type AppError,
  createWorkflowClient,
  type WorkflowClient,
} from "@repo-edu/application-contract"
import {
  defaultAppSettings,
  type PersistedAppSettings,
} from "@repo-edu/domain/settings"
import {
  type PersistedCourse,
  persistedAppSettingsKind,
  persistedCourseKind,
} from "@repo-edu/domain/types"
import {
  clearWorkflowClient,
  setWorkflowClient,
} from "../contexts/workflow-client.js"
import { useAppSettingsStore } from "../stores/app-settings-store.js"
import { useConnectionsStore } from "../stores/connections-store.js"
import { useCourseStore } from "../stores/course-store.js"

function makeProfile(courseId = "course-1"): PersistedCourse {
  return {
    kind: persistedCourseKind,
    schemaVersion: 2,
    revision: 0,
    id: courseId,
    displayName: "Test Course",
    lmsConnectionName: null,
    gitConnectionId: null,
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
    updatedAt: "2026-01-01T00:00:00Z",
  }
}

function makeSettings(
  overrides: Partial<PersistedAppSettings> = {},
): PersistedAppSettings {
  return {
    ...defaultAppSettings,
    kind: persistedAppSettingsKind,
    schemaVersion: 1,
    ...overrides,
  }
}

beforeEach(() => {
  clearWorkflowClient()
  useAppSettingsStore.getState().reset()
  useCourseStore.getState().clear()
  useConnectionsStore.getState().resetAllStatuses()
})

describe("workflow failure handling in stores", () => {
  describe("app settings store", () => {
    it("transitions to error state on load failure", async () => {
      const providerError: AppError = {
        type: "persistence",
        message: "Settings file corrupted",
        operation: "read",
      }
      const client = createWorkflowClient({
        "settings.loadApp": async () => {
          throw providerError
        },
      })
      setWorkflowClient(client as unknown as WorkflowClient)

      await useAppSettingsStore.getState().load()

      assert.equal(useAppSettingsStore.getState().status, "error")
      assert.ok(useAppSettingsStore.getState().error?.includes("corrupted"))
    })

    it("transitions to error state on save failure", async () => {
      const settings = makeSettings()
      const client = createWorkflowClient({
        "settings.loadApp": async () => settings,
        "settings.saveApp": async () => {
          throw new Error("Write permission denied")
        },
      })
      setWorkflowClient(client as unknown as WorkflowClient)

      await useAppSettingsStore.getState().load()
      assert.equal(useAppSettingsStore.getState().status, "loaded")

      await useAppSettingsStore.getState().save()
      assert.equal(useAppSettingsStore.getState().status, "error")
    })
  })

  describe("course store", () => {
    it("transitions to error state on load failure", async () => {
      const notFoundError: AppError = {
        type: "not-found",
        message: "Course 'unknown' was not found.",
        resource: "course",
      }
      const client = createWorkflowClient({
        "course.load": async () => {
          throw notFoundError
        },
      })
      setWorkflowClient(client as unknown as WorkflowClient)

      await useCourseStore.getState().load("unknown")

      assert.equal(useCourseStore.getState().status, "error")
      assert.ok(useCourseStore.getState().error?.includes("not found"))
    })

    it("keeps local state after save failure", async () => {
      const course = makeProfile()
      const client = createWorkflowClient({
        "course.load": async () => course,
        "course.save": async () => {
          throw { type: "unexpected", message: "Disk full", retryable: false }
        },
      })
      setWorkflowClient(client as unknown as WorkflowClient)

      await useCourseStore.getState().load(course.id)
      useCourseStore.getState().setDisplayName("Modified")

      const saved = await useCourseStore.getState().save()
      assert.equal(saved, false)
      assert.equal(useCourseStore.getState().course?.displayName, "Modified")
      assert.equal(useCourseStore.getState().syncState, "error")
    })

    it("reports cancellation errors distinctly", async () => {
      const course = makeProfile()
      const cancelledError: AppError = {
        type: "cancelled",
        message: "Workflow was cancelled.",
      }
      const client = createWorkflowClient({
        "course.load": async () => course,
        "course.save": async () => {
          throw cancelledError
        },
      })
      setWorkflowClient(client as unknown as WorkflowClient)

      await useCourseStore.getState().load(course.id)
      useCourseStore.getState().setDisplayName("Changed")

      const saved = await useCourseStore.getState().save()
      assert.equal(saved, false)
      assert.ok(useCourseStore.getState().syncError?.includes("cancelled"))
    })
  })
})

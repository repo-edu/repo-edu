import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"
import {
  type AppError,
  createWorkflowClient,
  type WorkflowClient,
} from "@repo-edu/application-contract"
import {
  type PersistedCourse,
  persistedCourseKind,
} from "@repo-edu/domain/types"
import {
  clearWorkflowClient,
  setWorkflowClient,
} from "../contexts/workflow-client.js"
import { useAppSettingsStore } from "../stores/app-settings-store.js"
import { useConnectionsStore } from "../stores/connections-store.js"
import { useCourseStore } from "../stores/course-store.js"

function makeCourse(courseId = "course-1"): PersistedCourse {
  return {
    kind: persistedCourseKind,
    backing: "lms",
    revision: 0,
    id: courseId,
    displayName: "Test Course",
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
    updatedAt: "2026-01-01T00:00:00Z",
  }
}

beforeEach(() => {
  clearWorkflowClient()
  useAppSettingsStore.getState().reset()
  useCourseStore.getState().clear()
  useConnectionsStore.getState().resetAllStatuses()
})

describe("workflow failure handling in stores", () => {
  it("transitions to error state on course load failure", async () => {
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

  it("keeps local course state when sync status records a save failure", async () => {
    const course = makeCourse()
    const client = createWorkflowClient({
      "course.load": async () => course,
    })
    setWorkflowClient(client as unknown as WorkflowClient)

    await useCourseStore.getState().load(course.id)
    useCourseStore.getState().setDisplayName("Modified")
    useCourseStore
      .getState()
      .setSyncStatus({ state: "error", message: "Disk full" })

    assert.equal(useCourseStore.getState().course?.displayName, "Modified")
    assert.deepStrictEqual(useCourseStore.getState().syncStatus, {
      state: "error",
      message: "Disk full",
    })
  })
})

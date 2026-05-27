import type {
  CourseSaveStamp,
  WorkflowClient,
} from "@repo-edu/application-contract"
import type { PersistedCourse } from "@repo-edu/domain/types"
import { useCourseStore } from "../stores/course-store.js"
import { getErrorMessage } from "../utils/error-message.js"
import { createPersister, type Persister } from "./create-persister.js"

function isRetryableWorkflowError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "retryable" in error &&
    (error as { retryable?: unknown }).retryable === true
  )
}

function conflictReason(error: unknown): string | null {
  if (
    typeof error === "object" &&
    error !== null &&
    "type" in error &&
    "resource" in error &&
    "reason" in error &&
    (error as { type?: unknown }).type === "conflict" &&
    (error as { resource?: unknown }).resource === "course" &&
    typeof (error as { reason?: unknown }).reason === "string"
  ) {
    return (error as { reason: string }).reason
  }

  return null
}

function toUserFacingSyncError(
  error: unknown,
  courseDisplayName: string,
): string {
  const reason = conflictReason(error)
  if (reason === "course-missing") {
    return `Could not save course "${courseDisplayName}" because it no longer exists. It may have been deleted while another save was still in progress.`
  }
  if (reason === "revision-invariant") {
    return `Could not save course "${courseDisplayName}" because a newer version exists. Reload the course and try again.`
  }

  return getErrorMessage(error, "Could not save course")
}

export function createCoursePersister(
  workflowClient: WorkflowClient,
): Persister {
  return createPersister<PersistedCourse, "course.save">({
    workflowClient,
    workflowId: "course.save",
    getSnapshot: () => {
      const state = useCourseStore.getState()
      return state.status === "loaded" ? state.course : null
    },
    subscribe: (listener) => useCourseStore.subscribe(listener),
    setSyncStatus: (status) => useCourseStore.getState().setSyncStatus(status),
    getSnapshotIdentity: (course) => course.id,
    formatTerminalError: (error, course) =>
      toUserFacingSyncError(error, course.displayName),
    classifyError: (error, course) => {
      const reason = conflictReason(error)
      if (reason === "revision-invariant" || reason === "course-missing") {
        return {
          kind: "pause",
          message: toUserFacingSyncError(error, course.displayName),
        }
      }
      return isRetryableWorkflowError(error)
        ? { kind: "retry" }
        : { kind: "terminal" }
    },
    applySaveResult: (result, course) => {
      const stamp = result as CourseSaveStamp
      useCourseStore.getState().applySaveStamp(course.id, stamp)
    },
  })
}

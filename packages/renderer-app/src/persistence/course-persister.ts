import type {
  CourseSaveStamp,
  WorkflowClient,
} from "@repo-edu/application-contract"
import type { PersistedCourse } from "@repo-edu/domain/types"
import { getErrorMessage } from "../utils/error-message.js"
import {
  createPersister,
  type PersistenceSyncStatus,
  type Persister,
} from "./create-persister.js"
import { isRetryableWorkflowError } from "./retry.js"

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

export type CoursePersisterWorkerOptions = {
  workflowClient: WorkflowClient
  getSnapshot: () => PersistedCourse | null
  subscribe: (listener: () => void) => () => void
  setSyncStatus: (status: PersistenceSyncStatus) => void
  applySaveResult: (result: CourseSaveStamp, snapshot: PersistedCourse) => void
}

export function createCoursePersisterWorker({
  workflowClient,
  getSnapshot,
  subscribe,
  setSyncStatus,
  applySaveResult,
}: CoursePersisterWorkerOptions): Persister {
  return createPersister<PersistedCourse, "course.save">({
    workflowClient,
    workflowId: "course.save",
    getSnapshot,
    subscribe,
    setSyncStatus,
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
    applySaveResult,
  })
}

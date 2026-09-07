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
  type WorkerStartGate,
} from "./create-persister.js"

export type CoursePersisterWorkerOptions = {
  startGate: WorkerStartGate
  workflowClient: WorkflowClient<"course.save">
  getSnapshot: () => PersistedCourse | null
  subscribe: (listener: () => void) => () => void
  setSyncStatus: (status: PersistenceSyncStatus) => void
  applySaveResult: (result: CourseSaveStamp, snapshot: PersistedCourse) => void
}

export function createCoursePersisterWorker({
  startGate,
  workflowClient,
  getSnapshot,
  subscribe,
  setSyncStatus,
  applySaveResult,
}: CoursePersisterWorkerOptions): Persister<PersistedCourse, CourseSaveStamp> {
  return createPersister<PersistedCourse, "course.save">({
    startGate,
    workflowClient,
    workflowId: "course.save",
    getSnapshot,
    subscribe,
    setSyncStatus,
    getSnapshotIdentity: (course) => course.id,
    formatTerminalError: (error) =>
      getErrorMessage(error, "Could not save course"),
    applySaveResult,
    savedSnapshot: (snapshot, stamp) => ({
      ...snapshot,
      revision: stamp.revision,
      updatedAt: stamp.updatedAt,
    }),
  })
}

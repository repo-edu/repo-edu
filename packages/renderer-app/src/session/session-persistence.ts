import type {
  CourseSaveStamp,
  WorkflowClient,
} from "@repo-edu/application-contract"
import type { PersistedCourse } from "@repo-edu/domain/types"
import { createCoursePersisterWorker } from "../persistence/course-persister.js"
import {
  idleSyncStatus,
  type PersistenceSyncStatus,
  type Persister,
} from "../persistence/create-persister.js"
import { runWithRetry } from "../persistence/retry.js"
import { useCourseStore } from "../stores/course-store.js"
import type { SessionTransactionScope } from "./session-surface-transactions.js"

type ActiveCourseWorkerSlot = {
  courseId: string
  worker: Persister
}

export class SessionPersistence {
  private activeCourseWorkerSlot: ActiveCourseWorkerSlot | null = null

  constructor(
    private readonly workflowClient: WorkflowClient,
    private readonly getActiveCourseId: () => string | null,
    private readonly setCourseSyncStatus: (
      status: PersistenceSyncStatus,
    ) => void,
  ) {}

  async loadCourse(courseId: string): Promise<PersistedCourse> {
    return await this.workflowClient.run("course.load", { courseId })
  }

  saveDetached(
    scope: SessionTransactionScope,
    course: PersistedCourse,
  ): Promise<CourseSaveStamp> {
    return scope.required(() =>
      runWithRetry(() => this.workflowClient.run("course.save", course), {
        isCancelled: () => !scope.canContinue(),
      }),
    )
  }

  deleteDetached(
    scope: SessionTransactionScope,
    courseId: string,
  ): Promise<void> {
    return scope.required(() =>
      this.workflowClient.run("course.delete", { courseId }),
    )
  }

  flushActive(scope: SessionTransactionScope): Promise<void> {
    return scope.required(async () => {
      await this.activeCourseWorkerSlot?.worker.flush()
    })
  }

  flushActiveTolerated(scope: SessionTransactionScope): Promise<void> {
    return scope.tolerated(async () => {
      await this.activeCourseWorkerSlot?.worker.flush()
    })
  }

  async flush(): Promise<void> {
    await this.activeCourseWorkerSlot?.worker.flush()
  }

  async waitForIdle(): Promise<void> {
    await this.activeCourseWorkerSlot?.worker.waitForIdle()
  }

  installCourse(courseId: string, loadedCourse: PersistedCourse | null): void {
    if (this.activeCourseWorkerSlot?.courseId !== courseId) {
      this.disposeActiveCourseWorker(false)
    }
    if (loadedCourse !== null) useCourseStore.getState().hydrate(loadedCourse)
    this.ensureActiveCourseWorker(courseId)
  }

  clearCourse(): void {
    this.disposeActiveCourseWorker(false)
    useCourseStore.getState().clear()
  }

  dispose(): void {
    this.disposeActiveCourseWorker(false)
  }

  private ensureActiveCourseWorker(courseId: string): void {
    if (this.activeCourseWorkerSlot?.courseId === courseId) return
    this.disposeActiveCourseWorker(false)
    const worker = createCoursePersisterWorker({
      workflowClient: this.workflowClient,
      getSnapshot: () => {
        const course = useCourseStore.getState().course
        return course?.id === courseId ? course : null
      },
      subscribe: (listener) => useCourseStore.subscribe(listener),
      setSyncStatus: this.setCourseSyncStatus,
      applySaveResult: (result, snapshot) => {
        if (
          this.activeCourseWorkerSlot?.courseId !== snapshot.id ||
          this.getActiveCourseId() !== snapshot.id
        )
          return
        useCourseStore.getState().applySaveStamp(snapshot.id, result)
      },
    })
    this.activeCourseWorkerSlot = { courseId, worker }
  }

  private disposeActiveCourseWorker(reportIdle = true): void {
    if (this.activeCourseWorkerSlot === null) return
    this.activeCourseWorkerSlot.worker.dispose()
    this.activeCourseWorkerSlot = null
    if (reportIdle) this.setCourseSyncStatus(idleSyncStatus)
  }
}

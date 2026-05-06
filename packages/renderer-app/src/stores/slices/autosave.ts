import type { PersistedAnalysis, PersistedCourse } from "@repo-edu/domain/types"
import { persistedAnalysisKind } from "@repo-edu/domain/types"
import { getWorkflowClient } from "../../contexts/workflow-client.js"
import { getErrorMessage } from "../../utils/error-message.js"
import type {
  CourseActions,
  CourseState,
  StoreGet,
  StoreInternals,
  StoreSet,
} from "./types.js"
import { AUTOSAVE_DEBOUNCE_MS, AUTOSAVE_RETRY_DELAYS_MS } from "./types.js"

function projectCourseToAnalysis(
  course: PersistedCourse,
  state: CourseState,
): PersistedAnalysis {
  const revision = state.analysisDocRevision ?? 0
  return {
    kind: persistedAnalysisKind,
    revision,
    id: state.analysisDocId ?? course.id,
    displayName: course.displayName,
    searchFolder: course.searchFolder,
    analysisInputs: course.analysisInputs,
    updatedAt: course.updatedAt,
  }
}

export function createAutosaveSlice(
  set: StoreSet,
  get: StoreGet,
): {
  internals: Pick<
    StoreInternals,
    | "clearAutosaveTimer"
    | "cancelPendingSave"
    | "scheduleAutosave"
    | "requestAutosave"
    | "waitForIdle"
  >
  actions: Pick<CourseActions, "save">
} {
  let autosaveTimer: ReturnType<typeof setTimeout> | null = null
  let saveRequested = false
  let saveWorkerRunning = false
  const idleResolvers = new Set<() => void>()

  const clearAutosaveTimer = () => {
    if (autosaveTimer !== null) {
      clearTimeout(autosaveTimer)
      autosaveTimer = null
    }
  }

  const resolveIdleWaiters = () => {
    if (saveWorkerRunning || saveRequested) {
      return
    }
    for (const resolve of idleResolvers) {
      resolve()
    }
    idleResolvers.clear()
  }

  const waitForIdle = async () => {
    if (!saveWorkerRunning && !saveRequested) {
      return
    }
    await new Promise<void>((resolve) => {
      idleResolvers.add(resolve)
    })
  }

  const isRetryableSaveError = (error: unknown): boolean => {
    const message = getErrorMessage(error).toLowerCase()
    if (message.includes("revision invariant violated")) {
      return false
    }
    if (typeof error === "object" && error !== null && "type" in error) {
      const appError = error as { type?: string; retryable?: boolean }
      if (appError.type === "validation" || appError.type === "not-found") {
        return false
      }
      if (appError.retryable === false) {
        return false
      }
    }
    return true
  }

  const toUserFacingSyncError = (
    error: unknown,
    courseDisplayName: string,
  ): string => {
    const raw = getErrorMessage(error, "Could not save course")
    const missingCourseMatch = raw.match(
      /^Course revision invariant violated for '([^']+)' \(expected \d+, stored missing course\)\.$/,
    )
    if (missingCourseMatch) {
      return `Could not save course "${courseDisplayName}" because it no longer exists. It may have been deleted while another save was still in progress. (Course ID: ${missingCourseMatch[1]})`
    }

    const staleRevisionMatch = raw.match(
      /^Course revision invariant violated for '([^']+)' \(expected (\d+), stored (\d+)\)\.$/,
    )
    if (staleRevisionMatch) {
      return `Could not save course "${courseDisplayName}" because a newer version exists (expected revision ${staleRevisionMatch[2]}, found ${staleRevisionMatch[3]}). Reload the course and try again. (Course ID: ${staleRevisionMatch[1]})`
    }

    return raw
  }

  const saveLatestSnapshot = async () => {
    const stateAtStart = get()
    const course = stateAtStart.course
    if (!course) {
      return true
    }

    const startLocalVersion = stateAtStart.localVersion
    const courseId = course.id
    let lastError: unknown = null

    for (
      let attempt = 0;
      attempt <= AUTOSAVE_RETRY_DELAYS_MS.length;
      attempt += 1
    ) {
      const savingIndicatorTimer = setTimeout(() => {
        set((draft) => {
          if (draft.course?.id !== courseId) return
          draft.syncState = "saving"
        })
      }, 500)

      try {
        const client = getWorkflowClient()
        let savedCourse: PersistedCourse
        let savedAnalysis: PersistedAnalysis | null = null
        if (stateAtStart.documentKind === "analysis") {
          const analysisDraft = projectCourseToAnalysis(course, stateAtStart)
          savedAnalysis = (await client.run(
            "analyses.save",
            analysisDraft,
          )) as PersistedAnalysis
          savedCourse = {
            ...course,
            revision: course.revision + 1,
            updatedAt: savedAnalysis.updatedAt,
          }
        } else {
          savedCourse = (await client.run(
            "course.save",
            course,
          )) as PersistedCourse
        }
        clearTimeout(savingIndicatorTimer)

        set((draft) => {
          if (!draft.course || draft.course.id !== courseId) {
            return
          }
          draft.lastSavedRevision = savedCourse.revision
          draft.syncState = "idle"
          if (savedAnalysis !== null) {
            draft.analysisDocRevision = savedAnalysis.revision
          }

          if (draft.localVersion === startLocalVersion) {
            draft.course = savedCourse
            return
          }

          // Preserve newer local edits while advancing revision baseline.
          draft.course.revision = savedCourse.revision
        })
        return true
      } catch (error) {
        clearTimeout(savingIndicatorTimer)
        lastError = error
        const canRetry =
          attempt < AUTOSAVE_RETRY_DELAYS_MS.length &&
          isRetryableSaveError(error)
        if (canRetry) {
          const delayMs = AUTOSAVE_RETRY_DELAYS_MS[attempt]
          await new Promise((resolve) => setTimeout(resolve, delayMs))
          continue
        }

        const message = toUserFacingSyncError(error, course.displayName)
        if (get().course?.id === courseId) {
          set((draft) => {
            if (draft.course?.id !== courseId) {
              return
            }
            draft.syncState = "error"
            draft.syncError = message
          })
        }
        break
      }
    }

    void lastError
    return false
  }

  const requestAutosave = () => {
    saveRequested = true
    if (saveWorkerRunning) {
      return
    }

    saveWorkerRunning = true
    void (async () => {
      while (saveRequested) {
        saveRequested = false
        await saveLatestSnapshot()
      }
      saveWorkerRunning = false
      resolveIdleWaiters()
    })()
  }

  const scheduleAutosave = () => {
    clearAutosaveTimer()
    autosaveTimer = setTimeout(() => {
      autosaveTimer = null
      requestAutosave()
    }, AUTOSAVE_DEBOUNCE_MS)
  }

  const cancelPendingSave = () => {
    clearAutosaveTimer()
    saveRequested = false
  }

  return {
    internals: {
      clearAutosaveTimer,
      cancelPendingSave,
      scheduleAutosave,
      requestAutosave,
      waitForIdle,
    },
    actions: {
      save: async () => {
        clearAutosaveTimer()
        if (!get().course) {
          return true
        }
        requestAutosave()
        await waitForIdle()
        return get().syncState !== "error"
      },
    },
  }
}

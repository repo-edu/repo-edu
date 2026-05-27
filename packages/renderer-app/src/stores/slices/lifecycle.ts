import { ensureSystemGroupSets } from "@repo-edu/domain/group-set"
import type {
  Group,
  GroupSet,
  PersistedCourse,
  RosterValidationResult,
} from "@repo-edu/domain/types"
import { courseHasRoster } from "@repo-edu/domain/types"
import { validateAssignment, validateRoster } from "@repo-edu/domain/validation"
import { getWorkflowClient } from "../../contexts/workflow-client.js"
import { getErrorMessage } from "../../utils/error-message.js"
import { buildIssueCards } from "../../utils/issues.js"
import type { CourseActions, StoreGet, StoreSet } from "./types.js"
import { initialState } from "./types.js"

export function createLifecycleSlice(
  set: StoreSet,
  get: StoreGet,
): Pick<
  CourseActions,
  | "load"
  | "clear"
  | "setSyncStatus"
  | "dismissSyncError"
  | "applySaveStamp"
  | "ensureSystemGroupSets"
  | "runChecks"
> {
  let loadRequestId = 0

  return {
    load: async (courseId) => {
      const requestId = ++loadRequestId
      try {
        set((draft) => {
          draft.status = "loading"
          draft.error = null
        })
        const client = getWorkflowClient()
        const loaded = await client.run("course.load", { courseId })
        const loadedCourse = loaded as PersistedCourse
        if (courseHasRoster(loadedCourse)) {
          const sysResult = ensureSystemGroupSets(
            loadedCourse.roster,
            loadedCourse.idSequences,
          )
          loadedCourse.idSequences = sysResult.idSequences
        }
        if (requestId !== loadRequestId) {
          return
        }
        set((draft) => {
          draft.course = loadedCourse
          draft.status = "loaded"
          draft.history = []
          draft.future = []
          draft.assignmentSelection = null
          draft.checksDirty = true
          draft.systemSetsReady = true
          draft.syncStatus = initialState.syncStatus
        })
      } catch (err) {
        if (requestId !== loadRequestId) {
          return
        }
        set((draft) => {
          draft.status = "error"
          draft.error = getErrorMessage(err)
        })
      }
    },

    clear: () => {
      loadRequestId += 1
      set((draft) => {
        Object.assign(draft, initialState)
      })
    },

    setSyncStatus: (syncStatus) => {
      set((draft) => {
        draft.syncStatus = syncStatus
      })
    },

    dismissSyncError: () => {
      set((draft) => {
        if (draft.syncStatus.state === "error") {
          draft.syncStatus = initialState.syncStatus
        }
      })
    },

    applySaveStamp: (courseId, stamp) => {
      set((draft) => {
        if (draft.course?.id !== courseId) return
        draft.course.revision = stamp.revision
        draft.course.updatedAt = stamp.updatedAt
      })
    },

    ensureSystemGroupSets: () => {
      const state = get()
      if (!state.course) return
      if (!courseHasRoster(state.course)) {
        set((draft) => {
          draft.systemSetsReady = true
        })
        return
      }
      const result = ensureSystemGroupSets(
        state.course.roster,
        state.course.idSequences,
      )

      const hasChanges =
        result.groupsUpserted.length > 0 || result.deletedGroupIds.length > 0

      if (!hasChanges) {
        set((draft) => {
          draft.systemSetsReady = true
        })
        return
      }

      set((draft) => {
        if (!draft.course) return
        const roster = draft.course.roster

        // Apply upserted groups.
        const upsertedIds = new Set(result.groupsUpserted.map((g) => g.id))
        roster.groups = roster.groups.filter((g) => !upsertedIds.has(g.id))
        roster.groups.push(...(result.groupsUpserted as Group[]))

        // Remove deleted groups.
        const deletedIds = new Set(result.deletedGroupIds)
        roster.groups = roster.groups.filter((g) => !deletedIds.has(g.id))

        // Upsert system group sets.
        const systemSetIds = new Set(result.groupSets.map((gs) => gs.id))
        roster.groupSets = roster.groupSets.filter(
          (gs) => !systemSetIds.has(gs.id),
        )
        roster.groupSets.push(...(result.groupSets as GroupSet[]))

        draft.course.idSequences = result.idSequences
        draft.systemSetsReady = true
        draft.checksDirty = true
      })
    },

    runChecks: (identityMode) => {
      const state = get()
      if (!state.course) return
      const roster = state.course.roster
      const rosterResult = courseHasRoster(state.course)
        ? validateRoster(roster)
        : { issues: [] }

      set((draft) => {
        draft.checksStatus = "running"
        draft.checksError = null
      })

      try {
        const assignmentResults: Record<string, RosterValidationResult> = {}
        for (const assignment of roster.assignments) {
          assignmentResults[assignment.id] = validateAssignment(
            roster,
            assignment.id,
            identityMode,
          )
        }

        const cards = buildIssueCards(roster, rosterResult, assignmentResults)

        set((draft) => {
          draft.rosterValidation = rosterResult
          draft.assignmentValidations = assignmentResults
          draft.issueCards = cards
          draft.checksStatus = "ready"
          draft.checksDirty = false
        })
      } catch (err) {
        set((draft) => {
          draft.checksStatus = "error"
          draft.checksError = getErrorMessage(err)
        })
      }
    },
  }
}

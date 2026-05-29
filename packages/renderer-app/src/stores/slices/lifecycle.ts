import { ensureSystemGroupSets } from "@repo-edu/domain/group-set"
import type { RosterValidationResult } from "@repo-edu/domain/types"
import { courseHasRoster } from "@repo-edu/domain/types"
import { validateAssignment, validateRoster } from "@repo-edu/domain/validation"
import { getErrorMessage } from "../../utils/error-message.js"
import { buildIssueCards } from "../../utils/issues.js"
import type { CourseActions, StoreGet, StoreSet } from "./types.js"
import { initialState } from "./types.js"

export function createLifecycleSlice(
  set: StoreSet,
  get: StoreGet,
): Pick<
  CourseActions,
  "hydrate" | "clear" | "applySaveStamp" | "ensureSystemGroupSets" | "runChecks"
> {
  return {
    hydrate: (course) => {
      set((draft) => {
        draft.course = course
        draft.warnings = []
        draft.history = []
        draft.future = []
        draft.assignmentSelection = null
        draft.checksDirty = true
        draft.systemSetsReady = true
        draft.rosterValidation = null
        draft.assignmentValidations = {}
        draft.issueCards = []
        draft.checksStatus = "idle"
        draft.checksError = null
      })
    },

    clear: () => {
      set((draft) => {
        Object.assign(draft, initialState)
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
      set((draft) => {
        if (!draft.course) return
        if (!courseHasRoster(draft.course)) {
          draft.systemSetsReady = true
          return
        }
        const result = ensureSystemGroupSets(
          draft.course.roster,
          draft.course.idSequences,
        )
        draft.course.idSequences = result.idSequences
        draft.systemSetsReady = true
        if (
          result.groupsUpserted.length > 0 ||
          result.deletedGroupIds.length > 0
        ) {
          draft.checksDirty = true
        }
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

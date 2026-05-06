import { ensureSystemGroupSets } from "@repo-edu/domain/group-set"
import type {
  Group,
  GroupSet,
  PersistedAnalysis,
  PersistedCourse,
  RosterValidationResult,
} from "@repo-edu/domain/types"
import { initialIdSequences, persistedCourseKind } from "@repo-edu/domain/types"
import { validateAssignment, validateRoster } from "@repo-edu/domain/validation"
import { getWorkflowClient } from "../../contexts/workflow-client.js"
import { getErrorMessage } from "../../utils/error-message.js"
import { buildIssueCards } from "../../utils/issues.js"
import type {
  CourseActions,
  StoreGet,
  StoreInternals,
  StoreSet,
} from "./types.js"
import { initialState } from "./types.js"

/**
 * Synthesize a course-shaped working document from a persisted Analysis.
 * The renderer stores either kind in the course slice; saves dispatch back
 * to the right workflow based on `documentKind`.
 */
function projectAnalysisToCourseShape(
  analysis: PersistedAnalysis,
): PersistedCourse {
  return {
    kind: persistedCourseKind,
    revision: 0,
    id: analysis.id,
    displayName: analysis.displayName,
    lmsConnectionName: null,
    organization: null,
    lmsCourseId: null,
    idSequences: initialIdSequences(),
    roster: {
      connection: null,
      students: [],
      staff: [],
      groups: [],
      groupSets: [],
      assignments: [],
    },
    repositoryTemplate: null,
    searchFolder: analysis.searchFolder,
    analysisInputs: analysis.analysisInputs,
    updatedAt: analysis.updatedAt,
  }
}

export function createLifecycleSlice(
  set: StoreSet,
  get: StoreGet,
  internals: StoreInternals,
): Pick<
  CourseActions,
  "load" | "loadAnalysis" | "clear" | "ensureSystemGroupSets" | "runChecks"
> {
  return {
    load: async (courseId) => {
      const currentCourseId = get().course?.id ?? null
      if (currentCourseId !== null && currentCourseId !== courseId) {
        await get().save()
      }
      try {
        set((draft) => {
          draft.status = "loading"
          draft.error = null
        })
        const client = getWorkflowClient()
        const loaded = await client.run("course.load", { courseId })
        const loadedCourse = loaded as PersistedCourse
        const sysResult = ensureSystemGroupSets(
          loadedCourse.roster,
          loadedCourse.idSequences,
        )
        loadedCourse.idSequences = sysResult.idSequences
        set((draft) => {
          draft.course = loadedCourse
          draft.documentKind = "course"
          draft.analysisDocId = null
          draft.analysisDocRevision = null
          draft.status = "loaded"
          draft.history = []
          draft.future = []
          draft.assignmentSelection = null
          draft.checksDirty = true
          draft.systemSetsReady = true
          draft.localVersion = 0
          draft.lastSavedRevision = loadedCourse.revision
          draft.syncState = "idle"
        })
      } catch (err) {
        set((draft) => {
          draft.status = "error"
          draft.error = getErrorMessage(err)
        })
      }
    },

    loadAnalysis: async (analysisId) => {
      const currentDocumentId = get().course?.id ?? null
      if (currentDocumentId !== null && currentDocumentId !== analysisId) {
        await get().save()
      }
      try {
        set((draft) => {
          draft.status = "loading"
          draft.error = null
        })
        const client = getWorkflowClient()
        const loaded = await client.run("analyses.load", { analysisId })
        const loadedAnalysis = loaded as PersistedAnalysis
        const projected = projectAnalysisToCourseShape(loadedAnalysis)
        set((draft) => {
          draft.course = projected
          draft.documentKind = "analysis"
          draft.analysisDocId = loadedAnalysis.id
          draft.analysisDocRevision = loadedAnalysis.revision
          draft.status = "loaded"
          draft.history = []
          draft.future = []
          draft.assignmentSelection = null
          draft.checksDirty = false
          draft.systemSetsReady = true
          draft.localVersion = 0
          draft.lastSavedRevision = loadedAnalysis.revision
          draft.syncState = "idle"
        })
      } catch (err) {
        set((draft) => {
          draft.status = "error"
          draft.error = getErrorMessage(err)
        })
      }
    },

    clear: () => {
      internals.cancelPendingSave()
      set((draft) => {
        Object.assign(draft, initialState)
      })
    },

    ensureSystemGroupSets: () => {
      const state = get()
      if (!state.course) return
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
        draft.course.updatedAt = new Date().toISOString()
        draft.systemSetsReady = true
        draft.checksDirty = true
      })
      internals.markCourseMutated()
    },

    runChecks: (identityMode) => {
      const state = get()
      if (!state.course) return
      const roster = state.course.roster

      set((draft) => {
        draft.checksStatus = "running"
        draft.checksError = null
      })

      try {
        const rosterResult = validateRoster(roster)
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

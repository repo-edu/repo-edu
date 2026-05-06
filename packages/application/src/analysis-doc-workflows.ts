import type {
  DiagnosticOutput,
  MilestoneProgress,
  WorkflowCallOptions,
  WorkflowHandlerMap,
} from "@repo-edu/application-contract"
import { validatePersistedAnalysis } from "@repo-edu/domain/schemas"
import type {
  AnalysisSummary,
  DocumentSummary,
  PersistedAnalysis,
} from "@repo-edu/domain/types"
import {
  type AnalysisStore,
  type CourseStore,
  createValidationAppError,
} from "./core.js"
import {
  loadRequiredAnalysis,
  throwIfAborted,
  validateLoadedAnalysis,
  validateLoadedCourse,
} from "./workflow-helpers.js"

function summarizeAnalysis(analysis: PersistedAnalysis): AnalysisSummary {
  return {
    id: analysis.id,
    displayName: analysis.displayName,
    updatedAt: analysis.updatedAt,
  }
}

function sortByUpdatedAt<T extends { updatedAt: string }>(
  items: readonly T[],
): T[] {
  return [...items].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  )
}

export function createAnalysisDocWorkflowHandlers(
  analysisStore: AnalysisStore,
): Pick<
  WorkflowHandlerMap<
    "analyses.list" | "analyses.load" | "analyses.save" | "analyses.delete"
  >,
  "analyses.list" | "analyses.load" | "analyses.save" | "analyses.delete"
> {
  return {
    "analyses.list": async (_input, options) => {
      throwIfAborted(options?.signal)
      const analyses = await analysisStore.listAnalyses(options?.signal)
      throwIfAborted(options?.signal)
      return sortByUpdatedAt(analyses)
        .map(validateLoadedAnalysis)
        .map(summarizeAnalysis)
    },
    "analyses.load": async (
      input: { analysisId: string },
      options?: WorkflowCallOptions<MilestoneProgress, DiagnosticOutput>,
    ) => {
      options?.onProgress?.({
        step: 1,
        totalSteps: 2,
        label: "Resolving analysis from analysis store.",
      })
      const analysis = await loadRequiredAnalysis(
        analysisStore,
        input.analysisId,
        options?.signal,
      )
      options?.onOutput?.({
        channel: "info",
        message: `Loaded analysis ${analysis.displayName}.`,
      })
      options?.onProgress?.({
        step: 2,
        totalSteps: 2,
        label: "Analysis loaded.",
      })
      return analysis
    },
    "analyses.save": async (
      input: PersistedAnalysis,
      options?: WorkflowCallOptions<MilestoneProgress, DiagnosticOutput>,
    ) => {
      options?.onProgress?.({
        step: 1,
        totalSteps: 3,
        label: "Validating analysis payload.",
      })
      const validation = validatePersistedAnalysis(input)
      if (!validation.ok) {
        throw createValidationAppError(
          "Analysis validation failed.",
          validation.issues,
        )
      }

      options?.onOutput?.({
        channel: "info",
        message: `Saving analysis ${validation.value.displayName}.`,
      })
      options?.onProgress?.({
        step: 2,
        totalSteps: 3,
        label: "Writing analysis to analysis store.",
      })
      const savedAnalysis = await analysisStore.saveAnalysis(
        validation.value,
        options?.signal,
      )
      options?.onProgress?.({
        step: 3,
        totalSteps: 3,
        label: "Analysis saved.",
      })
      return savedAnalysis
    },
    "analyses.delete": async (input: { analysisId: string }, options) => {
      throwIfAborted(options?.signal)
      await analysisStore.deleteAnalysis(input.analysisId, options?.signal)
    },
  }
}

export function createDocumentsListWorkflowHandler(
  analysisStore: AnalysisStore,
  courseStore: CourseStore,
): Pick<WorkflowHandlerMap<"documents.list">, "documents.list"> {
  return {
    "documents.list": async (_input, options) => {
      throwIfAborted(options?.signal)
      const [analyses, courses] = await Promise.all([
        Promise.resolve(analysisStore.listAnalyses(options?.signal)),
        Promise.resolve(courseStore.listCourses(options?.signal)),
      ])
      throwIfAborted(options?.signal)
      const summaries: DocumentSummary[] = [
        ...analyses.map(validateLoadedAnalysis).map((analysis) => ({
          kind: "analysis" as const,
          id: analysis.id,
          displayName: analysis.displayName,
          updatedAt: analysis.updatedAt,
        })),
        ...courses.map(validateLoadedCourse).map((course) => ({
          kind: "course" as const,
          id: course.id,
          displayName: course.displayName,
          courseKind: course.courseKind,
          updatedAt: course.updatedAt,
        })),
      ]
      return summaries.sort((left, right) =>
        right.updatedAt.localeCompare(left.updatedAt),
      )
    },
  }
}

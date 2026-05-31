import type {
  ExaminationQuestion,
  ExaminationSourceReference,
} from "@repo-edu/application-contract"
import type { LlmEffort } from "@repo-edu/integrations-llm-contract"
import type { ExaminationEntry } from "../../../stores/examination-store.js"
import type { ExaminationDisplaySelection } from "./display-selectors.js"

export const MAX_EXAMINATION_QUESTION_COUNT = 20

export type ExaminationGenerationPlan = {
  seedQuestions: ExaminationQuestion[]
  sourceReferences: ExaminationSourceReference[]
  requestedQuestionCount: number
  additionalQuestionCount: number
  targetQuestionCount: number
  capped: boolean
}

export function resolveExaminationGenerationPlan(params: {
  display: Pick<ExaminationDisplaySelection, "archiveEntry" | "displayEntry">
  modelCode: string
  effort: LlmEffort
  questionCount: number
  regenerate: boolean
  maxQuestionCount?: number
}): ExaminationGenerationPlan {
  const maxQuestionCount =
    params.maxQuestionCount ?? MAX_EXAMINATION_QUESTION_COUNT
  const seedEntry = selectSeedEntry(params)
  const seedQuestions = seedEntry?.questions ?? []
  const requestedQuestionCount =
    params.regenerate && params.display.archiveEntry !== null
      ? params.display.archiveEntry.questionCount
      : params.questionCount
  const remainingQuestionCount = Math.max(
    maxQuestionCount - seedQuestions.length,
    0,
  )
  const additionalQuestionCount = Math.min(
    requestedQuestionCount,
    remainingQuestionCount,
  )

  return {
    seedQuestions,
    sourceReferences: seedEntry?.sourceReferences ?? [],
    requestedQuestionCount,
    additionalQuestionCount,
    targetQuestionCount: seedQuestions.length + additionalQuestionCount,
    capped: additionalQuestionCount < requestedQuestionCount,
  }
}

function selectSeedEntry(params: {
  display: Pick<ExaminationDisplaySelection, "archiveEntry" | "displayEntry">
  modelCode: string
  effort: LlmEffort
  regenerate: boolean
}): ExaminationEntry | null {
  const entry = params.display.displayEntry
  if (params.regenerate || entry?.status !== "loaded") return null
  if (entry.archivedModel === params.modelCode) {
    return entry.archivedEffort === params.effort ? entry : null
  }
  if (entry.archivedModel !== null || entry.archivedEffort !== null) {
    return null
  }
  const archiveEntry = params.display.archiveEntry
  if (archiveEntry === null) return null
  return archiveEntry.model === params.modelCode &&
    archiveEntry.effort === params.effort
    ? entry
    : null
}

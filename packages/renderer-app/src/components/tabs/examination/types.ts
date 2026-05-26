import type {
  ExaminationCodeExcerpt,
  ExaminationLocalIdentityContext,
} from "@repo-edu/application-contract"
import type { LlmEffort } from "@repo-edu/integrations-llm-contract"
import type { ExaminationEntry } from "../../../stores/examination-store.js"

export type SubmissionExaminationContext = {
  pendingSourceKey: string
  personId: string
  displayTitle: string
  displaySubtitle: string
  contentScopeId: string
  localIdentityContext: ExaminationLocalIdentityContext
  excerpts: ExaminationCodeExcerpt[]
  excerptFileSources: Record<string, string>
}

export type GeneratedQuestionSets = ReadonlyMap<string, number>

export type GeneratedQuestionSetsByPersonId = ReadonlyMap<
  string,
  GeneratedQuestionSets
>

export type AvailableArchiveEntry = {
  key: string
  questionCount: number
  model: string
  effort: LlmEffort
  entry: ExaminationEntry
}

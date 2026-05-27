import type { LlmEffort } from "@repo-edu/integrations-llm-contract"
import type { ExaminationEntry } from "../../../stores/examination-store.js"

export type AvailableArchiveEntry = {
  key: string
  questionCount: number
  model: string
  effort: LlmEffort
  entry: ExaminationEntry
}

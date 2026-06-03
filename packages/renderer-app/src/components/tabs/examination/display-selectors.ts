import type {
  ExaminationDisplayedEntryState,
  ExaminationEntry,
} from "../../../stores/examination-store-types.js"
import type { AvailableArchiveEntry } from "./types.js"

export type ExaminationDisplaySelection = {
  entry: ExaminationEntry | null
  archiveEntry: AvailableArchiveEntry | null
  displayEntry: ExaminationEntry | null
  isLoading: boolean
  hasDisplayResults: boolean
  hasPartialQuestions: boolean
  canRegenerate: boolean
  canToggleAnswers: boolean
  canCopyMarkdown: boolean
}

export function selectExaminationDisplay(params: {
  displayedState: ExaminationDisplayedEntryState
  entriesByKey: ReadonlyMap<string, ExaminationEntry>
  archiveEntries: readonly AvailableArchiveEntry[]
  blocker: string | null
}): ExaminationDisplaySelection {
  const entryKey =
    params.displayedState.kind === "idle"
      ? null
      : params.displayedState.entryKey
  const entry =
    entryKey === null ? null : (params.entriesByKey.get(entryKey) ?? null)
  const archiveEntry =
    entryKey === null
      ? null
      : (params.archiveEntries.find(
          (candidate) => candidate.key === entryKey,
        ) ?? null)
  const isLoading = entry?.status === "loading"
  const hasPartialQuestions =
    isLoading && entry !== null && entry.questions.length > 0
  const displayEntry =
    hasPartialQuestions && entry !== null
      ? entry
      : (archiveEntry?.entry ?? (entry?.status === "loaded" ? entry : null))
  const hasDisplayResults =
    displayEntry !== null && displayEntry.questions.length > 0
  return {
    entry,
    archiveEntry,
    displayEntry,
    isLoading,
    hasDisplayResults,
    hasPartialQuestions,
    canRegenerate:
      !isLoading &&
      displayEntry?.status === "loaded" &&
      params.blocker === null,
    canToggleAnswers: hasDisplayResults,
    canCopyMarkdown: displayEntry?.status === "loaded",
  }
}

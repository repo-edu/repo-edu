import type { ExaminationGenerateQuestionsResult } from "@repo-edu/application-contract"
import { serializeExaminationArchiveStorageKey } from "@repo-edu/application-contract"
import type { ExaminationEntry } from "../../../stores/examination-store.js"
import type { AvailableArchiveEntry } from "./types.js"

export function toAvailableArchiveEntry(
  result: ExaminationGenerateQuestionsResult,
): AvailableArchiveEntry {
  return {
    key: serializeExaminationArchiveStorageKey(result.key),
    questionCount: result.archivedProvenance.questionCount,
    model: result.archivedProvenance.model,
    effort: result.archivedProvenance.effort,
    entry: toExaminationEntry(result),
  }
}

export function toExaminationEntry(
  result: ExaminationGenerateQuestionsResult,
): ExaminationEntry {
  return {
    status: "loaded",
    questions: result.questions,
    usage: result.usage,
    errorMessage: null,
    generatedAt: new Date(result.archivedProvenance.createdAtMs).toISOString(),
    fromArchive: result.fromArchive,
    sourceReferences: result.sourceReferences,
    archivedQuestionCount: result.archivedProvenance.questionCount,
    archivedModel: result.archivedProvenance.model,
    archivedEffort: result.archivedProvenance.effort,
    partialQuestionCount:
      result.requestedQuestionCount > result.archivedProvenance.questionCount
        ? {
            requested: result.requestedQuestionCount,
            accepted: result.archivedProvenance.questionCount,
          }
        : null,
    generationProgressLabel: null,
    streamedResponseCharacterCount: 0,
    streamedResponsePreview: "",
    inProgressQuestion: null,
    generationControlId: null,
    stopRequested: false,
  }
}

export function mergeAvailableArchiveEntries(
  current: readonly AvailableArchiveEntry[],
  incoming: readonly AvailableArchiveEntry[],
): AvailableArchiveEntry[] {
  const byKey = new Map<string, AvailableArchiveEntry>()
  for (const entry of current) {
    byKey.set(entry.key, entry)
  }
  for (const entry of incoming) {
    byKey.set(entry.key, entry)
  }
  return [...byKey.values()].sort(compareAvailableArchiveEntries)
}

function compareAvailableArchiveEntries(
  a: AvailableArchiveEntry,
  b: AvailableArchiveEntry,
): number {
  const aTime =
    a.entry.generatedAt === null ? 0 : Date.parse(a.entry.generatedAt)
  const bTime =
    b.entry.generatedAt === null ? 0 : Date.parse(b.entry.generatedAt)
  if (aTime !== bTime) return bTime - aTime
  return a.questionCount - b.questionCount
}

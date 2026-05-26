import type {
  ExaminationQuestion,
  ExaminationSourceReference,
} from "@repo-edu/application-contract"

export function formatQuestionReference(
  question: ExaminationQuestion,
  sourceReferences: readonly ExaminationSourceReference[],
): string | null {
  const { sourceId, lineRange } = question.anchor
  if (sourceId === null) return null
  const reference = sourceReferences.find((item) => item.sourceId === sourceId)
  const range = lineRange === null ? "" : `:${lineRange.start}-${lineRange.end}`
  if (reference === undefined || reference.occurrences.length !== 1) {
    return `${sourceId}${range}`
  }
  const occurrence = reference.occurrences[0]
  return occurrence === undefined
    ? `${sourceId}${range}`
    : `${occurrence.filePath}${range}`
}

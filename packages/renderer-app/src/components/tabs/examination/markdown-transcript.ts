import type {
  ExaminationQuestion,
  ExaminationSourceReference,
} from "@repo-edu/application-contract"
import { formatQuestionReference } from "./question-format.js"

export function buildMarkdownTranscript(params: {
  authorName: string
  authorEmail: string
  questions: ExaminationQuestion[]
  sourceReferences: ExaminationSourceReference[]
}): string {
  const lines: string[] = [
    `# Oral examination - ${params.authorName}`,
    `_${params.authorEmail}_`,
    "",
  ]
  for (const [index, question] of params.questions.entries()) {
    lines.push(`## Q${index + 1}. ${question.question}`)
    const reference = formatQuestionReference(question, params.sourceReferences)
    if (reference !== null) {
      lines.push(`_Reference: ${reference}_`)
    }
    lines.push("")
    lines.push(`**Answer:** ${question.answer}`)
    lines.push("")
  }
  return lines.join("\n")
}

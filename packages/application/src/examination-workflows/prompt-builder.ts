import type {
  ExaminationCodeExcerpt,
  ExaminationGenerateQuestionsInput,
} from "@repo-edu/application-contract"

export function buildExaminationPrompt(
  input: ExaminationGenerateQuestionsInput,
): string {
  const header = [
    "You are preparing questions for a one-on-one oral examination.",
    "The student below is a member of a group software project.",
    "Using only the code excerpts that git blame attributes to this student in the final repository state, produce questions that probe whether the student genuinely understands the code they signed their name to.",
    "",
    `Student name: ${input.memberName}`,
    `Student email: ${input.memberEmail}`,
    input.assignmentContext
      ? `\nAssignment context: ${input.assignmentContext}`
      : "",
  ]
    .filter((line) => line !== "")
    .join("\n")

  const excerpts = input.excerpts
    .map((excerpt, index) => formatExcerpt(excerpt, index))
    .join("\n\n")

  const instructions = [
    `Generate exactly ${input.questionCount} questions.`,
    "For each question:",
    "- Focus on specific lines in the student's code. Prefer 'why' and 'how' over 'what'.",
    "- Include an answer key the teacher can use. The answer must be factually grounded in the excerpt.",
    "- Reference the excerpt by filePath and lineRange {start, end} (1-based, inclusive) whenever the question targets specific lines.",
    "- Vary depth: at least one question about a tricky invariant, one about a design choice, one that asks the student to predict the effect of a small change.",
    "- Do not invent code that is not in the excerpts.",
    "",
    "Return STRICT JSON matching this shape, with no prose and no markdown fences:",
    '{"questions":[{"question":"...","answer":"...","filePath":"path/to/file.ts","lineRange":{"start":10,"end":14}}]}',
    "Use null for filePath and lineRange only when the question genuinely spans the whole contribution.",
  ].join("\n")

  return [header, "", "Code excerpts:", excerpts, "", instructions].join("\n")
}

function formatExcerpt(excerpt: ExaminationCodeExcerpt, index: number): string {
  const endLine = excerpt.startLine + excerpt.lines.length - 1
  const numbered = excerpt.lines
    .map((line, offset) => `${excerpt.startLine + offset}: ${line}`)
    .join("\n")
  return `Excerpt ${index + 1} — ${excerpt.filePath} (lines ${excerpt.startLine}-${endLine}):\n${numbered}`
}

export function stripJsonFences(text: string): string {
  const trimmed = text.trim()
  if (!trimmed.startsWith("```")) return trimmed
  return trimmed
    .replace(/^```(?:json)?\s*/, "")
    .replace(/\s*```$/, "")
    .trim()
}

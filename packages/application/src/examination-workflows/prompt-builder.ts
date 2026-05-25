import type {
  ExaminationProviderPromptExcerpt,
  ExaminationProviderPromptPayload,
} from "./provider-excerpts.js"

export function buildExaminationPrompt(
  payload: ExaminationProviderPromptPayload,
): string {
  const header = [
    "You are preparing questions for a one-on-one oral examination.",
    "The selected contributor below contributed to a software project.",
    "Using only the redacted code excerpts attributed to the selected contributor in the final repository state, produce questions that probe whether the contributor genuinely understands the code they contributed.",
    "",
    `Contributor label: ${payload.anonymousContributorLabel}`,
  ]
    .filter((line) => line !== "")
    .join("\n")

  const excerpts = payload.excerpts
    .map((excerpt, index) => formatExcerpt(excerpt, index))
    .join("\n\n")
  const exampleSourceId = payload.excerpts[0]?.sourceId ?? "SRC1"

  const instructions = [
    `Generate exactly ${payload.questionCount} questions.`,
    "For each question:",
    "- Focus on specific lines in the selected contributor's code. Prefer 'why' and 'how' over 'what'.",
    "- Include an answer key the teacher can use. The answer must be factually grounded in the excerpt.",
    "- Reference the excerpt with anchor.sourceId and anchor.lineRange {start, end} (1-based, inclusive) whenever the question targets specific lines.",
    "- Vary depth: at least one question about a tricky invariant, one about a design choice, one that asks the student to predict the effect of a small change.",
    "- Do not invent code that is not in the excerpts.",
    "- Do not include names, email addresses, usernames, roster identifiers, repository paths, or file paths in the output.",
    "",
    "Return STRICT JSON matching this shape, with no prose and no markdown fences:",
    `{"questions":[{"question":"...","answer":"...","anchor":{"sourceId":"${exampleSourceId}","lineRange":{"start":10,"end":14}}}]}`,
    "Use null for anchor.sourceId and anchor.lineRange only when the question genuinely spans the whole contribution.",
  ].join("\n")

  return [
    header,
    "",
    "Redacted code excerpts:",
    excerpts,
    "",
    instructions,
  ].join("\n")
}

function formatExcerpt(
  excerpt: ExaminationProviderPromptExcerpt,
  index: number,
): string {
  const endLine = excerpt.startLine + excerpt.lines.length - 1
  const numbered = excerpt.lines
    .map((line, offset) => `${excerpt.startLine + offset}: ${line}`)
    .join("\n")
  return `Excerpt ${index + 1} (${excerpt.sourceId}, ${excerpt.sourceDescriptor}, lines ${excerpt.startLine}-${endLine}):\n${numbered}`
}

export function stripJsonFences(text: string): string {
  const trimmed = text.trim()
  if (!trimmed.startsWith("```")) return trimmed
  return trimmed
    .replace(/^```(?:json)?\s*/, "")
    .replace(/\s*```$/, "")
    .trim()
}

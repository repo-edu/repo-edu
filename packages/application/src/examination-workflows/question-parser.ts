import type {
  AppError,
  ExaminationGenerateOutput,
  ExaminationLineRange,
  ExaminationQuestion,
  ExaminationSourceAnchor,
  ExaminationSourceReference,
  MilestoneProgress,
  WorkflowCallOptions,
} from "@repo-edu/application-contract"
import { Allow, parse as parsePartialJson } from "partial-json"
import { stripJsonFences } from "./prompt-builder.js"

const STREAM_PREVIEW_MAX_CHARS = 2_000

export type PartialQuestionEmissionState = {
  acceptedQuestions: ExaminationQuestion[]
  emittedQuestionCount: number
  warnedOverQuota: boolean
  emittedInProgressQuestion: string
  emittedInProgressAnswer: string
}

export function maybeEmitPartial(params: {
  buffer: string
  emittedQuestionCount: PartialQuestionEmissionState
  onOutput: WorkflowCallOptions<
    MilestoneProgress,
    ExaminationGenerateOutput
  >["onOutput"]
  seedQuestions: readonly ExaminationQuestion[]
  sourceLineRanges: SourceLineRangeIndex
  sourceReferences: ExaminationSourceReference[]
  requestedQuestionCount: number
  onOverQuota(actualCount: number): void
  assertOutputAllowed(questions: readonly ExaminationQuestion[]): void
}): void {
  let parsed: unknown
  try {
    parsed = parsePartialJson(
      stripOpeningJsonFence(params.buffer),
      Allow.OBJ | Allow.ARR | Allow.STR,
    )
  } catch {
    return
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.questions)) return

  const completeQuestions: ExaminationQuestion[] = []
  let firstIncompleteRaw: unknown = null
  for (const raw of parsed.questions) {
    const question = coerceCompleteStreamQuestion(raw, params.sourceLineRanges)
    if (question === null) {
      firstIncompleteRaw = raw
      break
    }
    completeQuestions.push(question)
  }
  if (completeQuestions.length > params.requestedQuestionCount) {
    params.onOverQuota(completeQuestions.length)
  }

  const acceptedGeneratedQuestions = completeQuestions.slice(
    0,
    params.requestedQuestionCount,
  )
  const acceptedQuestions = [
    ...params.seedQuestions,
    ...acceptedGeneratedQuestions,
  ]
  if (
    acceptedQuestions.length < params.emittedQuestionCount.emittedQuestionCount
  ) {
    return
  }

  const inProgress = extractInProgressFields(firstIncompleteRaw, {
    hasRoomForMore:
      acceptedGeneratedQuestions.length < params.requestedQuestionCount,
  })
  const acceptedGrew =
    acceptedQuestions.length > params.emittedQuestionCount.emittedQuestionCount
  const inProgressChanged =
    inProgress.question !==
      params.emittedQuestionCount.emittedInProgressQuestion ||
    inProgress.answer !== params.emittedQuestionCount.emittedInProgressAnswer

  if (!acceptedGrew && !inProgressChanged) return

  if (acceptedGrew) {
    const newQuestions = acceptedQuestions.slice(
      params.emittedQuestionCount.emittedQuestionCount,
    )
    params.assertOutputAllowed(newQuestions)
    params.emittedQuestionCount.acceptedQuestions = acceptedQuestions
    params.emittedQuestionCount.emittedQuestionCount = acceptedQuestions.length
  }
  if (
    inProgressChanged &&
    (inProgress.question.length > 0 || inProgress.answer.length > 0)
  ) {
    params.assertOutputAllowed([
      {
        question: inProgress.question,
        answer: inProgress.answer,
        anchor: { sourceId: null, lineRange: null },
      },
    ])
  }
  params.emittedQuestionCount.emittedInProgressQuestion = inProgress.question
  params.emittedQuestionCount.emittedInProgressAnswer = inProgress.answer
  params.onOutput?.({
    kind: "partial-questions",
    acceptedQuestionCount: acceptedQuestions.length,
    questions: acceptedQuestions,
    sourceReferences: params.sourceReferences,
    inProgressQuestion:
      inProgress.question.length === 0 && inProgress.answer.length === 0
        ? null
        : { question: inProgress.question, answer: inProgress.answer },
  })
}

function extractInProgressFields(
  raw: unknown,
  context: { hasRoomForMore: boolean },
): { question: string; answer: string } {
  if (!context.hasRoomForMore || !isRecord(raw)) {
    return { question: "", answer: "" }
  }
  const question = typeof raw.question === "string" ? raw.question : ""
  const answer = typeof raw.answer === "string" ? raw.answer : ""
  return { question, answer }
}

export function buildStreamedTextPreview(buffer: string): string {
  const preview = stripOpeningJsonFence(buffer)
  if (preview.length <= STREAM_PREVIEW_MAX_CHARS) return preview
  return `...${preview.slice(-STREAM_PREVIEW_MAX_CHARS)}`
}

function stripOpeningJsonFence(text: string): string {
  const trimmed = text.trimStart()
  if (!trimmed.startsWith("```")) return text.trim()
  return trimmed.replace(/^```(?:json)?\s*/, "").trimStart()
}

function coerceCompleteStreamQuestion(
  raw: unknown,
  sourceLineRanges: SourceLineRangeIndex,
): ExaminationQuestion | null {
  if (!isRecord(raw)) return null
  const question = typeof raw.question === "string" ? raw.question : ""
  const answer = typeof raw.answer === "string" ? raw.answer : ""
  if (question.trim().length === 0 || answer.trim().length === 0) {
    return null
  }
  if (!("anchor" in raw)) return null
  const anchor = coerceCompleteStreamAnchor(raw.anchor, sourceLineRanges)
  if (anchor === null) return null
  return { question, answer, anchor }
}

function coerceCompleteStreamAnchor(
  raw: unknown,
  sourceLineRanges: SourceLineRangeIndex,
): ExaminationSourceAnchor | null {
  if (!isRecord(raw)) return null
  if (raw.sourceId === null) {
    return raw.lineRange === null ? { sourceId: null, lineRange: null } : null
  }
  if (typeof raw.sourceId !== "string") return null
  const validRanges = sourceLineRanges.get(raw.sourceId)
  if (validRanges === undefined) return null
  const lineRange = coerceLineRange(raw.lineRange, validRanges)
  if (lineRange === null) return null
  return { sourceId: raw.sourceId, lineRange }
}

export function parseQuestions(
  reply: string,
  expectedCount: number,
  sourceLineRanges: SourceLineRangeIndex,
  options: {
    onOverQuota?: (actualCount: number) => void
  } = {},
): ExaminationQuestion[] {
  const stripped = stripJsonFences(reply)
  let parsed: unknown
  try {
    parsed = JSON.parse(stripped)
  } catch (error) {
    throw {
      type: "provider",
      message: `LLM reply was not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
      provider: "llm",
      operation: "examination.generateQuestions",
      retryable: true,
    } satisfies AppError
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("questions" in parsed) ||
    !Array.isArray((parsed as { questions: unknown }).questions)
  ) {
    throw {
      type: "provider",
      message: "LLM reply did not contain a 'questions' array.",
      provider: "llm",
      operation: "examination.generateQuestions",
      retryable: true,
    } satisfies AppError
  }

  const rawQuestions = (parsed as { questions: unknown[] }).questions
  const questions: ExaminationQuestion[] = []
  for (const [index, raw] of rawQuestions.entries()) {
    questions.push(coerceQuestion(raw, index, sourceLineRanges))
  }

  if (questions.length === 0) {
    throw {
      type: "provider",
      message: "LLM returned zero questions.",
      provider: "llm",
      operation: "examination.generateQuestions",
      retryable: true,
    } satisfies AppError
  }

  if (questions.length > expectedCount) {
    options.onOverQuota?.(questions.length)
  }

  return questions.slice(0, expectedCount)
}

function coerceQuestion(
  raw: unknown,
  index: number,
  sourceLineRanges: SourceLineRangeIndex,
): ExaminationQuestion {
  if (!isRecord(raw)) {
    throw providerError(`Question ${index} is not an object.`)
  }
  const question = typeof raw.question === "string" ? raw.question : ""
  const answer = typeof raw.answer === "string" ? raw.answer : ""
  if (question.trim().length === 0 || answer.trim().length === 0) {
    throw providerError(`Question ${index} is missing question or answer text.`)
  }
  return {
    question,
    answer,
    anchor: coerceAnchor(raw.anchor, sourceLineRanges),
  }
}

function coerceAnchor(
  raw: unknown,
  sourceLineRanges: SourceLineRangeIndex,
): ExaminationSourceAnchor {
  if (!isRecord(raw)) return { sourceId: null, lineRange: null }
  const sourceId = typeof raw.sourceId === "string" ? raw.sourceId : null
  if (sourceId === null) return { sourceId: null, lineRange: null }
  const validRanges = sourceLineRanges.get(sourceId)
  if (validRanges === undefined) return { sourceId: null, lineRange: null }
  return {
    sourceId,
    lineRange: coerceLineRange(raw.lineRange, validRanges),
  }
}

type SourceLineRangeIndex = ReadonlyMap<string, readonly ExaminationLineRange[]>

export function buildPromptSourceLineRanges(
  excerpts: readonly {
    sourceId: string
    startLine: number
    lines: readonly string[]
  }[],
): SourceLineRangeIndex {
  const ranges = new Map<string, ExaminationLineRange[]>()
  for (const excerpt of excerpts) {
    ranges.set(excerpt.sourceId, [
      {
        start: excerpt.startLine,
        end: excerpt.startLine + excerpt.lines.length - 1,
      },
    ])
  }
  return ranges
}

export function buildReferenceSourceLineRanges(
  sourceReferences: readonly ExaminationSourceReference[],
): SourceLineRangeIndex {
  const ranges = new Map<string, ExaminationLineRange[]>()
  for (const reference of sourceReferences) {
    ranges.set(
      reference.sourceId,
      reference.occurrences.map((occurrence) => occurrence.lineRange),
    )
  }
  return ranges
}

export function normalizeQuestionAnchors(
  questions: readonly ExaminationQuestion[],
  sourceLineRanges: SourceLineRangeIndex,
): ExaminationQuestion[] {
  return questions.map((question) => {
    const anchor = normalizeAnchor(question.anchor, sourceLineRanges)
    if (anchor === question.anchor) return question
    return { ...question, anchor }
  })
}

function normalizeAnchor(
  anchor: ExaminationSourceAnchor,
  sourceLineRanges: SourceLineRangeIndex,
): ExaminationSourceAnchor {
  const { sourceId } = anchor
  if (sourceId === null) return { sourceId: null, lineRange: null }
  const validRanges = sourceLineRanges.get(sourceId)
  if (validRanges === undefined) return { sourceId: null, lineRange: null }
  return {
    sourceId,
    lineRange: coerceLineRange(anchor.lineRange, validRanges),
  }
}

function coerceLineRange(
  raw: unknown,
  validRanges: readonly ExaminationLineRange[],
): ExaminationLineRange | null {
  if (!isRecord(raw)) return null
  const start = typeof raw.start === "number" ? raw.start : null
  const end = typeof raw.end === "number" ? raw.end : null
  if (start === null || end === null) return null
  if (!Number.isInteger(start) || !Number.isInteger(end)) return null
  if (start < 1 || end < start) return null
  if (
    !validRanges.some(
      (validRange) => start >= validRange.start && end <= validRange.end,
    )
  ) {
    return null
  }
  return { start, end }
}

export function providerError(message: string): AppError {
  return {
    type: "provider",
    message,
    provider: "llm",
    operation: "examination.generateQuestions",
    retryable: true,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

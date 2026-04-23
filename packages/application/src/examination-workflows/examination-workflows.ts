import type {
  AppError,
  DiagnosticOutput,
  ExaminationGenerateQuestionsInput,
  ExaminationGenerateQuestionsResult,
  ExaminationLineRange,
  ExaminationQuestion,
  MilestoneProgress,
  WorkflowCallOptions,
  WorkflowHandlerMap,
} from "@repo-edu/application-contract"
import { createValidationAppError } from "../core.js"
import { throwIfAborted } from "../workflow-helpers.js"
import type { ExaminationWorkflowPorts } from "./ports.js"
import { buildExaminationPrompt, stripJsonFences } from "./prompt-builder.js"

const DEFAULT_EXAMINATION_MODEL = "claude-sonnet-4-6"
const DEFAULT_EXAMINATION_EFFORT = "medium"

type ExaminationWorkflowId = "examination.generateQuestions"

export function createExaminationWorkflowHandlers(
  ports: ExaminationWorkflowPorts,
): Pick<WorkflowHandlerMap<ExaminationWorkflowId>, ExaminationWorkflowId> {
  return {
    "examination.generateQuestions": async (
      input: ExaminationGenerateQuestionsInput,
      options?: WorkflowCallOptions<MilestoneProgress, DiagnosticOutput>,
    ): Promise<ExaminationGenerateQuestionsResult> => {
      validateInput(input)

      throwIfAborted(options?.signal)
      options?.onProgress?.({
        step: 1,
        totalSteps: 3,
        label: "Building prompt.",
      })

      const prompt = buildExaminationPrompt(input)

      throwIfAborted(options?.signal)
      options?.onProgress?.({
        step: 2,
        totalSteps: 3,
        label: "Generating questions via LLM.",
      })

      const { reply, usage } = await ports.llm.run({
        prompt,
        model: DEFAULT_EXAMINATION_MODEL,
        effort: DEFAULT_EXAMINATION_EFFORT,
        maxTurns: 1,
        signal: options?.signal,
      })

      throwIfAborted(options?.signal)
      options?.onProgress?.({
        step: 3,
        totalSteps: 3,
        label: "Parsing LLM response.",
      })

      const questions = parseQuestions(reply, input.questionCount)

      return {
        questions,
        usage: {
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          wallMs: usage.wallMs,
        },
      }
    },
  }
}

function validateInput(input: ExaminationGenerateQuestionsInput): void {
  const issues: { path: string; message: string }[] = []
  if (input.memberName.trim().length === 0) {
    issues.push({ path: "memberName", message: "Member name is required." })
  }
  if (input.questionCount < 1 || input.questionCount > 20) {
    issues.push({
      path: "questionCount",
      message: "questionCount must be between 1 and 20.",
    })
  }
  if (input.excerpts.length === 0) {
    issues.push({
      path: "excerpts",
      message: "At least one code excerpt is required.",
    })
  }
  for (const [index, excerpt] of input.excerpts.entries()) {
    if (excerpt.lines.length === 0) {
      issues.push({
        path: `excerpts.${index}.lines`,
        message: "Excerpt must contain at least one line.",
      })
    }
    if (excerpt.startLine < 1) {
      issues.push({
        path: `excerpts.${index}.startLine`,
        message: "startLine must be a 1-based positive integer.",
      })
    }
  }
  if (issues.length > 0) {
    throw createValidationAppError("Examination input is invalid.", issues)
  }
}

function parseQuestions(
  reply: string,
  expectedCount: number,
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
    questions.push(coerceQuestion(raw, index))
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

  return questions.slice(0, expectedCount)
}

function coerceQuestion(raw: unknown, index: number): ExaminationQuestion {
  if (typeof raw !== "object" || raw === null) {
    throw providerError(`Question ${index} is not an object.`)
  }
  const record = raw as Record<string, unknown>
  const question = typeof record.question === "string" ? record.question : ""
  const answer = typeof record.answer === "string" ? record.answer : ""
  if (question.trim().length === 0 || answer.trim().length === 0) {
    throw providerError(`Question ${index} is missing question or answer text.`)
  }
  const filePath =
    typeof record.filePath === "string" && record.filePath.trim().length > 0
      ? record.filePath
      : null
  const lineRange = coerceLineRange(record.lineRange)
  return { question, answer, filePath, lineRange }
}

function coerceLineRange(raw: unknown): ExaminationLineRange | null {
  if (typeof raw !== "object" || raw === null) return null
  const record = raw as Record<string, unknown>
  const start = typeof record.start === "number" ? record.start : null
  const end = typeof record.end === "number" ? record.end : null
  if (start === null || end === null) return null
  if (start < 1 || end < start) return null
  return { start, end }
}

function providerError(message: string): AppError {
  return {
    type: "provider",
    message,
    provider: "llm",
    operation: "examination.generateQuestions",
    retryable: true,
  }
}

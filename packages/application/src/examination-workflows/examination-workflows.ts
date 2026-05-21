import type {
  AppError,
  DiagnosticOutput,
  ExaminationArchivedProvenance,
  ExaminationArchiveKey,
  ExaminationArchiveRecord,
  ExaminationGenerateQuestionsInput,
  ExaminationGenerateQuestionsResult,
  ExaminationLineRange,
  ExaminationLlmSettings,
  ExaminationLookupQuestionsInput,
  ExaminationLookupQuestionsResult,
  ExaminationProvenanceDrift,
  ExaminationQuestion,
  MilestoneProgress,
  WorkflowCallOptions,
  WorkflowHandlerMap,
} from "@repo-edu/application-contract"
import {
  buildExaminationExcerptsFingerprint,
  buildExaminationGenerationContextFingerprint,
  canonicalizeExaminationExcerpts,
  normalizeExaminationRepositoryKey,
} from "@repo-edu/application-contract"
import {
  type PersistedLlmConnection,
  resolveActiveLlmConnection,
} from "@repo-edu/domain/settings"
import {
  type FixtureModelSpec,
  getExaminationDefaultSpec,
  getSpecByCode,
  modelCode,
} from "@repo-edu/integrations-llm-catalog"
import type { LlmProvider } from "@repo-edu/integrations-llm-contract"
import { createValidationAppError } from "../core.js"
import { throwIfAborted } from "../workflow-helpers.js"
import type { ExaminationWorkflowPorts } from "./ports.js"
import { buildExaminationPrompt, stripJsonFences } from "./prompt-builder.js"

type ExaminationWorkflowId =
  | "examination.generateQuestions"
  | "examination.lookupQuestions"

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

      const { archiveKey, canonicalExcerpts, resolution } =
        resolveArchiveContext(input)

      if (!input.regenerate) {
        const hit = ports.archive.get(archiveKey)
        if (hit) {
          options?.onProgress?.({
            step: 3,
            totalSteps: 3,
            label: "Returning archived questions.",
          })
          return toResult(hit, {
            fromArchive: true,
            drift: computeDrift(hit.provenance, input),
          })
        }
      }

      throwIfAborted(options?.signal)
      options?.onProgress?.({
        step: 2,
        totalSteps: 3,
        label: "Generating questions via LLM.",
      })

      const prompt = buildExaminationPrompt(input)
      const { reply, usage } = await ports.llm.run({
        spec: {
          provider: resolution.spec.provider,
          family: resolution.spec.family,
          modelId: resolution.spec.modelId,
          effort: resolution.spec.effort,
        },
        prompt,
        signal: options?.signal,
      })

      throwIfAborted(options?.signal)
      options?.onProgress?.({
        step: 3,
        totalSteps: 3,
        label: "Parsing LLM response.",
      })

      const questions = parseQuestions(reply, input.questionCount)

      const provenance: ExaminationArchivedProvenance = {
        authorName: input.authorName,
        authorEmail: input.authorEmail,
        rosterMemberId: input.rosterMemberId,
        repositoryPath: input.repositoryPath,
        assignmentContext: input.assignmentContext ?? null,
        model: resolution.code,
        effort: resolution.spec.effort,
        questionCount: input.questionCount,
        usage,
        createdAtMs: Date.now(),
        excerpts: canonicalExcerpts,
      }

      const record: ExaminationArchiveRecord = {
        key: archiveKey,
        questions,
        provenance,
      }

      ports.archive.put(record)

      return toResult(record, {
        fromArchive: false,
        drift: null,
      })
    },
    "examination.lookupQuestions": async (
      input: ExaminationLookupQuestionsInput,
      options?: WorkflowCallOptions<MilestoneProgress, DiagnosticOutput>,
    ): Promise<ExaminationLookupQuestionsResult> => {
      validateInput(input)

      throwIfAborted(options?.signal)
      options?.onProgress?.({
        step: 1,
        totalSteps: 1,
        label: "Checking archived questions.",
      })

      const { archiveKey } = resolveArchiveContext(input)
      const exact = ports.archive.get(archiveKey)
      const availableSets = ports.archive
        .listForGenerationContext(archiveKey)
        .map((record) =>
          toResult(record, {
            fromArchive: true,
            drift: computeDrift(record.provenance, input),
          }),
        )
      return {
        exact:
          exact === undefined
            ? null
            : toResult(exact, {
                fromArchive: true,
                drift: computeDrift(exact.provenance, input),
              }),
        availableSets,
      }
    },
  }
}

function resolveArchiveContext(input: ExaminationLookupQuestionsInput): {
  archiveKey: ExaminationArchiveKey
  canonicalExcerpts: ReturnType<typeof canonicalizeExaminationExcerpts>
  resolution: ExaminationModelResolution
} {
  const resolution = resolveExaminationModel(input.llmSettings)
  const canonicalExcerpts = canonicalizeExaminationExcerpts(input.excerpts)
  const excerptsFingerprint =
    buildExaminationExcerptsFingerprint(canonicalExcerpts)
  const generationContextFingerprint =
    buildExaminationGenerationContextFingerprint({
      assignmentContext: input.assignmentContext ?? null,
      model: resolution.code,
      effort: resolution.spec.effort,
    })
  return {
    archiveKey: {
      repositoryKey: normalizeExaminationRepositoryKey(input.repositoryPath),
      personId: input.personId,
      commitOid: input.commitOid,
      questionCount: input.questionCount,
      excerptsFingerprint,
      generationContextFingerprint,
    },
    canonicalExcerpts,
    resolution,
  }
}

type ExaminationModelResolution = {
  spec: FixtureModelSpec
  code: string
  connection: PersistedLlmConnection
}

function resolveExaminationModel(
  settings: ExaminationLlmSettings,
): ExaminationModelResolution {
  const connection = resolveActiveLlmConnection(settings)
  if (connection === null) {
    throw createValidationAppError("No LLM connection is configured.", [
      {
        path: "llmSettings.activeLlmConnectionId",
        message:
          "Add an LLM connection in Settings → LLM Connections before generating questions.",
      },
    ])
  }
  const provider = connection.provider as LlmProvider
  const explicit = lookupExplicitProviderCode(provider, connection, settings)
  if (explicit !== null) {
    return { connection, ...explicit }
  }
  const fallback = getExaminationDefaultSpec(provider)
  if (fallback === undefined) {
    throw createValidationAppError(
      `No default examination model is registered for provider '${provider}'.`,
      [
        {
          path: "llmSettings.examinationModelsByProvider",
          message: `Catalog is missing an examinationDefault entry for ${provider}.`,
        },
      ],
    )
  }
  return { connection, spec: fallback, code: modelCode(fallback) }
}

function lookupExplicitProviderCode(
  provider: LlmProvider,
  connection: PersistedLlmConnection,
  settings: ExaminationLlmSettings,
): { spec: FixtureModelSpec; code: string } | null {
  const value = settings.examinationModelsByProvider[provider]
  const codeFromSettings =
    typeof value === "string" && value.length > 0 ? value : null
  if (codeFromSettings === null) return null
  const spec = getSpecByCode(codeFromSettings)
  if (spec === undefined) {
    throw createValidationAppError(
      `Unknown model code '${codeFromSettings}' for provider '${provider}'.`,
      [
        {
          path: `llmSettings.examinationModelsByProvider.${provider}`,
          message: `Code '${codeFromSettings}' is not in the catalog.`,
        },
      ],
    )
  }
  if (spec.provider !== connection.provider) {
    throw createValidationAppError(
      "Selected model does not match the active LLM connection's provider.",
      [
        {
          path: `llmSettings.examinationModelsByProvider.${provider}`,
          message: `Code '${codeFromSettings}' is for provider ${spec.provider} but the active LLM connection is provider ${connection.provider}.`,
        },
      ],
    )
  }
  return { spec, code: codeFromSettings }
}

function toResult(
  record: ExaminationArchiveRecord,
  meta: { fromArchive: boolean; drift: ExaminationProvenanceDrift | null },
): ExaminationGenerateQuestionsResult {
  return {
    questions: record.questions,
    usage: record.provenance.usage,
    fromArchive: meta.fromArchive,
    archivedProvenance: record.provenance,
    provenanceDrift: meta.drift,
  }
}

function computeDrift(
  stored: ExaminationArchivedProvenance,
  input: ExaminationGenerateQuestionsInput,
): ExaminationProvenanceDrift | null {
  const drift: ExaminationProvenanceDrift = {
    authorNameChanged:
      stored.authorName !== input.authorName
        ? { from: stored.authorName, to: input.authorName }
        : null,
    authorEmailChanged:
      stored.authorEmail !== input.authorEmail
        ? { from: stored.authorEmail, to: input.authorEmail }
        : null,
  }
  const anyChanged =
    drift.authorNameChanged !== null || drift.authorEmailChanged !== null
  return anyChanged ? drift : null
}

function validateInput(input: ExaminationGenerateQuestionsInput): void {
  const issues: { path: string; message: string }[] = []
  if (input.llmSettings === undefined || input.llmSettings === null) {
    issues.push({
      path: "llmSettings",
      message: "llmSettings is required.",
    })
  }
  if (
    typeof input.personId !== "string" ||
    input.personId.trim().length === 0
  ) {
    issues.push({ path: "personId", message: "personId is required." })
  }
  if (
    input.rosterMemberId !== null &&
    (typeof input.rosterMemberId !== "string" ||
      input.rosterMemberId.trim().length === 0)
  ) {
    issues.push({
      path: "rosterMemberId",
      message: "rosterMemberId must be null or a non-empty string.",
    })
  }
  if (
    typeof input.commitOid !== "string" ||
    input.commitOid.trim().length === 0
  ) {
    issues.push({ path: "commitOid", message: "commitOid is required." })
  }
  if (
    typeof input.repositoryPath !== "string" ||
    input.repositoryPath.trim().length === 0
  ) {
    issues.push({
      path: "repositoryPath",
      message: "repositoryPath is required.",
    })
  }
  if (
    typeof input.authorName !== "string" ||
    input.authorName.trim().length === 0
  ) {
    issues.push({ path: "authorName", message: "Author name is required." })
  }
  if (typeof input.authorEmail !== "string") {
    issues.push({ path: "authorEmail", message: "authorEmail is required." })
  }
  if (
    !Number.isInteger(input.questionCount) ||
    input.questionCount < 1 ||
    input.questionCount > 20
  ) {
    issues.push({
      path: "questionCount",
      message: "questionCount must be between 1 and 20.",
    })
  }
  if (!Array.isArray(input.excerpts) || input.excerpts.length === 0) {
    issues.push({
      path: "excerpts",
      message: "At least one code excerpt is required.",
    })
  }
  for (const [index, excerpt] of (Array.isArray(input.excerpts)
    ? input.excerpts
    : []
  ).entries()) {
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

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
  ExaminationLocalIdentityContext,
  ExaminationLookupQuestionsInput,
  ExaminationLookupQuestionsResult,
  ExaminationQuestion,
  ExaminationSourceAnchor,
  ExaminationSourceReference,
  MilestoneProgress,
  WorkflowCallOptions,
  WorkflowHandlerMap,
} from "@repo-edu/application-contract"
import {
  buildExaminationGenerationContextFingerprint,
  EXAMINATION_PROMPT_TEMPLATE_VERSION,
  EXAMINATION_REDACTION_POLICY_VERSION,
  isExaminationContentScopeIdShape,
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
import { prepareExaminationProviderExcerpts } from "./provider-excerpts.js"
import {
  assertNoRequiredRedactionLeaks,
  scanExaminationOutputForLeaks,
} from "./redaction.js"

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
      validateGenerateInput(input)

      throwIfAborted(options?.signal)
      options?.onProgress?.({
        step: 1,
        totalSteps: 4,
        label: "Preparing redacted excerpts.",
      })

      const prepared = await prepareExaminationProviderExcerpts({
        excerpts: input.excerpts,
        excerptFileSources: input.excerptFileSources,
        localIdentityContext: input.localIdentityContext,
        tokenizer: ports.tokenizer,
        questionCount: input.questionCount,
      })
      const { archiveKey, resolution } = resolveArchiveContext(
        input,
        prepared.providerPayloadFingerprint,
      )

      if (!input.regenerate) {
        const hit = ports.archive.get(archiveKey)
        if (hit && isRecordAllowedForCurrentContext(hit, input)) {
          options?.onProgress?.({
            step: 4,
            totalSteps: 4,
            label: "Returning archived questions.",
          })
          return toResult(hit, {
            fromArchive: true,
            sourceReferences: prepared.sourceReferences,
          })
        }
      }

      throwIfAborted(options?.signal)
      options?.onProgress?.({
        step: 2,
        totalSteps: 4,
        label: "Building prompt.",
      })

      const prompt = buildExaminationPrompt(prepared.promptPayload)
      try {
        assertNoRequiredRedactionLeaks({
          renderedPrompt: prompt,
          requiredChecks: prepared.requiredChecks,
        })
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Prompt redaction failed."
        throw createValidationAppError(message, [{ path: "prompt", message }])
      }

      throwIfAborted(options?.signal)
      options?.onProgress?.({
        step: 3,
        totalSteps: 4,
        label: "Generating questions via LLM.",
      })

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
        step: 4,
        totalSteps: 4,
        label: "Parsing LLM response.",
      })

      const validSourceIds = new Set(
        prepared.promptPayload.excerpts.map((excerpt) => excerpt.sourceId),
      )
      const questions = parseQuestions(
        reply,
        input.questionCount,
        validSourceIds,
      )
      assertOutputAllowedForCurrentContext(questions, input)
      const acceptedQuestionCount = questions.length
      if (acceptedQuestionCount < input.questionCount) {
        options?.onOutput?.({
          channel: "warn",
          message: `Provider returned ${acceptedQuestionCount} of ${input.questionCount} requested examination questions. The partial set was stored under its actual question count.`,
        })
      }
      const resultArchiveKey =
        acceptedQuestionCount === archiveKey.questionCount
          ? archiveKey
          : { ...archiveKey, questionCount: acceptedQuestionCount }

      const provenance: ExaminationArchivedProvenance = {
        model: resolution.code,
        effort: resolution.spec.effort,
        questionCount: acceptedQuestionCount,
        usage,
        createdAtMs: Date.now(),
        redactionPolicyVersion: EXAMINATION_REDACTION_POLICY_VERSION,
        promptTemplateVersion: EXAMINATION_PROMPT_TEMPLATE_VERSION,
      }

      const record: ExaminationArchiveRecord = {
        key: resultArchiveKey,
        questions,
        provenance,
      }

      ports.archive.put(record)

      return toResult(record, {
        fromArchive: false,
        sourceReferences: prepared.sourceReferences,
      })
    },
    "examination.lookupQuestions": async (
      input: ExaminationLookupQuestionsInput,
      options?: WorkflowCallOptions<MilestoneProgress, DiagnosticOutput>,
    ): Promise<ExaminationLookupQuestionsResult> => {
      validateLookupInput(input)

      throwIfAborted(options?.signal)
      options?.onProgress?.({
        step: 1,
        totalSteps: 2,
        label: "Preparing redacted excerpts.",
      })

      const prepared = await prepareExaminationProviderExcerpts({
        excerpts: input.excerpts,
        excerptFileSources: input.excerptFileSources,
        localIdentityContext: input.localIdentityContext,
        tokenizer: ports.tokenizer,
        questionCount: input.questionCount,
      })
      const { archiveKey } = resolveArchiveContext(
        input,
        prepared.providerPayloadFingerprint,
      )

      throwIfAborted(options?.signal)
      options?.onProgress?.({
        step: 2,
        totalSteps: 2,
        label: "Checking archived questions.",
      })

      const exact = ports.archive.get(archiveKey)
      const availableSets = ports.archive
        .listForGenerationContext(archiveKey)
        .filter((record) => isRecordAllowedForCurrentContext(record, input))
        .map((record) =>
          toResult(record, {
            fromArchive: true,
            sourceReferences: prepared.sourceReferences,
          }),
        )
      return {
        requestedKey: archiveKey,
        sourceReferences: prepared.sourceReferences,
        exact:
          exact === undefined || !isRecordAllowedForCurrentContext(exact, input)
            ? null
            : toResult(exact, {
                fromArchive: true,
                sourceReferences: prepared.sourceReferences,
              }),
        availableSets,
      }
    },
  }
}

function resolveArchiveContext(
  input: ExaminationLookupQuestionsInput,
  providerPayloadFingerprint: string,
): {
  archiveKey: ExaminationArchiveKey
  resolution: ExaminationModelResolution
} {
  const resolution = resolveExaminationModel(input.llmSettings)
  const generationContextFingerprint =
    buildExaminationGenerationContextFingerprint({
      model: resolution.code,
      effort: resolution.spec.effort,
      promptTemplateVersion: EXAMINATION_PROMPT_TEMPLATE_VERSION,
      redactionPolicyVersion: EXAMINATION_REDACTION_POLICY_VERSION,
    })
  return {
    archiveKey: {
      personId: input.personId,
      contentScopeId: input.contentScopeId,
      questionCount: input.questionCount,
      providerPayloadFingerprint,
      generationContextFingerprint,
    },
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
          "Add an LLM connection in Settings -> LLM Connections before generating questions.",
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
  meta: {
    fromArchive: boolean
    sourceReferences: ExaminationSourceReference[]
  },
): ExaminationGenerateQuestionsResult {
  return {
    key: record.key,
    questions: record.questions,
    usage: record.provenance.usage,
    fromArchive: meta.fromArchive,
    archivedProvenance: record.provenance,
    sourceReferences: meta.sourceReferences,
  }
}

function isRecordAllowedForCurrentContext(
  record: ExaminationArchiveRecord,
  input: ExaminationLookupQuestionsInput,
): boolean {
  return scanExaminationOutputForLeaks({
    questions: record.questions,
    localIdentityContext: input.localIdentityContext,
  }).ok
}

function assertOutputAllowedForCurrentContext(
  questions: readonly ExaminationQuestion[],
  input: ExaminationGenerateQuestionsInput,
): void {
  const result = scanExaminationOutputForLeaks({
    questions,
    localIdentityContext: input.localIdentityContext,
  })
  if (result.ok) return
  const message =
    result.reason === "email"
      ? "Provider output contained an email address. Generate again to request fresh redacted output; report this if it persists."
      : "Provider output echoed a known local identifier verbatim. Generate again to request fresh redacted output; report this if it persists."
  throw createValidationAppError("Provider output failed privacy validation.", [
    { path: "questions", message },
  ])
}

function validateGenerateInput(input: ExaminationGenerateQuestionsInput): void {
  validateInput(input, "generate")
}

function validateLookupInput(input: ExaminationLookupQuestionsInput): void {
  validateInput(input, "lookup")
}

function validateInput(
  input: ExaminationGenerateQuestionsInput | ExaminationLookupQuestionsInput,
  mode: "generate" | "lookup",
): void {
  const issues: { path: string; message: string }[] = []
  if (!isRecord(input)) {
    throw createValidationAppError("Examination input is invalid.", [
      { path: "input", message: "Input must be an object." },
    ])
  }
  const allowed = new Set([
    "personId",
    "contentScopeId",
    "localIdentityContext",
    "excerpts",
    "excerptFileSources",
    "questionCount",
    "llmSettings",
    ...(mode === "generate" ? ["regenerate"] : []),
  ])
  for (const field of Object.keys(input)) {
    if (!allowed.has(field)) {
      issues.push({ path: field, message: "Unknown field." })
    }
  }
  if (
    typeof input.personId !== "string" ||
    input.personId.trim().length === 0
  ) {
    issues.push({ path: "personId", message: "personId is required." })
  }
  if (
    typeof input.contentScopeId !== "string" ||
    !isExaminationContentScopeIdShape(input.contentScopeId)
  ) {
    issues.push({
      path: "contentScopeId",
      message:
        "contentScopeId must be a full lowercase SHA-1 or SHA-256 content identifier.",
    })
  }
  validateLocalIdentityContext(input.localIdentityContext, issues)
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
  validateExcerpts(input.excerpts, issues)
  validateExcerptFileSources(input.excerptFileSources, issues)
  if (input.llmSettings === undefined || input.llmSettings === null) {
    issues.push({
      path: "llmSettings",
      message: "llmSettings is required.",
    })
  }
  if (
    "regenerate" in input &&
    input.regenerate !== undefined &&
    typeof input.regenerate !== "boolean"
  ) {
    issues.push({
      path: "regenerate",
      message: "regenerate must be a boolean when present.",
    })
  }
  if (issues.length > 0) {
    throw createValidationAppError("Examination input is invalid.", issues)
  }
}

function validateLocalIdentityContext(
  context: ExaminationLocalIdentityContext,
  issues: { path: string; message: string }[],
): void {
  if (!isRecord(context)) {
    issues.push({
      path: "localIdentityContext",
      message: "localIdentityContext is required.",
    })
    return
  }
  for (const field of [
    "names",
    "emails",
    "opaqueIdentifiers",
    "gitUsernames",
  ]) {
    const value = context[field as keyof ExaminationLocalIdentityContext]
    if (
      !Array.isArray(value) ||
      value.some((item) => typeof item !== "string")
    ) {
      issues.push({
        path: `localIdentityContext.${field}`,
        message: `${field} must be an array of strings.`,
      })
    }
  }
}

function validateExcerpts(
  excerpts: ExaminationGenerateQuestionsInput["excerpts"],
  issues: { path: string; message: string }[],
): void {
  if (!Array.isArray(excerpts) || excerpts.length === 0) {
    issues.push({
      path: "excerpts",
      message: "At least one code excerpt is required.",
    })
    return
  }
  for (const [index, excerpt] of excerpts.entries()) {
    if (!isRecord(excerpt)) {
      issues.push({ path: `excerpts.${index}`, message: "Excerpt is invalid." })
      continue
    }
    if (
      typeof excerpt.filePath !== "string" ||
      excerpt.filePath.trim().length === 0
    ) {
      issues.push({
        path: `excerpts.${index}.filePath`,
        message: "filePath is required for local source lookup.",
      })
    }
    if (!Number.isInteger(excerpt.startLine) || excerpt.startLine < 1) {
      issues.push({
        path: `excerpts.${index}.startLine`,
        message: "startLine must be a 1-based positive integer.",
      })
    }
    if (
      !Array.isArray(excerpt.lines) ||
      excerpt.lines.length === 0 ||
      excerpt.lines.some((line) => typeof line !== "string")
    ) {
      issues.push({
        path: `excerpts.${index}.lines`,
        message: "Excerpt must contain at least one string line.",
      })
    }
  }
}

function validateExcerptFileSources(
  sources: ExaminationGenerateQuestionsInput["excerptFileSources"],
  issues: { path: string; message: string }[],
): void {
  if (!isRecord(sources)) {
    issues.push({
      path: "excerptFileSources",
      message: "excerptFileSources must be an object.",
    })
    return
  }
  for (const [filePath, source] of Object.entries(sources)) {
    if (filePath.length === 0 || typeof source !== "string") {
      issues.push({
        path: `excerptFileSources.${filePath}`,
        message: "Each file source must be keyed by path and contain text.",
      })
    }
  }
}

function parseQuestions(
  reply: string,
  expectedCount: number,
  validSourceIds: ReadonlySet<string>,
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
    questions.push(coerceQuestion(raw, index, validSourceIds))
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

function coerceQuestion(
  raw: unknown,
  index: number,
  validSourceIds: ReadonlySet<string>,
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
    anchor: coerceAnchor(raw.anchor, validSourceIds),
  }
}

function coerceAnchor(
  raw: unknown,
  validSourceIds: ReadonlySet<string>,
): ExaminationSourceAnchor {
  if (!isRecord(raw)) return { sourceId: null, lineRange: null }
  const sourceId =
    typeof raw.sourceId === "string" && validSourceIds.has(raw.sourceId)
      ? raw.sourceId
      : null
  if (sourceId === null) return { sourceId: null, lineRange: null }
  return {
    sourceId,
    lineRange: coerceLineRange(raw.lineRange),
  }
}

function coerceLineRange(raw: unknown): ExaminationLineRange | null {
  if (!isRecord(raw)) return null
  const start = typeof raw.start === "number" ? raw.start : null
  const end = typeof raw.end === "number" ? raw.end : null
  if (start === null || end === null) return null
  if (!Number.isInteger(start) || !Number.isInteger(end)) return null
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

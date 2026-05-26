import type {
  AppError,
  DiagnosticOutput,
  ExaminationArchivedProvenance,
  ExaminationArchiveKey,
  ExaminationArchiveRecord,
  ExaminationGenerateOutput,
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
import type { LlmUsage } from "@repo-edu/host-runtime-contract"
import {
  type FixtureModelSpec,
  getExaminationDefaultSpec,
  getSpecByCode,
  modelCode,
} from "@repo-edu/integrations-llm-catalog"
import type { LlmProvider } from "@repo-edu/integrations-llm-contract"
import { Allow, parse as parsePartialJson } from "partial-json"
import { createValidationAppError } from "../core.js"
import { throwIfAborted } from "../workflow-helpers.js"
import type { ExaminationWorkflowPorts } from "./ports.js"
import { buildExaminationPrompt, stripJsonFences } from "./prompt-builder.js"
import { prepareExaminationProviderExcerpts } from "./provider-excerpts.js"
import {
  assertNoRequiredRedactionLeaks,
  scanExaminationOutputForLeaks,
} from "./redaction.js"

const STREAM_PREVIEW_MAX_CHARS = 2_000

type ExaminationWorkflowId =
  | "examination.generateQuestions"
  | "examination.stopGeneration"
  | "examination.lookupQuestions"

export function createExaminationWorkflowHandlers(
  ports: ExaminationWorkflowPorts,
): Pick<WorkflowHandlerMap<ExaminationWorkflowId>, ExaminationWorkflowId> {
  const softStopSessions = new Map<string, SoftStopSession>()

  return {
    "examination.generateQuestions": async (
      input: ExaminationGenerateQuestionsInput,
      options?: WorkflowCallOptions<
        MilestoneProgress,
        ExaminationGenerateOutput
      >,
    ): Promise<ExaminationGenerateQuestionsResult> => {
      validateGenerateInput(input)

      throwIfAborted(options?.signal)
      options?.onProgress?.({
        step: 1,
        totalSteps: 3,
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
      const sourceDescriptors = prepared.promptPayload.excerpts.map(
        (excerpt) => excerpt.sourceDescriptor,
      )
      const sourceLineRanges = buildPromptSourceLineRanges(
        prepared.promptPayload.excerpts,
      )
      const seedQuestions =
        input.seedQuestions === undefined
          ? []
          : normalizeQuestionAnchors(input.seedQuestions, sourceLineRanges)
      assertOutputAllowedForCurrentContext(
        seedQuestions,
        input,
        sourceDescriptors,
      )
      const requestedGeneratedQuestionCount =
        input.questionCount - seedQuestions.length

      if (!input.regenerate) {
        const hit = ports.archive.get(archiveKey)
        if (
          hit &&
          isRecordAllowedForCurrentContext(hit, input, sourceDescriptors)
        ) {
          options?.onProgress?.({
            step: 3,
            totalSteps: 3,
            label: "Returning archived questions.",
          })
          return toResult(hit, {
            fromArchive: true,
            sourceReferences: prepared.sourceReferences,
            requestedQuestionCount: input.questionCount,
          })
        }
      }

      throwIfAborted(options?.signal)
      options?.onProgress?.({
        step: 2,
        totalSteps: 3,
        label: "Building prompt.",
      })

      const prompt = buildExaminationPrompt(
        {
          ...prepared.promptPayload,
          questionCount: requestedGeneratedQuestionCount,
        },
        { seedQuestions },
      )
      try {
        assertNoRequiredRedactionLeaks({
          renderedPrompt: prompt,
          requiredChecks: prepared.requiredChecks,
          allowedSourceDescriptors: sourceDescriptors,
        })
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Prompt redaction failed."
        throw createValidationAppError(message, [{ path: "prompt", message }])
      }

      throwIfAborted(options?.signal)
      options?.onProgress?.({
        step: 3,
        totalSteps: 3,
        label: "Waiting for LLM response.",
      })

      const softStop = createSoftStopSession(
        softStopSessions,
        input.generationControlId,
      )
      const partialState: PartialQuestionEmissionState = {
        acceptedQuestions: seedQuestions,
        emittedQuestionCount: seedQuestions.length,
        warnedOverQuota: false,
        emittedInProgressQuestion: "",
        emittedInProgressAnswer: "",
      }
      const warnOverQuota = (actualCount: number): void => {
        if (partialState.warnedOverQuota) return
        partialState.warnedOverQuota = true
        options?.onOutput?.({
          kind: "warn",
          message:
            seedQuestions.length === 0
              ? `Provider returned ${actualCount} of ${input.questionCount} requested examination questions. Extra questions were ignored.`
              : `Provider returned ${actualCount} of ${requestedGeneratedQuestionCount} requested additional examination questions. Extra questions were ignored.`,
        })
      }
      let buffer = ""
      let finalUsage: LlmUsage | null = null

      try {
        const stream = ports.llm.stream({
          spec: {
            provider: resolution.spec.provider,
            family: resolution.spec.family,
            modelId: resolution.spec.modelId,
            effort: resolution.spec.effort,
          },
          prompt,
          signal: softStop.providerSignal(options?.signal),
        })

        try {
          for await (const event of stream) {
            throwIfAborted(options?.signal)
            if (softStop.requested) break
            if (event.kind === "text-delta") {
              buffer += event.text
              options?.onOutput?.({
                kind: "stream-progress",
                streamedCharacterCount: buffer.length,
                streamedTextPreview: buildStreamedTextPreview(buffer),
              })
              maybeEmitPartial({
                buffer,
                emittedQuestionCount: partialState,
                onOutput: options?.onOutput,
                seedQuestions,
                sourceLineRanges,
                sourceReferences: prepared.sourceReferences,
                requestedQuestionCount: requestedGeneratedQuestionCount,
                onOverQuota: warnOverQuota,
                assertOutputAllowed: (questions) =>
                  assertOutputAllowedForCurrentContext(
                    questions,
                    input,
                    sourceDescriptors,
                  ),
              })
            } else {
              finalUsage = event.usage
            }
          }
        } catch (error) {
          throwIfAborted(options?.signal)
          if (softStop.requested) {
            return archiveSoftStoppedQuestions({
              acceptedQuestions: partialState.acceptedQuestions,
              archiveKey,
              input,
              minimumAcceptedQuestionCount: seedQuestions.length,
              ports,
              resolution,
              sourceReferences: prepared.sourceReferences,
            })
          }
          throw error
        }

        throwIfAborted(options?.signal)
        if (softStop.requested) {
          return archiveSoftStoppedQuestions({
            acceptedQuestions: partialState.acceptedQuestions,
            archiveKey,
            input,
            minimumAcceptedQuestionCount: seedQuestions.length,
            ports,
            resolution,
            sourceReferences: prepared.sourceReferences,
          })
        }
        if (finalUsage === null) {
          throw providerError(
            "LLM stream ended without a terminal usage event.",
          )
        }

        const generatedQuestions = parseQuestions(
          buffer,
          requestedGeneratedQuestionCount,
          sourceLineRanges,
          { onOverQuota: warnOverQuota },
        )
        const questions = [...seedQuestions, ...generatedQuestions]
        assertOutputAllowedForCurrentContext(
          questions,
          input,
          sourceDescriptors,
        )
        const acceptedQuestionCount = questions.length
        if (generatedQuestions.length < requestedGeneratedQuestionCount) {
          options?.onOutput?.({
            kind: "warn",
            message:
              seedQuestions.length === 0
                ? `Provider returned ${acceptedQuestionCount} of ${input.questionCount} requested examination questions. The partial set was stored under its actual question count.`
                : `Provider returned ${generatedQuestions.length} of ${requestedGeneratedQuestionCount} requested additional examination questions. The partial set was stored under its actual question count.`,
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
          usage: finalUsage,
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
          requestedQuestionCount: input.questionCount,
        })
      } finally {
        softStop.dispose()
      }
    },
    "examination.stopGeneration": async (input) => {
      validateStopInput(input)
      const session = softStopSessions.get(input.generationControlId)
      if (session === undefined) {
        return { stopped: false, reason: "not-running" }
      }
      session.requestStop()
      return { stopped: true }
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
      const sourceDescriptors = prepared.promptPayload.excerpts.map(
        (excerpt) => excerpt.sourceDescriptor,
      )
      const availableSets = ports.archive
        .listForGenerationContext(archiveKey)
        .filter((record) =>
          isRecordAllowedForCurrentContext(record, input, sourceDescriptors),
        )
        .map((record) =>
          toResult(record, {
            fromArchive: true,
            sourceReferences: prepared.sourceReferences,
            requestedQuestionCount: record.provenance.questionCount,
          }),
        )
      return {
        requestedKey: archiveKey,
        sourceReferences: prepared.sourceReferences,
        exact:
          exact === undefined ||
          !isRecordAllowedForCurrentContext(exact, input, sourceDescriptors)
            ? null
            : toResult(exact, {
                fromArchive: true,
                sourceReferences: prepared.sourceReferences,
                requestedQuestionCount: input.questionCount,
              }),
        availableSets,
      }
    },
  }
}

type SoftStopSession = {
  readonly requested: boolean
  providerSignal(hardSignal: AbortSignal | undefined): AbortSignal
  requestStop(): void
  dispose(): void
}

type PartialQuestionEmissionState = {
  acceptedQuestions: ExaminationQuestion[]
  emittedQuestionCount: number
  warnedOverQuota: boolean
  emittedInProgressQuestion: string
  emittedInProgressAnswer: string
}

function createSoftStopSession(
  sessions: Map<string, SoftStopSession>,
  generationControlId: string,
): SoftStopSession {
  sessions.get(generationControlId)?.requestStop()

  const providerController = new AbortController()
  let requested = false
  let hardSignal: AbortSignal | undefined
  const abortProvider = () => providerController.abort()
  const session: SoftStopSession = {
    get requested() {
      return requested
    },
    providerSignal(signal) {
      hardSignal = signal
      if (signal?.aborted) {
        providerController.abort()
      } else {
        signal?.addEventListener("abort", abortProvider, { once: true })
      }
      return providerController.signal
    },
    requestStop() {
      requested = true
      providerController.abort()
    },
    dispose() {
      hardSignal?.removeEventListener("abort", abortProvider)
      if (sessions.get(generationControlId) === session) {
        sessions.delete(generationControlId)
      }
    },
  }
  sessions.set(generationControlId, session)
  return session
}

function archiveSoftStoppedQuestions(params: {
  acceptedQuestions: readonly ExaminationQuestion[]
  archiveKey: ExaminationArchiveKey
  input: ExaminationGenerateQuestionsInput
  minimumAcceptedQuestionCount: number
  ports: ExaminationWorkflowPorts
  resolution: ExaminationModelResolution
  sourceReferences: ExaminationSourceReference[]
}): ExaminationGenerateQuestionsResult {
  const acceptedQuestionCount = params.acceptedQuestions.length
  if (acceptedQuestionCount <= params.minimumAcceptedQuestionCount) {
    const message =
      params.minimumAcceptedQuestionCount === 0
        ? "Stop was requested before a complete question was available."
        : "Stop was requested before a complete additional question was available."
    throw createValidationAppError("Stopped before any question completed.", [
      {
        path: "generationControlId",
        message,
      },
    ])
  }

  const resultArchiveKey =
    acceptedQuestionCount === params.archiveKey.questionCount
      ? params.archiveKey
      : { ...params.archiveKey, questionCount: acceptedQuestionCount }
  const record: ExaminationArchiveRecord = {
    key: resultArchiveKey,
    questions: [...params.acceptedQuestions],
    provenance: {
      model: params.resolution.code,
      effort: params.resolution.spec.effort,
      questionCount: acceptedQuestionCount,
      usage: null,
      createdAtMs: Date.now(),
      redactionPolicyVersion: EXAMINATION_REDACTION_POLICY_VERSION,
      promptTemplateVersion: EXAMINATION_PROMPT_TEMPLATE_VERSION,
    },
  }

  params.ports.archive.put(record)
  return toResult(record, {
    fromArchive: false,
    sourceReferences: params.sourceReferences,
    requestedQuestionCount: params.input.questionCount,
  })
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
    requestedQuestionCount: number
  },
): ExaminationGenerateQuestionsResult {
  const sourceLineRanges = buildReferenceSourceLineRanges(meta.sourceReferences)
  return {
    key: record.key,
    questions: normalizeQuestionAnchors(record.questions, sourceLineRanges),
    usage: record.provenance.usage,
    fromArchive: meta.fromArchive,
    requestedQuestionCount: meta.requestedQuestionCount,
    archivedProvenance: record.provenance,
    sourceReferences: meta.sourceReferences,
  }
}

function isRecordAllowedForCurrentContext(
  record: ExaminationArchiveRecord,
  input: ExaminationLookupQuestionsInput,
  sourceDescriptors: readonly string[],
): boolean {
  return scanExaminationOutputForLeaks({
    questions: record.questions,
    localIdentityContext: input.localIdentityContext,
    allowedSourceDescriptors: sourceDescriptors,
  }).ok
}

function assertOutputAllowedForCurrentContext(
  questions: readonly ExaminationQuestion[],
  input: ExaminationGenerateQuestionsInput,
  sourceDescriptors: readonly string[],
): void {
  const result = scanExaminationOutputForLeaks({
    questions,
    localIdentityContext: input.localIdentityContext,
    allowedSourceDescriptors: sourceDescriptors,
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

function validateStopInput(input: { generationControlId: string }): void {
  if (
    !isRecord(input) ||
    typeof input.generationControlId !== "string" ||
    input.generationControlId.trim().length === 0
  ) {
    throw createValidationAppError("Examination stop input is invalid.", [
      {
        path: "generationControlId",
        message: "generationControlId is required.",
      },
    ])
  }
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
    ...(mode === "generate"
      ? ["generationControlId", "regenerate", "seedQuestions"]
      : []),
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
  if (mode === "generate" && "seedQuestions" in input) {
    validateSeedQuestions(input.seedQuestions, input.questionCount, issues)
  }
  if (
    mode === "generate" &&
    (!("generationControlId" in input) ||
      typeof input.generationControlId !== "string" ||
      input.generationControlId.trim().length === 0)
  ) {
    issues.push({
      path: "generationControlId",
      message: "generationControlId is required.",
    })
  }
  if (issues.length > 0) {
    throw createValidationAppError("Examination input is invalid.", issues)
  }
}

function validateSeedQuestions(
  seedQuestions: ExaminationGenerateQuestionsInput["seedQuestions"],
  questionCount: number,
  issues: { path: string; message: string }[],
): void {
  if (seedQuestions === undefined) return
  if (!Array.isArray(seedQuestions)) {
    issues.push({
      path: "seedQuestions",
      message: "seedQuestions must be an array when present.",
    })
    return
  }
  if (
    Number.isInteger(questionCount) &&
    seedQuestions.length >= questionCount
  ) {
    issues.push({
      path: "seedQuestions",
      message: "seedQuestions must leave at least one question to generate.",
    })
  }
  for (const [index, question] of seedQuestions.entries()) {
    if (!isRecord(question)) {
      issues.push({
        path: `seedQuestions.${index}`,
        message: "Seed question is invalid.",
      })
      continue
    }
    if (
      typeof question.question !== "string" ||
      question.question.trim().length === 0
    ) {
      issues.push({
        path: `seedQuestions.${index}.question`,
        message: "Seed question text is required.",
      })
    }
    if (
      typeof question.answer !== "string" ||
      question.answer.trim().length === 0
    ) {
      issues.push({
        path: `seedQuestions.${index}.answer`,
        message: "Seed answer text is required.",
      })
    }
    validateSeedQuestionAnchor(
      question.anchor,
      `seedQuestions.${index}`,
      issues,
    )
  }
}

function validateSeedQuestionAnchor(
  anchor: unknown,
  path: string,
  issues: { path: string; message: string }[],
): void {
  if (!isRecord(anchor)) {
    issues.push({
      path: `${path}.anchor`,
      message: "Seed question anchor is required.",
    })
    return
  }
  if (anchor.sourceId !== null && typeof anchor.sourceId !== "string") {
    issues.push({
      path: `${path}.anchor.sourceId`,
      message: "Seed question anchor sourceId must be a string or null.",
    })
  }
  const { lineRange } = anchor
  if (lineRange === null) return
  if (!isRecord(lineRange)) {
    issues.push({
      path: `${path}.anchor.lineRange`,
      message: "Seed question anchor lineRange must be an object or null.",
    })
    return
  }
  if (
    !Number.isInteger(lineRange.start) ||
    !Number.isInteger(lineRange.end) ||
    (typeof lineRange.start === "number" &&
      typeof lineRange.end === "number" &&
      lineRange.end < lineRange.start)
  ) {
    issues.push({
      path: `${path}.anchor.lineRange`,
      message:
        "Seed question lineRange must contain valid start and end lines.",
    })
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

function maybeEmitPartial(params: {
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

function buildStreamedTextPreview(buffer: string): string {
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

function parseQuestions(
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

function buildPromptSourceLineRanges(
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

function buildReferenceSourceLineRanges(
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

function normalizeQuestionAnchors(
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

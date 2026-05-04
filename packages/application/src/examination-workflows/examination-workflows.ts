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
  ExaminationProvenanceDrift,
  ExaminationQuestion,
  MilestoneProgress,
  WorkflowCallOptions,
  WorkflowHandlerMap,
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
import {
  buildExaminationExcerptsFingerprint,
  canonicalizeExaminationExcerpts,
} from "./archive-key.js"
import type { ExaminationWorkflowPorts } from "./ports.js"
import { buildExaminationPrompt, stripJsonFences } from "./prompt-builder.js"

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

      const canonicalExcerpts = canonicalizeExaminationExcerpts(input.excerpts)
      const excerptsFingerprint =
        buildExaminationExcerptsFingerprint(canonicalExcerpts)
      const archiveKey: ExaminationArchiveKey = {
        groupSetId: input.groupSetId,
        personId: input.personId,
        commitOid: input.commitOid,
        questionCount: input.questionCount,
        excerptsFingerprint,
      }

      if (!input.regenerate) {
        const hit = ports.archive.get(archiveKey)
        if (hit) {
          options?.onProgress?.({
            step: 3,
            totalSteps: 3,
            label: "Returning archived questions.",
          })
          const driftResolution = resolveExaminationModelOrNull(
            input.llmSettings,
          )
          return toResult(hit, {
            fromArchive: true,
            drift: computeDrift(hit.provenance, input, driftResolution),
          })
        }
      }

      throwIfAborted(options?.signal)
      options?.onProgress?.({
        step: 2,
        totalSteps: 3,
        label: "Generating questions via LLM.",
      })

      const resolution = resolveExaminationModel(input.llmSettings)
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
        memberName: input.memberName,
        memberEmail: input.memberEmail,
        memberId: input.memberId,
        repoGitDir: input.repoGitDir,
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
  current: ExaminationModelResolution | null,
): ExaminationProvenanceDrift | null {
  const currentAssignmentContext = input.assignmentContext ?? null
  const currentCode = current?.code ?? null
  const currentEffort = current?.spec.effort ?? null
  const drift: ExaminationProvenanceDrift = {
    memberNameChanged:
      stored.memberName !== input.memberName
        ? { from: stored.memberName, to: input.memberName }
        : null,
    memberEmailChanged:
      stored.memberEmail !== input.memberEmail
        ? { from: stored.memberEmail, to: input.memberEmail }
        : null,
    repoGitDirChanged:
      stored.repoGitDir !== input.repoGitDir
        ? { from: stored.repoGitDir, to: input.repoGitDir }
        : null,
    assignmentContextChanged:
      stored.assignmentContext !== currentAssignmentContext
        ? {
            from: stored.assignmentContext ?? "",
            to: currentAssignmentContext ?? "",
          }
        : null,
    modelChanged:
      currentCode !== null && stored.model !== currentCode
        ? { from: stored.model, to: currentCode }
        : null,
    effortChanged:
      currentEffort !== null && stored.effort !== currentEffort
        ? { from: stored.effort, to: currentEffort }
        : null,
  }
  const anyChanged =
    drift.memberNameChanged !== null ||
    drift.memberEmailChanged !== null ||
    drift.repoGitDirChanged !== null ||
    drift.assignmentContextChanged !== null ||
    drift.modelChanged !== null ||
    drift.effortChanged !== null
  return anyChanged ? drift : null
}

function resolveExaminationModelOrNull(
  settings: ExaminationLlmSettings,
): ExaminationModelResolution | null {
  try {
    return resolveExaminationModel(settings)
  } catch {
    return null
  }
}

function validateInput(input: ExaminationGenerateQuestionsInput): void {
  const issues: { path: string; message: string }[] = []
  if (input.llmSettings === undefined || input.llmSettings === null) {
    issues.push({
      path: "llmSettings",
      message: "llmSettings is required.",
    })
  }
  if (input.groupSetId.trim().length === 0) {
    issues.push({ path: "groupSetId", message: "groupSetId is required." })
  }
  if (input.personId.trim().length === 0) {
    issues.push({ path: "personId", message: "personId is required." })
  }
  if (input.memberId !== null && input.memberId.trim().length === 0) {
    issues.push({
      path: "memberId",
      message: "memberId must be null or a non-empty string.",
    })
  }
  if (input.commitOid.trim().length === 0) {
    issues.push({ path: "commitOid", message: "commitOid is required." })
  }
  if (input.repoGitDir.trim().length === 0) {
    issues.push({ path: "repoGitDir", message: "repoGitDir is required." })
  }
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

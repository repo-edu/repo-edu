import type {
  ExaminationArchiveKey,
  ExaminationArchiveRecord,
  ExaminationGenerateQuestionsInput,
  ExaminationGenerateQuestionsResult,
  ExaminationLocalIdentityContext,
  ExaminationLookupQuestionsInput,
  ExaminationQuestion,
  ExaminationSourceReference,
} from "@repo-edu/application-contract"
import {
  buildExaminationGenerationContextFingerprint,
  EXAMINATION_PROMPT_TEMPLATE_VERSION,
  EXAMINATION_REDACTION_POLICY_VERSION,
} from "@repo-edu/application-contract"
import { createValidationAppError } from "../core.js"
import type { ExaminationModelResolution } from "./model-resolution.js"
import { resolveExaminationModel } from "./model-resolution.js"
import type { ExaminationWorkflowPorts } from "./ports.js"
import {
  buildReferenceSourceLineRanges,
  normalizeQuestionAnchors,
} from "./question-parser.js"
import { scanExaminationOutputForLeaks } from "./redaction.js"

export function archiveSoftStoppedQuestions(params: {
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

  putSupersedingArchiveRecord(params.ports.archive, record)
  return toResult(record, {
    fromArchive: false,
    sourceReferences: params.sourceReferences,
    requestedQuestionCount: params.input.questionCount,
  })
}

export function putSupersedingArchiveRecord(
  archive: ExaminationWorkflowPorts["archive"],
  record: ExaminationArchiveRecord,
): void {
  archive.put(record)
  for (const existingRecord of archive.listForGenerationContext(record.key)) {
    if (sameArchiveKey(existingRecord.key, record.key)) continue
    archive.remove(existingRecord.key)
  }
}

function sameArchiveKey(
  a: ExaminationArchiveKey,
  b: ExaminationArchiveKey,
): boolean {
  return (
    a.personId === b.personId &&
    a.contentScopeId === b.contentScopeId &&
    a.questionCount === b.questionCount &&
    a.providerPayloadFingerprint === b.providerPayloadFingerprint &&
    a.generationContextFingerprint === b.generationContextFingerprint
  )
}

export function resolveArchiveContext(
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

export function toResult(
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

export function isRecordAllowedForCurrentContext(
  record: ExaminationArchiveRecord,
  input: { localIdentityContext: ExaminationLocalIdentityContext },
  sourceDescriptors: readonly string[],
): boolean {
  return scanExaminationOutputForLeaks({
    questions: record.questions,
    localIdentityContext: input.localIdentityContext,
    allowedSourceDescriptors: sourceDescriptors,
  }).ok
}

export function isRecordCurrentArchivePolicy(
  record: ExaminationArchiveRecord,
): boolean {
  return (
    record.provenance.redactionPolicyVersion ===
      EXAMINATION_REDACTION_POLICY_VERSION &&
    record.provenance.promptTemplateVersion ===
      EXAMINATION_PROMPT_TEMPLATE_VERSION
  )
}

export function assertOutputAllowedForCurrentContext(
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

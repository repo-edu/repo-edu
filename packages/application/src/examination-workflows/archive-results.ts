import type {
  ExaminationArchiveKey,
  ExaminationArchiveRecord,
  ExaminationGenerateQuestionsInput,
  ExaminationGenerateQuestionsResult,
  ExaminationLookupQuestionsInput,
  ExaminationQuestion,
  ExaminationSourceReference,
} from "@repo-edu/application-contract"
import { buildExaminationGenerationContextFingerprint } from "@repo-edu/application-contract"
import { createValidationAppError } from "../core.js"
import type { ExaminationModelResolution } from "./model-resolution.js"
import { resolveExaminationModel } from "./model-resolution.js"
import type { ExaminationWorkflowPorts } from "./ports.js"
import {
  admitExaminationQuestions,
  admitExaminationRecord,
  type ExaminationPrivacyAdmissionReason,
  type ExaminationPrivacyAdmissionResult,
  type ExaminationPrivacyContext,
  type ExaminationPrivacyWarning,
} from "./privacy-policy.js"
import { EXAMINATION_PROMPT_TEMPLATE_VERSION } from "./prompt-builder.js"
import {
  buildReferenceSourceLineRanges,
  normalizeQuestionAnchors,
} from "./question-parser.js"

export function archiveSoftStoppedQuestions(params: {
  acceptedQuestions: readonly ExaminationQuestion[]
  archiveKey: ExaminationArchiveKey
  input: ExaminationGenerateQuestionsInput
  minimumAcceptedQuestionCount: number
  ports: ExaminationWorkflowPorts
  resolution: ExaminationModelResolution
  sourceReferences: ExaminationSourceReference[]
  privacyContext: ExaminationPrivacyContext
  onPrivacyWarnings?: (warnings: readonly ExaminationPrivacyWarning[]) => void
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
      redactionPolicyVersion: params.privacyContext.redactionPolicyVersion,
      promptTemplateVersion: EXAMINATION_PROMPT_TEMPLATE_VERSION,
    },
  }

  params.onPrivacyWarnings?.(
    assertRecordAllowedForPrivacy(record, params.privacyContext),
  )
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
  privacyContext: ExaminationPrivacyContext,
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
      redactionPolicyVersion: privacyContext.redactionPolicyVersion,
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

export function admitRecordForCurrentContext(
  record: ExaminationArchiveRecord,
  privacyContext: ExaminationPrivacyContext,
): ExaminationPrivacyAdmissionResult {
  return admitExaminationRecord({ record, context: privacyContext })
}

export function isRecordCurrentPromptTemplate(
  record: ExaminationArchiveRecord,
): boolean {
  return (
    record.provenance.promptTemplateVersion ===
    EXAMINATION_PROMPT_TEMPLATE_VERSION
  )
}

export function assertOutputAllowedForCurrentContext(
  questions: readonly ExaminationQuestion[],
  privacyContext: ExaminationPrivacyContext,
): readonly ExaminationPrivacyWarning[] {
  const result = admitExaminationQuestions({
    questions,
    context: privacyContext,
  })
  if (result.ok) return result.warnings
  const message = admissionMessage(result.reason)
  throw createValidationAppError("Provider output failed privacy validation.", [
    { path: "questions", message },
  ])
}

export function assertRecordAllowedForPrivacy(
  record: ExaminationArchiveRecord,
  privacyContext: ExaminationPrivacyContext,
): readonly ExaminationPrivacyWarning[] {
  const result = admitExaminationRecord({ record, context: privacyContext })
  if (result.ok) return result.warnings
  throw createValidationAppError("Provider output failed privacy validation.", [
    { path: "questions", message: admissionMessage(result.reason) },
  ])
}

export function privacyWarningMessage(
  warning: ExaminationPrivacyWarning,
): string {
  switch (warning) {
    case "ambiguous-known-identifier":
      return "Generated text contains a local name that is also a common word. Privacy validation could not classify that occurrence safely; review the questions before use."
  }
}

function admissionMessage(reason: ExaminationPrivacyAdmissionReason): string {
  switch (reason) {
    case "email":
      return "Provider output contained an email address. Generate again to request fresh redacted output; report this if it persists."
    case "secret":
      return "Provider output contained a secret literal. Generate again to request fresh redacted output; report this if it persists."
    case "known-identifier":
      return "Provider output echoed a known local identifier verbatim. Generate again to request fresh redacted output; report this if it persists."
    case "redaction-policy-version":
      return "Provider output used a superseded privacy policy. Generate again to create a current record."
  }
}

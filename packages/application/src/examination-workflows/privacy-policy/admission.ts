import type { ExaminationQuestion } from "@repo-edu/application-contract"
import {
  collectAdmissionIdentityCandidates,
  containsRequiredCheck,
  countAmbiguousNameMatches,
  isAllowedSourceDescriptorName,
  sourceDescriptorNameSet,
} from "./candidate-selection.js"
import { readExaminationPrivacyContext } from "./context.js"
import {
  collectSecretCandidates,
  findEmailAddressSpans,
  normalizeKnownText,
} from "./detection.js"
import { CURRENT_EXAMINATION_REDACTION_POLICY_VERSION } from "./policy-version.js"
import type {
  ExaminationPrivacyAdmissionResult,
  ExaminationPrivacyContext,
  ExaminationPrivacyWarning,
  QuestionCarrier,
} from "./types.js"

function questionsText(questions: readonly ExaminationQuestion[]): string {
  return questions
    .map((question) => `${question.question}\n${question.answer}`)
    .join("\n")
}

function admitContextFreeText(text: string): ExaminationPrivacyAdmissionResult {
  if (findEmailAddressSpans(text).length > 0) {
    return { ok: false, reason: "email" }
  }
  if (collectSecretCandidates(text).length > 0) {
    return { ok: false, reason: "secret" }
  }
  return { ok: true, warnings: [] }
}

export function assertExaminationPromptPrivacy(params: {
  renderedPrompt: string
  context: ExaminationPrivacyContext
}): void {
  const context = readExaminationPrivacyContext(params.context)
  const contextFree = admitContextFreeText(params.renderedPrompt)
  if (!contextFree.ok) {
    const kind =
      contextFree.reason === "email" ? "email address" : "secret literal"
    throw new Error(
      `Examination prompt redaction failed: a ${kind} remained in the provider prompt.`,
    )
  }
  const allowedSourceDescriptors = sourceDescriptorNameSet(
    context.allowedSourceDescriptors,
  )
  const leaked = context.requiredChecks.find((check) => {
    if (
      isAllowedSourceDescriptorName(
        check.kind,
        normalizeKnownText(check.value).toLowerCase(),
        allowedSourceDescriptors,
      )
    ) {
      return false
    }
    return (
      check.assertGlobally &&
      containsRequiredCheck(params.renderedPrompt, check)
    )
  })
  if (leaked) {
    throw new Error(
      `Examination prompt redaction failed: a ${leaked.kind} remained in the provider prompt.`,
    )
  }
}

export function admitExaminationQuestions(params: {
  questions: readonly ExaminationQuestion[]
  context: ExaminationPrivacyContext
}): ExaminationPrivacyAdmissionResult {
  const context = readExaminationPrivacyContext(params.context)
  const text = questionsText(params.questions)
  const contextFree = admitContextFreeText(text)
  if (!contextFree.ok) return contextFree
  const allowedSourceDescriptors = sourceDescriptorNameSet(
    context.allowedSourceDescriptors,
  )
  const knownIdentifierLeaks = collectAdmissionIdentityCandidates({
    text,
    localIdentityContext: context.localIdentityContext,
  }).filter(
    (candidate) =>
      !isAllowedSourceDescriptorName(
        candidate.replacementClass,
        candidate.comparisonKey,
        allowedSourceDescriptors,
      ),
  )
  if (
    knownIdentifierLeaks.some(
      (candidate) => candidate.replacementClass === "email",
    )
  ) {
    return { ok: false, reason: "email" }
  }
  if (knownIdentifierLeaks.length > 0) {
    return { ok: false, reason: "known-identifier" }
  }
  const warnings: ExaminationPrivacyWarning[] =
    countAmbiguousNameMatches(text, context.localIdentityContext.names) > 0
      ? ["ambiguous-known-identifier"]
      : []
  return { ok: true, warnings }
}

export function admitExaminationRecord(params: {
  record: QuestionCarrier
  context: ExaminationPrivacyContext
}): ExaminationPrivacyAdmissionResult {
  readExaminationPrivacyContext(params.context)
  if (
    params.record.provenance.redactionPolicyVersion !==
    params.context.redactionPolicyVersion
  ) {
    return { ok: false, reason: "redaction-policy-version" }
  }
  return admitExaminationQuestions({
    questions: params.record.questions,
    context: params.context,
  })
}

export function admitExaminationRecordWithoutContext(
  record: QuestionCarrier,
): ExaminationPrivacyAdmissionResult {
  if (
    record.provenance.redactionPolicyVersion !==
    CURRENT_EXAMINATION_REDACTION_POLICY_VERSION
  ) {
    return { ok: false, reason: "redaction-policy-version" }
  }
  return admitContextFreeText(questionsText(record.questions))
}

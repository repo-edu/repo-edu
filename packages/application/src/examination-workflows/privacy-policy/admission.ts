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
  findLiteralMatches,
  normalizeKnownText,
} from "./detection.js"
import { CURRENT_EXAMINATION_REDACTION_POLICY_VERSION } from "./policy-version.js"
import type {
  ExaminationPrivacyAdmissionResult,
  ExaminationPrivacyContext,
  ExaminationPrivacyWarning,
  QuestionCarrier,
  RedactionRequiredCheck,
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

function isInsideSingleLineQuotedSpan(
  text: string,
  start: number,
  end: number,
): boolean {
  const lineStart = text.lastIndexOf("\n", Math.max(0, start - 1)) + 1
  const lineEndIndex = text.indexOf("\n", end)
  const lineEnd = lineEndIndex === -1 ? text.length : lineEndIndex
  const line = text.slice(lineStart, lineEnd)
  const localStart = start - lineStart
  const localEnd = end - lineStart

  for (const quote of ["'", '"', "`"]) {
    let open = false
    let escaped = false
    let startedInside = false
    for (let index = 0; index <= line.length; index++) {
      if (index === localStart && open) startedInside = true
      if (index === localEnd && startedInside && open) return true
      const character = line[index]
      if (character === undefined) continue
      if (escaped) {
        escaped = false
      } else if (character === "\\") {
        escaped = true
      } else if (character === quote) {
        open = !open
      }
    }
  }
  return false
}

function containsRequiredCheckInStringLiteralContext(
  text: string,
  check: RedactionRequiredCheck,
): boolean {
  return findLiteralMatches({
    text,
    value: check.value,
    caseSensitive: check.caseSensitive,
  }).some((match) => isInsideSingleLineQuotedSpan(text, match.start, match.end))
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
    if (check.assertGlobally) {
      return containsRequiredCheck(params.renderedPrompt, check)
    }
    return (
      check.assertInStringLiteral &&
      containsRequiredCheckInStringLiteralContext(params.renderedPrompt, check)
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

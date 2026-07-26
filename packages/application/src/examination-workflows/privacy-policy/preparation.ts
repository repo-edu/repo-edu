import {
  canonicalizeExaminationLocalIdentityContext,
  type ExaminationQuestion,
} from "@repo-edu/application-contract"
import {
  createExaminationPrivacyContext,
  readExaminationPrivacyContext,
} from "./context.js"
import { buildRedactionPlaceholderPlan } from "./placeholder-allocation.js"
import { CURRENT_EXAMINATION_REDACTION_POLICY_VERSION } from "./policy-version.js"
import { redactExaminationPrivacySource } from "./source-replacement.js"
import type {
  ExaminationPrivacyContext,
  ExaminationPrivacyPreparation,
  ExaminationPrivacySource,
  RedactionRequiredCheck,
} from "./types.js"

function promptQuestionSource(text: string): ExaminationPrivacySource {
  return {
    lines: text.split("\n"),
    spans:
      text.length === 0
        ? []
        : [{ start: 0, end: text.length, kind: "string-literal" }],
    sourceDescriptor: "",
  }
}

export function prepareExaminationPrivacy(params: {
  sources: readonly ExaminationPrivacySource[]
  localIdentityContext: Parameters<
    typeof canonicalizeExaminationLocalIdentityContext
  >[0]
}): ExaminationPrivacyPreparation {
  const localIdentityContext = canonicalizeExaminationLocalIdentityContext(
    params.localIdentityContext,
  )
  const sources = params.sources.map((source) => ({
    lines: [...source.lines],
    spans: source.spans.map((span) => ({ ...span })),
    sourceDescriptor: source.sourceDescriptor,
  }))
  const placeholderPlan = buildRedactionPlaceholderPlan({
    sources,
    localIdentityContext,
  })
  const requiredChecks: RedactionRequiredCheck[] = []
  const preparedSources = sources.map((source) => {
    const prepared = redactExaminationPrivacySource({
      lines: source.lines,
      spans: source.spans,
      localIdentityContext,
      redactionPolicyVersion: CURRENT_EXAMINATION_REDACTION_POLICY_VERSION,
      placeholderPlan,
    })
    requiredChecks.push(...prepared.requiredChecks)
    return { lines: prepared.lines, report: prepared.report }
  })

  return {
    sources: preparedSources,
    context: createExaminationPrivacyContext({
      redactionPolicyVersion: CURRENT_EXAMINATION_REDACTION_POLICY_VERSION,
      requiredChecks,
      localIdentityContext,
      allowedSourceDescriptors: sources.map(
        (source) => source.sourceDescriptor,
      ),
    }),
  }
}

export function prepareExaminationPromptSeedQuestions(params: {
  questions: readonly ExaminationQuestion[]
  context: ExaminationPrivacyContext
}): ExaminationQuestion[] {
  const context = readExaminationPrivacyContext(params.context)
  const sources = params.questions.flatMap((question) => [
    promptQuestionSource(question.question),
    promptQuestionSource(question.answer),
  ])
  const placeholderPlan = buildRedactionPlaceholderPlan({
    sources,
    localIdentityContext: context.localIdentityContext,
  })
  const prepared = sources.map((source) =>
    redactExaminationPrivacySource({
      lines: source.lines,
      spans: source.spans,
      localIdentityContext: context.localIdentityContext,
      redactionPolicyVersion: params.context.redactionPolicyVersion,
      placeholderPlan,
    }),
  )

  return params.questions.map((question, index) => {
    const preparedQuestion = prepared[index * 2]
    const preparedAnswer = prepared[index * 2 + 1]
    if (preparedQuestion === undefined || preparedAnswer === undefined) {
      throw new Error("Missing prepared examination prompt seed question.")
    }
    return {
      ...question,
      question: preparedQuestion.lines.join("\n"),
      answer: preparedAnswer.lines.join("\n"),
    }
  })
}

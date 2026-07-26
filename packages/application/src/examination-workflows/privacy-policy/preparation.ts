import { canonicalizeExaminationLocalIdentityContext } from "@repo-edu/application-contract"
import { createExaminationPrivacyContext } from "./context.js"
import { buildRedactionPlaceholderPlan } from "./placeholder-allocation.js"
import { CURRENT_EXAMINATION_REDACTION_POLICY_VERSION } from "./policy-version.js"
import { redactExaminationPrivacySource } from "./source-replacement.js"
import type {
  ExaminationPrivacyPreparation,
  ExaminationPrivacySource,
  RedactionRequiredCheck,
} from "./types.js"

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

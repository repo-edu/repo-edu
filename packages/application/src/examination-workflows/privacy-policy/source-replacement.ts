import type { ExaminationLocalIdentityContext } from "@repo-edu/application-contract"
import {
  collectAdmissionIdentityCandidates,
  collectSourceReplacementCandidates,
  countAmbiguousNameMatches,
  selectNonOverlappingCandidates,
} from "./candidate-selection.js"
import { collectEmailCandidates, collectSecretCandidates } from "./detection.js"
import { placeholderKey, placeholderStem } from "./placeholder-allocation.js"
import type {
  ClassifiedSourceSpan,
  RedactionPlaceholderPlan,
  RedactionReport,
  RedactionRequiredCheck,
  ReplacementCandidate,
  ReplacementClass,
} from "./types.js"

function buildReplacementText(original: string, placeholder: string): string {
  if (!original.includes("\n")) return placeholder
  const lines = original.split("\n")
  return [
    placeholder.padEnd(lines[0].length, " "),
    ...lines.slice(1).map((line) => " ".repeat(line.length)),
  ].join("\n")
}

function applyReplacements(params: {
  text: string
  candidates: readonly ReplacementCandidate[]
  placeholderPlan: RedactionPlaceholderPlan
}): {
  text: string
  replacementClasses: ReplacementClass[]
  requiredChecks: RedactionRequiredCheck[]
} {
  const replacementClasses = new Set<ReplacementClass>()
  const requiredChecks: RedactionRequiredCheck[] = []
  let out = ""
  let cursor = 0

  for (const candidate of params.candidates) {
    out += params.text.slice(cursor, candidate.start)
    const placeholder = params.placeholderPlan.placeholderByKey.get(
      placeholderKey(candidate),
    )
    if (placeholder === undefined) {
      throw new Error(
        `Missing ${placeholderStem(candidate.replacementClass)} placeholder.`,
      )
    }
    const original = params.text.slice(candidate.start, candidate.end)
    out += buildReplacementText(original, placeholder)
    replacementClasses.add(candidate.replacementClass)
    requiredChecks.push({
      kind: candidate.replacementClass,
      value: candidate.value,
      caseSensitive: candidate.caseSensitive,
      assertGlobally: candidate.assertGlobally,
      assertInStringLiteral: candidate.assertInStringLiteral,
    })
    cursor = candidate.end
  }

  out += params.text.slice(cursor)
  return {
    text: out,
    replacementClasses: [...replacementClasses],
    requiredChecks,
  }
}

function countKnownIdentifierLeaks(
  text: string,
  context: ExaminationLocalIdentityContext,
): number {
  return collectAdmissionIdentityCandidates({
    text,
    localIdentityContext: context,
  }).filter((candidate) => candidate.replacementClass !== "email").length
}

export function redactExaminationPrivacySource(params: {
  lines: readonly string[]
  spans: readonly ClassifiedSourceSpan[]
  localIdentityContext: ExaminationLocalIdentityContext
  redactionPolicyVersion: number
  placeholderPlan: RedactionPlaceholderPlan
}): {
  lines: string[]
  report: RedactionReport
  requiredChecks: RedactionRequiredCheck[]
} {
  const text = params.lines.join("\n")
  const candidates = selectNonOverlappingCandidates(
    collectSourceReplacementCandidates({
      text,
      localIdentityContext: params.localIdentityContext,
      spans: params.spans,
    }),
  )
  const applied = applyReplacements({
    text,
    candidates,
    placeholderPlan: params.placeholderPlan,
  })
  return {
    lines: applied.text.split("\n"),
    requiredChecks: applied.requiredChecks,
    report: {
      redactionPolicyVersion: params.redactionPolicyVersion,
      replacementClasses: applied.replacementClasses.toSorted(),
      residualScan: {
        ambiguousKnownIdentifiers: countAmbiguousNameMatches(
          applied.text,
          params.localIdentityContext.names,
        ),
        emails: collectEmailCandidates(
          applied.text,
          params.localIdentityContext.emails,
        ).length,
        knownIdentifiers: countKnownIdentifierLeaks(
          applied.text,
          params.localIdentityContext,
        ),
        secrets: collectSecretCandidates(applied.text).length,
      },
    },
  }
}

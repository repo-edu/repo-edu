import type { ExaminationLocalIdentityContext } from "@repo-edu/application-contract"
import {
  collectSourceReplacementCandidates,
  selectNonOverlappingCandidates,
} from "./candidate-selection.js"
import type {
  ExaminationPrivacySource,
  RedactionPlaceholderPlan,
  ReplacementCandidate,
  ReplacementClass,
} from "./types.js"

export function placeholderStem(replacementClass: ReplacementClass): string {
  switch (replacementClass) {
    case "email":
      return "redacted-email"
    case "secret":
      return "redacted-secret"
    case "name":
      return "redacted-name"
    case "opaqueIdentifier":
      return "redacted-id"
    case "gitUsername":
      return "redacted-git-username"
  }
}

export function placeholderKey(candidate: ReplacementCandidate): string {
  return `${candidate.replacementClass}:${candidate.comparisonKey}`
}

function replacementClassRank(replacementClass: ReplacementClass): number {
  switch (replacementClass) {
    case "email":
      return 1
    case "secret":
      return 2
    case "name":
      return 3
    case "opaqueIdentifier":
      return 4
    case "gitUsername":
      return 5
  }
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

export function buildRedactionPlaceholderPlan(params: {
  sources: readonly ExaminationPrivacySource[]
  localIdentityContext: ExaminationLocalIdentityContext
}): RedactionPlaceholderPlan {
  const unique = new Map<
    string,
    { replacementClass: ReplacementClass; comparisonKey: string }
  >()

  for (const source of params.sources) {
    const candidates = selectNonOverlappingCandidates(
      collectSourceReplacementCandidates({
        text: source.lines.join("\n"),
        localIdentityContext: params.localIdentityContext,
        spans: source.spans,
      }),
    )
    for (const candidate of candidates) {
      const key = placeholderKey(candidate)
      if (!unique.has(key)) {
        unique.set(key, {
          replacementClass: candidate.replacementClass,
          comparisonKey: candidate.comparisonKey,
        })
      }
    }
  }

  const placeholderByKey = new Map<string, string>()
  const countByClass = new Map<ReplacementClass, number>()
  const sorted = [...unique.entries()].toSorted(([, left], [, right]) => {
    const rank =
      replacementClassRank(left.replacementClass) -
      replacementClassRank(right.replacementClass)
    return rank === 0
      ? compareStrings(left.comparisonKey, right.comparisonKey)
      : rank
  })

  for (const [key, entry] of sorted) {
    const next = (countByClass.get(entry.replacementClass) ?? 0) + 1
    countByClass.set(entry.replacementClass, next)
    placeholderByKey.set(
      key,
      `<${placeholderStem(entry.replacementClass)}-${next}>`,
    )
  }

  return { placeholderByKey }
}

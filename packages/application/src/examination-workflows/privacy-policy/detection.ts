import { LinkifyIt } from "linkify-it"

export { collectSecretCandidates } from "./secret-detection.js"

import type { ReplacementCandidate, Span } from "./types.js"

const linkify = new LinkifyIt()
linkify.set({
  fuzzyEmail: true,
  fuzzyIP: false,
  fuzzyLink: false,
  urlAuth: true,
})

const identifierContinuationCharacter = /^[\p{L}\p{N}\p{M}\p{Pc}$-]$/u

export function normalizeKnownText(value: string): string {
  return value.trim().split(/\s+/).join(" ")
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function codePointBefore(text: string, index: number): string | null {
  if (index <= 0) return null
  const last = text.charCodeAt(index - 1)
  const start =
    last >= 0xdc00 &&
    last <= 0xdfff &&
    index >= 2 &&
    text.charCodeAt(index - 2) >= 0xd800 &&
    text.charCodeAt(index - 2) <= 0xdbff
      ? index - 2
      : index - 1
  return text.slice(start, index)
}

function codePointAfter(text: string, index: number): string | null {
  if (index >= text.length) return null
  const codePoint = text.codePointAt(index)
  if (codePoint === undefined) return null
  return String.fromCodePoint(codePoint)
}

function hasBoundary(text: string, start: number, end: number): boolean {
  const before = codePointBefore(text, start)
  const after = codePointAfter(text, end)
  return (
    (before === null || !identifierContinuationCharacter.test(before)) &&
    (after === null || !identifierContinuationCharacter.test(after))
  )
}

export function findEmailAddressSpans(text: string): Span[] {
  return (linkify.match(text) ?? [])
    .filter((match) => match.schema === "mailto:" || match.text.includes("@"))
    .map((match) => ({ start: match.index, end: match.lastIndex }))
}

export function findLiteralMatches(params: {
  text: string
  value: string
  caseSensitive: boolean
}): Span[] {
  const normalized = normalizeKnownText(params.value)
  if (normalized.length === 0) return []
  const pattern = normalized.split(/\s+/).map(escapeRegExp).join("\\s+")
  const regex = new RegExp(pattern, params.caseSensitive ? "gu" : "giu")
  const spans: Span[] = []
  for (const match of params.text.matchAll(regex)) {
    if (match.index === undefined) continue
    const start = match.index
    const end = start + match[0].length
    if (hasBoundary(params.text, start, end)) spans.push({ start, end })
  }
  return spans
}

export function collectEmailCandidates(
  text: string,
  knownEmails: readonly string[],
): ReplacementCandidate[] {
  const shaped = findEmailAddressSpans(text).map<ReplacementCandidate>(
    (span) => {
      const value = text.slice(span.start, span.end)
      return {
        ...span,
        replacementClass: "email",
        value,
        comparisonKey: value.toLowerCase(),
        caseSensitive: false,
        assertGlobally: true,
        assertInStringLiteral: false,
      }
    },
  )
  return [
    ...shaped,
    ...collectLiteralCandidates({
      text,
      values: knownEmails,
      replacementClass: "email",
      caseSensitive: false,
    }),
  ]
}

export function collectLiteralCandidates(params: {
  text: string
  values: readonly string[]
  replacementClass: "email" | "opaqueIdentifier" | "gitUsername"
  caseSensitive: boolean
}): ReplacementCandidate[] {
  const candidates: ReplacementCandidate[] = []
  for (const value of params.values) {
    const normalized = normalizeKnownText(value)
    if (normalized.length === 0) continue
    for (const match of findLiteralMatches({
      text: params.text,
      value: normalized,
      caseSensitive: params.caseSensitive,
    })) {
      candidates.push({
        ...match,
        replacementClass: params.replacementClass,
        value: params.text.slice(match.start, match.end),
        comparisonKey: params.caseSensitive
          ? normalized
          : normalized.toLowerCase(),
        caseSensitive: params.caseSensitive,
        assertGlobally: true,
        assertInStringLiteral: false,
      })
    }
  }
  return candidates
}

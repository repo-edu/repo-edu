import type { ReplacementCandidate } from "./types.js"

const base64UrlCharacter = /^[A-Za-z0-9_-]$/

const TOKEN_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  /\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g,
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_.-]{36,251}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,244}\b/g,
  /\bxoxb-[0-9]{10,13}-[0-9]{10,13}-[A-Za-z0-9]{20,}\b/g,
  /\bAKIA[A-Z0-9]{16}\b/g,
] as const

function candidate(
  text: string,
  start: number,
  end: number,
): ReplacementCandidate {
  const value = text.slice(start, end)
  return {
    start,
    end,
    replacementClass: "secret",
    value,
    comparisonKey: value,
    caseSensitive: true,
    assertGlobally: true,
  }
}

function collectTokenCandidates(text: string): ReplacementCandidate[] {
  const candidates: ReplacementCandidate[] = []
  for (const pattern of TOKEN_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      if (match.index === undefined) continue
      candidates.push(
        candidate(text, match.index, match.index + match[0].length),
      )
    }
  }
  return candidates
}

function collectJwtCandidates(text: string): ReplacementCandidate[] {
  const regex = /[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g
  const candidates: ReplacementCandidate[] = []
  for (const match of text.matchAll(regex)) {
    if (match.index === undefined) continue
    const start = match.index
    const end = start + match[0].length
    const before = text[start - 1]
    const after = text[end]
    if (
      (before !== undefined && base64UrlCharacter.test(before)) ||
      (after !== undefined && base64UrlCharacter.test(after))
    ) {
      continue
    }
    candidates.push(candidate(text, start, end))
  }
  return candidates
}

function collectPemCandidates(text: string): ReplacementCandidate[] {
  const candidates: ReplacementCandidate[] = []
  const begin = /-----BEGIN ([A-Z0-9 ]*PRIVATE KEY)-----/g
  for (let match = begin.exec(text); match !== null; match = begin.exec(text)) {
    if (match.index === undefined) continue
    const start = match.index
    const label = match[1]
    if (label === undefined) continue
    const endMarker = `-----END ${label}-----`
    const markerIndex = text.indexOf(endMarker, start + match[0].length)
    const end = markerIndex < 0 ? text.length : markerIndex + endMarker.length
    candidates.push(candidate(text, start, end))
    if (markerIndex < 0) break
    begin.lastIndex = end
  }
  return candidates
}

export function collectSecretCandidates(text: string): ReplacementCandidate[] {
  return [
    ...collectTokenCandidates(text),
    ...collectJwtCandidates(text),
    ...collectPemCandidates(text),
  ]
}

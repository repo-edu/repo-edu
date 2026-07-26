import type { ExaminationLocalIdentityContext } from "@repo-edu/application-contract"
import {
  collectEmailCandidates,
  collectLiteralCandidates,
  collectSecretCandidates,
  findLiteralMatches,
  normalizeKnownText,
} from "./detection.js"
import type {
  ClassifiedSourceSpan,
  RedactionRequiredCheck,
  ReplacementCandidate,
  ReplacementClass,
  SourceSpanKind,
  Span,
} from "./types.js"

const NAME_STOPLIST = new Set<string>([
  "add",
  "admin",
  "alice",
  "api",
  "app",
  "array",
  "auth",
  "base",
  "bob",
  "build",
  "cache",
  "carol",
  "case",
  "class",
  "code",
  "config",
  "count",
  "data",
  "date",
  "default",
  "delete",
  "error",
  "event",
  "eve",
  "file",
  "filter",
  "find",
  "first",
  "form",
  "get",
  "hash",
  "id",
  "index",
  "input",
  "item",
  "jane",
  "john",
  "key",
  "last",
  "line",
  "list",
  "load",
  "long",
  "main",
  "map",
  "mark",
  "mason",
  "may",
  "name",
  "node",
  "page",
  "parse",
  "path",
  "post",
  "read",
  "render",
  "request",
  "response",
  "result",
  "run",
  "save",
  "set",
  "state",
  "string",
  "test",
  "text",
  "type",
  "update",
  "user",
  "value",
  "view",
  "will",
  "write",
])

function isCoveredByKind(
  spans: readonly ClassifiedSourceSpan[],
  match: Span,
  kind: SourceSpanKind,
): boolean {
  let cursor = match.start
  for (const span of spans) {
    if (span.end <= cursor) continue
    if (span.start > cursor || span.kind !== kind) return false
    cursor = Math.min(match.end, span.end)
    if (cursor >= match.end) return true
  }
  return false
}

function collectNameCandidates(params: {
  text: string
  names: readonly string[]
  spans: readonly ClassifiedSourceSpan[]
  mode: "source" | "prose"
}): ReplacementCandidate[] {
  const candidates: ReplacementCandidate[] = []
  for (const name of params.names) {
    const normalized = normalizeKnownText(name)
    if (normalized.length === 0) continue
    const isMultiToken = /\s/.test(normalized)
    const distinctive =
      isMultiToken || !NAME_STOPLIST.has(normalized.toLowerCase())
    for (const match of findLiteralMatches({
      text: params.text,
      value: normalized,
      caseSensitive: false,
    })) {
      if (!isMultiToken && !distinctive) {
        if (params.mode === "prose") continue
        if (!isCoveredByKind(params.spans, match, "string-literal")) continue
      }
      candidates.push({
        ...match,
        replacementClass: "name",
        value: params.text.slice(match.start, match.end),
        comparisonKey: normalized.toLowerCase(),
        caseSensitive: false,
        assertGlobally: isMultiToken || distinctive,
      })
    }
  }
  return candidates
}

export function collectSourceReplacementCandidates(params: {
  text: string
  localIdentityContext: ExaminationLocalIdentityContext
  spans: readonly ClassifiedSourceSpan[]
}): ReplacementCandidate[] {
  return [
    ...collectEmailCandidates(params.text, params.localIdentityContext.emails),
    ...collectSecretCandidates(params.text),
    ...collectNameCandidates({
      text: params.text,
      names: params.localIdentityContext.names,
      spans: params.spans,
      mode: "source",
    }),
    ...collectLiteralCandidates({
      text: params.text,
      values: params.localIdentityContext.opaqueIdentifiers,
      replacementClass: "opaqueIdentifier",
      caseSensitive: true,
    }),
    ...collectLiteralCandidates({
      text: params.text,
      values: params.localIdentityContext.gitUsernames,
      replacementClass: "gitUsername",
      caseSensitive: false,
    }),
  ]
}

export function collectAdmissionIdentityCandidates(params: {
  text: string
  localIdentityContext: ExaminationLocalIdentityContext
}): ReplacementCandidate[] {
  return [
    ...collectEmailCandidates(params.text, params.localIdentityContext.emails),
    ...collectNameCandidates({
      text: params.text,
      names: params.localIdentityContext.names,
      spans: [],
      mode: "prose",
    }),
    ...collectLiteralCandidates({
      text: params.text,
      values: params.localIdentityContext.opaqueIdentifiers,
      replacementClass: "opaqueIdentifier",
      caseSensitive: true,
    }),
    ...collectLiteralCandidates({
      text: params.text,
      values: params.localIdentityContext.gitUsernames,
      replacementClass: "gitUsername",
      caseSensitive: false,
    }),
  ]
}

export function countAmbiguousNameMatches(
  text: string,
  names: readonly string[],
): number {
  let count = 0
  for (const name of names) {
    const normalized = normalizeKnownText(name)
    if (
      normalized.length === 0 ||
      /\s/.test(normalized) ||
      !NAME_STOPLIST.has(normalized.toLowerCase())
    ) {
      continue
    }
    count += findLiteralMatches({
      text,
      value: normalized,
      caseSensitive: false,
    }).length
  }
  return count
}

export function selectNonOverlappingCandidates(
  candidates: readonly ReplacementCandidate[],
): ReplacementCandidate[] {
  const selected: ReplacementCandidate[] = []
  const occupied: Span[] = []
  for (const candidate of [...candidates].toSorted((a, b) => {
    if (a.start !== b.start) return a.start - b.start
    return b.end - b.start - (a.end - a.start)
  })) {
    if (candidate.end <= candidate.start) continue
    if (
      occupied.some(
        (span) => candidate.start < span.end && candidate.end > span.start,
      )
    ) {
      continue
    }
    selected.push(candidate)
    occupied.push({ start: candidate.start, end: candidate.end })
  }
  return selected.toSorted((a, b) => a.start - b.start)
}

export function containsRequiredCheck(
  text: string,
  check: RedactionRequiredCheck,
): boolean {
  if (check.kind === "secret") return text.includes(check.value)
  return (
    findLiteralMatches({
      text,
      value: check.value,
      caseSensitive: check.caseSensitive,
    }).length > 0
  )
}

export function sourceDescriptorNameSet(
  descriptors: readonly string[],
): ReadonlySet<string> {
  return new Set(
    descriptors
      .map((descriptor) => normalizeKnownText(descriptor).toLowerCase())
      .filter((descriptor) => descriptor.length > 0),
  )
}

export function isAllowedSourceDescriptorName(
  replacementClass: ReplacementClass,
  comparisonKey: string,
  allowedSourceDescriptors: ReadonlySet<string>,
): boolean {
  return (
    replacementClass === "name" && allowedSourceDescriptors.has(comparisonKey)
  )
}

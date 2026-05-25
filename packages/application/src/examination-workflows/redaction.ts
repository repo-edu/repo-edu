import type {
  ExaminationLocalIdentityContext,
  ExaminationQuestion,
} from "@repo-edu/application-contract"
import LinkifyIt from "linkify-it"

type Span = {
  start: number
  end: number
}

export type SourceSpanKind = "code" | "string-literal"

export type ClassifiedSourceSpan = Span & {
  kind: SourceSpanKind
}

export type RedactionRequiredCheck = {
  kind: "email" | "secret" | "name" | "opaqueIdentifier" | "gitUsername"
  value: string
  caseSensitive: boolean
  assertGlobally: boolean
}

export type RedactionReport = {
  redactionPolicyVersion: number
  replacementClasses: string[]
  residualScan: {
    emails: number
    knownIdentifiers: number
    secrets: number
  }
  requiredChecks: RedactionRequiredCheck[]
}

export type RedactionResult = {
  lines: string[]
  report: RedactionReport
}

type ReplacementClass =
  | "email"
  | "secret"
  | "name"
  | "opaqueIdentifier"
  | "gitUsername"

type ReplacementCandidate = Span & {
  replacementClass: ReplacementClass
  value: string
  comparisonKey: string
  caseSensitive: boolean
  assertGlobally: boolean
}

export type RedactionPlaceholderPlan = {
  placeholderByKey: ReadonlyMap<string, string>
}

export const EXAMINATION_NAME_STOPLIST = [
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
] as const

const NAME_STOPLIST = new Set<string>(EXAMINATION_NAME_STOPLIST)

const linkify = new LinkifyIt()
const EMAIL_SHAPE_REGEX =
  /[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)+/giu
linkify.set({ fuzzyEmail: true, fuzzyIP: false, fuzzyLink: false })

const protectedBoundaryCharacter = /^[\p{L}\p{N}\p{M}\p{Pc}$'-]$/u
const base64UrlCharacter = /^[A-Za-z0-9_-]$/

function normalizeKnownText(value: string): string {
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
    (before === null || !protectedBoundaryCharacter.test(before)) &&
    (after === null || !protectedBoundaryCharacter.test(after))
  )
}

function isCoveredByKind(
  spans: readonly ClassifiedSourceSpan[],
  match: Span,
  kind: SourceSpanKind,
): boolean {
  let cursor = match.start
  for (const span of spans) {
    if (span.end <= cursor) continue
    if (span.start > cursor) return false
    if (span.kind !== kind) return false
    cursor = Math.min(match.end, span.end)
    if (cursor >= match.end) return true
  }
  return false
}

function isDistinctiveSingleName(value: string): boolean {
  return !NAME_STOPLIST.has(value.toLowerCase())
}

export function findEmailAddressSpans(text: string): Span[] {
  const matches = linkify.match(text) ?? []
  const spans = matches
    .filter((match) => match.schema === "mailto:" || match.text.includes("@"))
    .map((match) => ({
      start: match.index,
      end: match.lastIndex,
    }))
  for (const match of text.matchAll(EMAIL_SHAPE_REGEX)) {
    if (match.index === undefined) continue
    spans.push({
      start: match.index,
      end: match.index + match[0].length,
    })
  }
  return spans
    .toSorted((left, right) => left.start - right.start || left.end - right.end)
    .filter(
      (span, index, sorted) =>
        index === 0 ||
        span.start !== sorted[index - 1].start ||
        span.end !== sorted[index - 1].end,
    )
}

function findLiteralMatches(params: {
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
    if (hasBoundary(params.text, start, end)) {
      spans.push({ start, end })
    }
  }
  return spans
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
    const distinctive = isMultiToken || isDistinctiveSingleName(normalized)
    const matches = findLiteralMatches({
      text: params.text,
      value: normalized,
      caseSensitive: false,
    })
    for (const match of matches) {
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

function collectLiteralCandidates(params: {
  text: string
  values: readonly string[]
  replacementClass: "email" | "opaqueIdentifier" | "gitUsername"
  caseSensitive: boolean
}): ReplacementCandidate[] {
  const candidates: ReplacementCandidate[] = []
  for (const value of params.values) {
    const normalized = normalizeKnownText(value)
    if (normalized.length === 0) continue
    const matches = findLiteralMatches({
      text: params.text,
      value: normalized,
      caseSensitive: params.caseSensitive,
    })
    for (const match of matches) {
      candidates.push({
        ...match,
        replacementClass: params.replacementClass,
        value: params.text.slice(match.start, match.end),
        comparisonKey: params.caseSensitive
          ? normalized
          : normalized.toLowerCase(),
        caseSensitive: params.caseSensitive,
        assertGlobally: true,
      })
    }
  }
  return candidates
}

function collectEmailCandidates(
  text: string,
  knownEmails: readonly string[],
): ReplacementCandidate[] {
  const shaped = findEmailAddressSpans(text).map((span) => {
    const value = text.slice(span.start, span.end)
    return {
      ...span,
      replacementClass: "email",
      value,
      comparisonKey: value.toLowerCase(),
      caseSensitive: false,
      assertGlobally: true,
    }
  })
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

function collectRegexSecretCandidates(
  text: string,
  regex: RegExp,
): ReplacementCandidate[] {
  const candidates: ReplacementCandidate[] = []
  for (const match of text.matchAll(regex)) {
    if (match.index === undefined) continue
    candidates.push({
      start: match.index,
      end: match.index + match[0].length,
      replacementClass: "secret",
      value: match[0],
      comparisonKey: match[0],
      caseSensitive: true,
      assertGlobally: true,
    })
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
    const before = codePointBefore(text, start)
    const after = codePointAfter(text, end)
    if (
      (before !== null && base64UrlCharacter.test(before)) ||
      (after !== null && base64UrlCharacter.test(after))
    ) {
      continue
    }
    candidates.push({
      start,
      end,
      replacementClass: "secret",
      value: match[0],
      comparisonKey: match[0],
      caseSensitive: true,
      assertGlobally: true,
    })
  }
  return candidates
}

function collectPemCandidates(text: string): ReplacementCandidate[] {
  const candidates: ReplacementCandidate[] = []
  const begin = /^-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----$/gm
  for (const match of text.matchAll(begin)) {
    if (match.index === undefined) continue
    const start = match.index
    const label = match[0].slice("-----BEGIN ".length, -"-----".length)
    const endMarker = `-----END ${label}-----`
    const markerIndex = text.indexOf(endMarker, start + match[0].length)
    const end =
      markerIndex < 0 ? start + match[0].length : markerIndex + endMarker.length
    const value = text.slice(start, end)
    candidates.push({
      start,
      end,
      replacementClass: "secret",
      value,
      comparisonKey: value,
      caseSensitive: true,
      assertGlobally: true,
    })
  }
  return candidates
}

function collectSecretCandidates(text: string): ReplacementCandidate[] {
  return [
    ...collectRegexSecretCandidates(text, /\bsk-[A-Za-z0-9_-]{20,}\b/g),
    ...collectRegexSecretCandidates(
      text,
      /\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g,
    ),
    ...collectRegexSecretCandidates(text, /\bghp_[A-Za-z0-9]{36}\b/g),
    ...collectRegexSecretCandidates(
      text,
      /\bxoxb-[0-9]{10,13}-[0-9]{10,13}-[A-Za-z0-9]{20,}\b/g,
    ),
    ...collectRegexSecretCandidates(text, /\bAKIA[A-Z0-9]{16}\b/g),
    ...collectJwtCandidates(text),
    ...collectPemCandidates(text),
  ]
}

function collectRequiredCandidates(params: {
  text: string
  localIdentityContext: ExaminationLocalIdentityContext
  spans: readonly ClassifiedSourceSpan[]
  mode: "source" | "prose"
  includeSecrets: boolean
}): ReplacementCandidate[] {
  return [
    ...collectEmailCandidates(params.text, params.localIdentityContext.emails),
    ...(params.includeSecrets ? collectSecretCandidates(params.text) : []),
    ...collectNameCandidates({
      text: params.text,
      names: params.localIdentityContext.names,
      spans: params.spans,
      mode: params.mode,
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

function selectNonOverlappingCandidates(
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

function placeholderStem(replacementClass: ReplacementClass): string {
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

function placeholderKey(candidate: ReplacementCandidate): string {
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

export function buildRedactionPlaceholderPlan(params: {
  sources: readonly {
    lines: readonly string[]
    spans: readonly ClassifiedSourceSpan[]
  }[]
  localIdentityContext: ExaminationLocalIdentityContext
}): RedactionPlaceholderPlan {
  const unique = new Map<
    string,
    {
      replacementClass: ReplacementClass
      comparisonKey: string
    }
  >()

  for (const source of params.sources) {
    const text = source.lines.join("\n")
    const candidates = selectNonOverlappingCandidates(
      collectRequiredCandidates({
        text,
        localIdentityContext: params.localIdentityContext,
        spans: source.spans,
        mode: "source",
        includeSecrets: true,
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
    if (rank !== 0) return rank
    return left.comparisonKey.localeCompare(right.comparisonKey)
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
  placeholderPlan?: RedactionPlaceholderPlan
}): {
  text: string
  replacementClasses: ReplacementClass[]
  requiredChecks: RedactionRequiredCheck[]
} {
  const placeholderByKey = new Map<string, string>()
  const countByClass = new Map<ReplacementClass, number>()
  const replacementClasses = new Set<ReplacementClass>()
  const requiredChecks: RedactionRequiredCheck[] = []
  let out = ""
  let cursor = 0

  for (const candidate of params.candidates) {
    out += params.text.slice(cursor, candidate.start)
    const classKey = placeholderKey(candidate)
    let placeholder =
      params.placeholderPlan?.placeholderByKey.get(classKey) ??
      placeholderByKey.get(classKey)
    if (placeholder === undefined) {
      const next = (countByClass.get(candidate.replacementClass) ?? 0) + 1
      countByClass.set(candidate.replacementClass, next)
      placeholder = `<${placeholderStem(candidate.replacementClass)}-${next}>`
      placeholderByKey.set(classKey, placeholder)
    }
    const original = params.text.slice(candidate.start, candidate.end)
    out += buildReplacementText(original, placeholder)
    replacementClasses.add(candidate.replacementClass)
    requiredChecks.push({
      kind: candidate.replacementClass,
      value: candidate.value,
      caseSensitive: candidate.caseSensitive,
      assertGlobally: candidate.assertGlobally,
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
  return collectRequiredCandidates({
    text,
    localIdentityContext: context,
    spans: [{ start: 0, end: text.length, kind: "code" }],
    mode: "prose",
    includeSecrets: false,
  }).filter((candidate) => candidate.replacementClass !== "email").length
}

export function redactExaminationSource(params: {
  lines: readonly string[]
  spans: readonly ClassifiedSourceSpan[]
  localIdentityContext: ExaminationLocalIdentityContext
  redactionPolicyVersion: number
  placeholderPlan?: RedactionPlaceholderPlan
}): RedactionResult {
  const text = params.lines.join("\n")
  const candidates = selectNonOverlappingCandidates(
    collectRequiredCandidates({
      text,
      localIdentityContext: params.localIdentityContext,
      spans: params.spans,
      mode: "source",
      includeSecrets: true,
    }),
  )
  const applied = applyReplacements({
    text,
    candidates,
    placeholderPlan: params.placeholderPlan,
  })
  const residualEmails = collectEmailCandidates(
    applied.text,
    params.localIdentityContext.emails,
  )
  const residualSecrets = collectSecretCandidates(applied.text)
  return {
    lines: applied.text.split("\n"),
    report: {
      redactionPolicyVersion: params.redactionPolicyVersion,
      replacementClasses: applied.replacementClasses.toSorted(),
      residualScan: {
        emails: residualEmails.length,
        knownIdentifiers: countKnownIdentifierLeaks(
          applied.text,
          params.localIdentityContext,
        ),
        secrets: residualSecrets.length,
      },
      requiredChecks: applied.requiredChecks,
    },
  }
}

function containsRequiredCheck(text: string, check: RedactionRequiredCheck) {
  if (check.kind === "email") {
    return (
      findLiteralMatches({
        text,
        value: check.value,
        caseSensitive: check.caseSensitive,
      }).length > 0
    )
  }
  if (check.kind === "secret") {
    return text.includes(check.value)
  }
  return (
    findLiteralMatches({
      text,
      value: check.value,
      caseSensitive: check.caseSensitive,
    }).length > 0
  )
}

export function assertNoRequiredRedactionLeaks(params: {
  renderedPrompt: string
  requiredChecks: readonly RedactionRequiredCheck[]
}): void {
  if (findEmailAddressSpans(params.renderedPrompt).length > 0) {
    throw new Error(
      "Examination prompt redaction failed: an email address remained in the provider prompt.",
    )
  }
  if (collectSecretCandidates(params.renderedPrompt).length > 0) {
    throw new Error(
      "Examination prompt redaction failed: a secret literal remained in the provider prompt.",
    )
  }
  const leaked = params.requiredChecks.find((check) =>
    check.assertGlobally
      ? containsRequiredCheck(params.renderedPrompt, check)
      : false,
  )
  if (leaked) {
    throw new Error(
      `Examination prompt redaction failed: a ${leaked.kind} remained in the provider prompt.`,
    )
  }
}

export type OutputLeakScanResult = {
  ok: boolean
  reason: "email" | "known-identifier" | null
}

export function scanExaminationOutputForLeaks(params: {
  questions: readonly ExaminationQuestion[]
  localIdentityContext: ExaminationLocalIdentityContext
}): OutputLeakScanResult {
  const text = params.questions
    .map((question) => `${question.question}\n${question.answer}`)
    .join("\n")
  if (findEmailAddressSpans(text).length > 0) {
    return { ok: false, reason: "email" }
  }
  const knownIdentifierLeaks = collectRequiredCandidates({
    text,
    localIdentityContext: params.localIdentityContext,
    spans: [{ start: 0, end: text.length, kind: "code" }],
    mode: "prose",
    includeSecrets: false,
  })
  if (
    knownIdentifierLeaks.some(
      (candidate) => candidate.replacementClass === "email",
    )
  ) {
    return { ok: false, reason: "email" }
  }
  if (
    knownIdentifierLeaks.some(
      (candidate) => candidate.replacementClass !== "email",
    )
  ) {
    return { ok: false, reason: "known-identifier" }
  }
  return { ok: true, reason: null }
}

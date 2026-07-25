import { sha256 } from "@noble/hashes/sha2.js"
import { bytesToHex } from "@noble/hashes/utils.js"
import type { ExaminationCodeExcerpt } from "./dto.js"

const EXAMINATION_PROVIDER_PAYLOAD_VERSION =
  "examination-provider-payload-v1" as const

const EXAMINATION_SOURCE_ID_PATTERN =
  /^(?:E[1-9]\d*|SRC[1-9]\d*(?:_[1-9]\d*)?)$/

export type ExaminationTokenizerTreatment = "stripped" | "fallback"

export type ExaminationProviderExcerptIdentity = {
  sourceDescriptor: string
  tokenizerTreatment: ExaminationTokenizerTreatment
  startLine: number
  lineCount: number
  redactedContentFingerprint: string
}

function sha256Hex(value: string): string {
  return bytesToHex(sha256(new TextEncoder().encode(value)))
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

export function canonicalizeExaminationExcerpts(
  excerpts: readonly ExaminationCodeExcerpt[],
): ExaminationCodeExcerpt[] {
  return [...excerpts]
    .map((excerpt) => ({
      filePath: excerpt.filePath,
      startLine: excerpt.startLine,
      lines: [...excerpt.lines],
    }))
    .sort((a, b) => {
      if (a.filePath !== b.filePath) {
        return a.filePath < b.filePath ? -1 : 1
      }
      return a.startLine - b.startLine
    })
}

export function buildExaminationRedactedContentFingerprint(
  lines: readonly string[],
): string {
  return sha256Hex(lines.join("\n"))
}

function providerExcerptIdentityKey(
  identity: ExaminationProviderExcerptIdentity,
): string {
  return [
    identity.sourceDescriptor,
    identity.tokenizerTreatment,
    identity.redactedContentFingerprint,
    String(identity.startLine),
    String(identity.lineCount),
  ].join("\u001f")
}

export function buildExaminationProviderPayloadFingerprint(
  identities: readonly ExaminationProviderExcerptIdentity[],
  options: {
    redactionPolicyVersion: number
    sourceIds?: readonly string[]
  },
): string {
  if (
    options.sourceIds !== undefined &&
    options.sourceIds.length !== identities.length
  ) {
    throw new Error("Source id count must match examination excerpt count.")
  }
  const canonicalEntries = identities
    .map(
      (identity, index) =>
        [
          providerExcerptIdentityKey(identity),
          options.sourceIds?.[index] ?? null,
        ] as const,
    )
    .toSorted(([leftKey, leftSourceId], [rightKey, rightSourceId]) => {
      return (
        compareStrings(leftKey, rightKey) ||
        compareStrings(leftSourceId ?? "", rightSourceId ?? "")
      )
    })
    .filter((entry, index, sorted) => {
      if (index === 0) return true
      const previous = sorted[index - 1]
      return entry[0] !== previous[0] || entry[1] !== previous[1]
    })
  return sha256Hex(
    JSON.stringify([
      EXAMINATION_PROVIDER_PAYLOAD_VERSION,
      options.redactionPolicyVersion,
      canonicalEntries,
    ]),
  )
}

function normalizeSourceIdForbiddenValue(value: string): string {
  return value.trim().split(/\s+/).join(" ").toLowerCase()
}

function buildSourceIdCandidate(index: number, attempt: number): string {
  const sourceNumber = index + 1
  if (attempt === 0) return `E${sourceNumber}`
  if (attempt === 1) return `SRC${sourceNumber}`
  return `SRC${sourceNumber}_${attempt - 1}`
}

function chooseSourceId(params: {
  index: number
  forbidden: ReadonlySet<string>
  used: ReadonlySet<string>
}): string {
  for (let attempt = 0; ; attempt += 1) {
    const candidate = buildSourceIdCandidate(params.index, attempt)
    const comparison = candidate.toLowerCase()
    if (!params.forbidden.has(comparison) && !params.used.has(comparison)) {
      return candidate
    }
  }
}

export function assignExaminationSourceIds(
  identities: readonly ExaminationProviderExcerptIdentity[],
  options: { forbiddenSourceIds?: readonly string[] } = {},
): string[] {
  const forbidden = new Set(
    (options.forbiddenSourceIds ?? [])
      .map(normalizeSourceIdForbiddenValue)
      .filter((value) => value.length > 0),
  )
  const uniqueKeys = [...new Set(identities.map(providerExcerptIdentityKey))]
    .toSorted()
    .map((key, index) => ({ key, index }))
  const usedSourceIds = new Set<string>()
  const sourceIdByKey = new Map(
    uniqueKeys.map(({ key, index }) => {
      const sourceId = chooseSourceId({
        index,
        forbidden,
        used: usedSourceIds,
      })
      usedSourceIds.add(sourceId.toLowerCase())
      return [key, sourceId] as const
    }),
  )
  return identities.map((identity) => {
    const sourceId = sourceIdByKey.get(providerExcerptIdentityKey(identity))
    if (sourceId === undefined) {
      throw new Error("Missing examination source id assignment.")
    }
    return sourceId
  })
}

export function isExaminationSourceId(value: string): boolean {
  return EXAMINATION_SOURCE_ID_PATTERN.test(value)
}

function sourceIdSortParts(sourceId: string): {
  index: number
  attempt: number
} {
  const eMatch = /^E(\d+)$/.exec(sourceId)
  if (eMatch) {
    return { index: Number.parseInt(eMatch[1] ?? "0", 10), attempt: 0 }
  }
  const srcMatch = /^SRC(\d+)(?:_(\d+))?$/.exec(sourceId)
  if (srcMatch) {
    return {
      index: Number.parseInt(srcMatch[1] ?? "0", 10),
      attempt: Number.parseInt(srcMatch[2] ?? "0", 10) + 1,
    }
  }
  return { index: Number.MAX_SAFE_INTEGER, attempt: Number.MAX_SAFE_INTEGER }
}

export function compareExaminationSourceIds(
  left: string,
  right: string,
): number {
  const leftParts = sourceIdSortParts(left)
  const rightParts = sourceIdSortParts(right)
  return (
    leftParts.index - rightParts.index ||
    leftParts.attempt - rightParts.attempt ||
    left.localeCompare(right)
  )
}

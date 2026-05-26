import {
  buildExaminationGenerationContextFingerprint,
  EXAMINATION_ARCHIVE_BUNDLE_FORMAT,
  EXAMINATION_ARCHIVE_BUNDLE_VERSION,
  type ExaminationArchiveBundle,
  type ExaminationArchivedProvenance,
  type ExaminationArchiveImportSummary,
  type ExaminationArchiveKey,
  type ExaminationArchiveRecord,
  type ExaminationLineRange,
  type ExaminationQuestion,
  type ExaminationSourceAnchor,
  serializeExaminationArchiveStorageKey,
  validateExaminationArchiveKey,
} from "@repo-edu/application-contract"
import type {
  ExaminationArchiveStoragePort,
  ExaminationArchiveStoredEntry,
} from "@repo-edu/host-runtime-contract"
import type {
  LlmAuthMode,
  LlmEffort,
} from "@repo-edu/integrations-llm-contract"
import { findEmailAddressSpans } from "./redaction.js"

export type ExaminationArchivePort = {
  get(key: ExaminationArchiveKey): ExaminationArchiveRecord | undefined
  listForGenerationContext(
    key: ExaminationArchiveKey,
  ): ExaminationArchiveRecord[]
  listForExcerpts(scope: {
    personId: string
    contentScopeId: string
    providerPayloadFingerprint: string
  }): ExaminationArchiveRecord[]
  put(record: ExaminationArchiveRecord): void
  remove(key: ExaminationArchiveKey): void
  exportBundle(): ExaminationArchiveBundle
  importBundle(bundle: unknown): ExaminationArchiveImportSummary
}

/**
 * In-memory storage backing for CLI/docs/test environments that don't
 * require archive persistence. Mirrors the persistent port surface but
 * holds entries in a Map. Trusts its caller to pass validated entries —
 * the application archive adapter owns validation.
 */
export function createInMemoryExaminationArchiveStorage(): ExaminationArchiveStoragePort {
  const entries = new Map<string, ExaminationArchiveStoredEntry>()
  return {
    get(storageKey) {
      return entries.get(storageKey)
    },
    put(entry) {
      entries.set(entry.storageKey, entry)
    },
    remove(storageKey) {
      entries.delete(storageKey)
    },
    exportAll() {
      return [...entries.values()]
    },
    importAll(incoming) {
      let inserted = 0
      let updated = 0
      let skipped = 0
      for (const entry of incoming) {
        const existing = entries.get(entry.storageKey)
        if (existing === undefined) {
          entries.set(entry.storageKey, entry)
          inserted += 1
        } else if (entry.createdAtMs > existing.createdAtMs) {
          entries.set(entry.storageKey, entry)
          updated += 1
        } else {
          skipped += 1
        }
      }
      return {
        totalInBundle: incoming.length,
        inserted,
        updated,
        skipped,
        rejected: 0,
        rejections: [],
      }
    },
  }
}

export function createInMemoryExaminationArchive(): ExaminationArchivePort {
  return createExaminationArchive(createInMemoryExaminationArchiveStorage())
}

export function createExaminationArchive(
  storage: ExaminationArchiveStoragePort,
): ExaminationArchivePort {
  return {
    get(key) {
      const entry = storage.get(serializeExaminationArchiveStorageKey(key))
      if (!entry) return undefined
      return tryParseRecord(entry) ?? undefined
    },
    listForGenerationContext(key) {
      const records: ExaminationArchiveRecord[] = []
      for (const entry of storage.exportAll()) {
        const record = tryParseRecord(entry)
        if (!record || !sameGenerationContext(record.key, key)) continue
        records.push(record)
      }
      return records.sort(compareRecordsNewestFirst)
    },
    listForExcerpts(scope) {
      const records: ExaminationArchiveRecord[] = []
      for (const entry of storage.exportAll()) {
        const record = tryParseRecord(entry)
        if (
          !record ||
          record.key.personId !== scope.personId ||
          record.key.contentScopeId !== scope.contentScopeId ||
          record.key.providerPayloadFingerprint !==
            scope.providerPayloadFingerprint
        ) {
          continue
        }
        records.push(record)
      }
      return records.sort(compareRecordsNewestFirst)
    },
    put(record) {
      storage.put(toStoredEntry(record))
    },
    remove(key) {
      storage.remove(serializeExaminationArchiveStorageKey(key))
    },
    exportBundle() {
      const entries = storage.exportAll()
      const records: ExaminationArchiveRecord[] = []
      for (const entry of entries) {
        const record = tryParseRecord(entry)
        if (record) records.push(record)
      }
      return {
        format: EXAMINATION_ARCHIVE_BUNDLE_FORMAT,
        bundleVersion: EXAMINATION_ARCHIVE_BUNDLE_VERSION,
        exportedAt: new Date().toISOString(),
        records,
      }
    },
    importBundle(raw) {
      const parsedRecords = parseBundleRecords(raw)
      if (parsedRecords === null) {
        return {
          totalInBundle: 0,
          inserted: 0,
          updated: 0,
          skipped: 0,
          rejected: 1,
          rejections: [
            "Bundle header missing or invalid (expected format, bundleVersion, and records array).",
          ],
        }
      }
      const { records, rejections: parseRejections, total } = parsedRecords
      const summary = storage.importAll(records.map(toStoredEntry))
      return {
        totalInBundle: total,
        inserted: summary.inserted,
        updated: summary.updated,
        skipped: summary.skipped,
        rejected: parseRejections.length,
        rejections: parseRejections,
      }
    },
  }
}

function sameGenerationContext(
  a: ExaminationArchiveKey,
  b: ExaminationArchiveKey,
): boolean {
  return (
    a.personId === b.personId &&
    a.contentScopeId === b.contentScopeId &&
    a.providerPayloadFingerprint === b.providerPayloadFingerprint &&
    a.generationContextFingerprint === b.generationContextFingerprint
  )
}

function compareRecordsNewestFirst(
  a: ExaminationArchiveRecord,
  b: ExaminationArchiveRecord,
): number {
  if (a.provenance.createdAtMs !== b.provenance.createdAtMs) {
    return b.provenance.createdAtMs - a.provenance.createdAtMs
  }
  return a.key.questionCount - b.key.questionCount
}

function toStoredEntry(
  record: ExaminationArchiveRecord,
): ExaminationArchiveStoredEntry {
  return {
    storageKey: serializeExaminationArchiveStorageKey(record.key),
    createdAtMs: record.provenance.createdAtMs,
    payloadJson: JSON.stringify(record),
  }
}

function tryParseRecord(
  entry: ExaminationArchiveStoredEntry,
): ExaminationArchiveRecord | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(entry.payloadJson)
  } catch {
    return null
  }
  return validateRecord(parsed, entry.storageKey)
}

function validateRecord(
  raw: unknown,
  storageKey: string,
): ExaminationArchiveRecord | null {
  if (!isRecord(raw)) return null
  const keyResult = parseKey(raw.key)
  if (!keyResult.ok) return null
  if (serializeExaminationArchiveStorageKey(keyResult.key) !== storageKey) {
    return null
  }
  const questions = validateQuestions(raw.questions)
  if (questions === null) return null
  if (questionsContainEmail(questions)) return null
  const provenance = validateProvenance(raw.provenance)
  if (provenance === null) return null
  if (!generationContextMatchesProvenance(keyResult.key, provenance)) {
    return null
  }
  if (
    questions.length === 0 ||
    questions.length !== provenance.questionCount ||
    keyResult.key.questionCount !== provenance.questionCount
  ) {
    return null
  }
  return { key: keyResult.key, questions, provenance }
}

function generationContextMatchesProvenance(
  key: ExaminationArchiveKey,
  provenance: ExaminationArchivedProvenance,
): boolean {
  return (
    key.generationContextFingerprint ===
    buildExaminationGenerationContextFingerprint({
      model: provenance.model,
      effort: provenance.effort,
      promptTemplateVersion: provenance.promptTemplateVersion,
      redactionPolicyVersion: provenance.redactionPolicyVersion,
    })
  )
}

type KeyValidationResult =
  | { ok: true; key: ExaminationArchiveKey }
  | { ok: false; reason: string }

function parseKey(raw: unknown): KeyValidationResult {
  if (!isRecord(raw)) {
    return { ok: false, reason: "missing or malformed key" }
  }
  if ("groupSetId" in raw) {
    return {
      ok: false,
      reason: "old group-set scoped archive keys are unsupported",
    }
  }
  const key = validateExaminationArchiveKey(raw)
  if (key === null) {
    return { ok: false, reason: "missing or malformed key" }
  }
  return { ok: true, key }
}

// A single malformed question rejects the whole record. Partial imports are
// deliberately disallowed: an exam record with some questions dropped would
// silently degrade what the user sees on re-open, without a way to notice.
function validateQuestions(raw: unknown): ExaminationQuestion[] | null {
  if (!Array.isArray(raw)) return null
  const out: ExaminationQuestion[] = []
  for (const item of raw) {
    if (!isRecord(item)) return null
    const allowedFields = new Set(["question", "answer", "anchor"])
    if (Object.keys(item).some((field) => !allowedFields.has(field))) {
      return null
    }
    const question = item.question
    const answer = item.answer
    if (typeof question !== "string" || typeof answer !== "string") return null
    const anchor = validateAnchor(item.anchor)
    if (anchor === null) return null
    out.push({ question, answer, anchor })
  }
  return out
}

function validateLineRange(raw: unknown): ExaminationLineRange | null {
  if (raw === null || raw === undefined) return null
  if (!isRecord(raw)) return null
  const { start, end } = raw
  if (typeof start !== "number" || typeof end !== "number") return null
  if (!Number.isInteger(start) || !Number.isInteger(end)) return null
  if (start < 1 || end < start) return null
  return { start, end }
}

function validateAnchor(raw: unknown): ExaminationSourceAnchor | null {
  if (!isRecord(raw)) return null
  const sourceId =
    typeof raw.sourceId === "string" &&
    /^(?:E[1-9]\d*|SRC[1-9]\d*(?:_[1-9]\d*)?)$/.test(raw.sourceId)
      ? raw.sourceId
      : raw.sourceId === null
        ? null
        : undefined
  if (sourceId === undefined) return null
  const lineRange = validateLineRange(raw.lineRange)
  if (
    raw.lineRange !== null &&
    raw.lineRange !== undefined &&
    lineRange === null
  ) {
    return null
  }
  return { sourceId, lineRange }
}

function validateProvenance(
  raw: unknown,
): ExaminationArchivedProvenance | null {
  if (!isRecord(raw)) return null
  const allowedFields = new Set([
    "model",
    "effort",
    "questionCount",
    "usage",
    "createdAtMs",
    "redactionPolicyVersion",
    "promptTemplateVersion",
  ])
  if (Object.keys(raw).some((field) => !allowedFields.has(field))) {
    return null
  }
  const {
    model,
    effort,
    questionCount,
    usage,
    createdAtMs,
    redactionPolicyVersion,
    promptTemplateVersion,
  } = raw
  if (
    typeof questionCount !== "number" ||
    typeof createdAtMs !== "number" ||
    typeof redactionPolicyVersion !== "number" ||
    typeof promptTemplateVersion !== "number"
  ) {
    return null
  }
  if (
    !Number.isInteger(questionCount) ||
    questionCount < 1 ||
    questionCount > 20
  ) {
    return null
  }
  if (typeof model !== "string" || model.length === 0) return null
  const validatedEffort = validateEffort(effort)
  if (validatedEffort === null) return null
  const validatedUsage = validateUsage(usage)
  if (!validatedUsage.ok) return null
  return {
    model,
    effort: validatedEffort,
    questionCount,
    usage: validatedUsage.usage,
    createdAtMs,
    redactionPolicyVersion,
    promptTemplateVersion,
  }
}

const LLM_EFFORTS: readonly LlmEffort[] = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]
const LLM_AUTH_MODES: readonly LlmAuthMode[] = ["subscription", "api"]

function validateEffort(raw: unknown): LlmEffort | null {
  if (typeof raw !== "string") return null
  return LLM_EFFORTS.includes(raw as LlmEffort) ? (raw as LlmEffort) : null
}

function validateAuthMode(raw: unknown): LlmAuthMode | null {
  if (typeof raw !== "string") return null
  return LLM_AUTH_MODES.includes(raw as LlmAuthMode)
    ? (raw as LlmAuthMode)
    : null
}

function validateUsage(
  raw: unknown,
): { ok: true; usage: ExaminationArchivedProvenance["usage"] } | { ok: false } {
  if (raw === null) return { ok: true, usage: null }
  if (!isRecord(raw)) return { ok: false }
  const {
    inputTokens,
    cachedInputTokens,
    outputTokens,
    reasoningOutputTokens,
    wallMs,
    authMode,
  } = raw
  if (
    typeof inputTokens !== "number" ||
    typeof cachedInputTokens !== "number" ||
    typeof outputTokens !== "number" ||
    typeof reasoningOutputTokens !== "number" ||
    typeof wallMs !== "number"
  ) {
    return { ok: false }
  }
  const validatedAuthMode = validateAuthMode(authMode)
  if (validatedAuthMode === null) return { ok: false }
  return {
    ok: true,
    usage: {
      inputTokens,
      cachedInputTokens,
      outputTokens,
      reasoningOutputTokens,
      wallMs,
      authMode: validatedAuthMode,
    },
  }
}

function parseBundleRecords(raw: unknown): {
  records: ExaminationArchiveRecord[]
  rejections: string[]
  total: number
} | null {
  if (!isRecord(raw)) return null
  if (
    raw.format !== EXAMINATION_ARCHIVE_BUNDLE_FORMAT ||
    raw.bundleVersion !== EXAMINATION_ARCHIVE_BUNDLE_VERSION
  ) {
    return null
  }
  if (!Array.isArray(raw.records)) return null
  const records: ExaminationArchiveRecord[] = []
  const rejections: string[] = []
  for (const [index, item] of raw.records.entries()) {
    const rawKey = isRecord(item) ? item.key : undefined
    const keyResult = parseKey(rawKey)
    if (!keyResult.ok) {
      rejections.push(`record ${index}: ${keyResult.reason}`)
      continue
    }
    const storageKey = serializeExaminationArchiveStorageKey(keyResult.key)
    const record = validateRecord(item, storageKey)
    if (!record) {
      rejections.push(
        `${describeKey(keyResult.key)}: record failed validation (questions or provenance)`,
      )
      continue
    }
    records.push(record)
  }
  return { records, rejections, total: raw.records.length }
}

function describeKey(key: ExaminationArchiveKey): string {
  return `person=${key.personId} scope=${key.contentScopeId.slice(0, 8)} q=${key.questionCount}`
}

function questionsContainEmail(questions: readonly ExaminationQuestion[]) {
  return questions.some(
    (question) =>
      findEmailAddressSpans(`${question.question}\n${question.answer}`).length >
      0,
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

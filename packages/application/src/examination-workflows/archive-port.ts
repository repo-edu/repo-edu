import {
  EXAMINATION_ARCHIVE_BUNDLE_FORMAT,
  EXAMINATION_ARCHIVE_BUNDLE_VERSION,
  type ExaminationArchiveBundle,
  type ExaminationArchivedProvenance,
  type ExaminationArchiveImportSummary,
  type ExaminationArchiveKey,
  type ExaminationArchiveRecord,
  type ExaminationCodeExcerpt,
  type ExaminationLineRange,
  type ExaminationQuestion,
} from "@repo-edu/application-contract"
import type {
  ExaminationArchiveStoragePort,
  ExaminationArchiveStoredEntry,
} from "@repo-edu/host-runtime-contract"
import type {
  LlmAuthMode,
  LlmEffort,
} from "@repo-edu/integrations-llm-contract"

export type ExaminationArchivePort = {
  get(key: ExaminationArchiveKey): ExaminationArchiveRecord | undefined
  put(record: ExaminationArchiveRecord): void
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
  const mapKey = (key: ExaminationArchiveKey): string =>
    `${key.groupSetId}\u0000${key.memberId}\u0000${key.commitOid}\u0000${key.questionCount}\u0000${key.excerptsFingerprint}`
  return {
    get(key) {
      return entries.get(mapKey(key))
    },
    put(entry) {
      entries.set(mapKey(entry.key), entry)
    },
    exportAll() {
      return [...entries.values()]
    },
    importAll(incoming) {
      let inserted = 0
      let updated = 0
      let skipped = 0
      for (const entry of incoming) {
        const id = mapKey(entry.key)
        const existing = entries.get(id)
        if (existing === undefined) {
          entries.set(id, entry)
          inserted += 1
        } else if (entry.createdAtMs > existing.createdAtMs) {
          entries.set(id, entry)
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
      const entry = storage.get(key)
      if (!entry) return undefined
      return tryParseRecord(entry) ?? undefined
    },
    put(record) {
      storage.put({
        key: record.key,
        createdAtMs: record.provenance.createdAtMs,
        payloadJson: JSON.stringify(record),
      })
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
      const entries: ExaminationArchiveStoredEntry[] = records.map(
        (record) => ({
          key: record.key,
          createdAtMs: record.provenance.createdAtMs,
          payloadJson: JSON.stringify(record),
        }),
      )
      const summary = storage.importAll(entries)
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

function tryParseRecord(
  entry: ExaminationArchiveStoredEntry,
): ExaminationArchiveRecord | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(entry.payloadJson)
  } catch {
    return null
  }
  return validateRecord(parsed, entry.key)
}

function validateRecord(
  raw: unknown,
  fallbackKey: ExaminationArchiveKey,
): ExaminationArchiveRecord | null {
  if (!isRecord(raw)) return null
  // An embedded key that disagrees with the storage-supplied key means the
  // stored row and the payload describe different records — reject rather
  // than return a record keyed differently than the lookup expected.
  const embeddedKey = validateKey(raw.key)
  if (embeddedKey !== null && !examinationKeysEqual(embeddedKey, fallbackKey)) {
    return null
  }
  const key = embeddedKey ?? fallbackKey
  const questions = validateQuestions(raw.questions)
  if (questions === null) return null
  const provenance = validateProvenance(raw.provenance)
  if (provenance === null) return null
  return { key, questions, provenance }
}

function examinationKeysEqual(
  a: ExaminationArchiveKey,
  b: ExaminationArchiveKey,
): boolean {
  return (
    a.groupSetId === b.groupSetId &&
    a.memberId === b.memberId &&
    a.commitOid === b.commitOid &&
    a.questionCount === b.questionCount &&
    a.excerptsFingerprint === b.excerptsFingerprint
  )
}

function validateKey(raw: unknown): ExaminationArchiveKey | null {
  if (!isRecord(raw)) return null
  const {
    groupSetId,
    memberId,
    commitOid,
    questionCount,
    excerptsFingerprint,
  } = raw
  if (
    typeof groupSetId !== "string" ||
    typeof memberId !== "string" ||
    typeof commitOid !== "string" ||
    typeof questionCount !== "number" ||
    typeof excerptsFingerprint !== "string"
  ) {
    return null
  }
  return { groupSetId, memberId, commitOid, questionCount, excerptsFingerprint }
}

// A single malformed question rejects the whole record. Partial imports are
// deliberately disallowed: an exam record with some questions dropped would
// silently degrade what the user sees on re-open, without a way to notice.
function validateQuestions(raw: unknown): ExaminationQuestion[] | null {
  if (!Array.isArray(raw)) return null
  const out: ExaminationQuestion[] = []
  for (const item of raw) {
    if (!isRecord(item)) return null
    const question = item.question
    const answer = item.answer
    if (typeof question !== "string" || typeof answer !== "string") return null
    const filePath =
      typeof item.filePath === "string" || item.filePath === null
        ? (item.filePath as string | null)
        : null
    const lineRange = validateLineRange(item.lineRange)
    out.push({ question, answer, filePath, lineRange })
  }
  return out
}

function validateLineRange(raw: unknown): ExaminationLineRange | null {
  if (raw === null || raw === undefined) return null
  if (!isRecord(raw)) return null
  const { start, end } = raw
  if (typeof start !== "number" || typeof end !== "number") return null
  return { start, end }
}

function validateProvenance(
  raw: unknown,
): ExaminationArchivedProvenance | null {
  if (!isRecord(raw)) return null
  const {
    memberName,
    memberEmail,
    repoGitDir,
    assignmentContext,
    model,
    effort,
    questionCount,
    usage,
    createdAtMs,
    excerpts,
  } = raw
  if (
    typeof memberName !== "string" ||
    typeof memberEmail !== "string" ||
    typeof repoGitDir !== "string" ||
    typeof questionCount !== "number" ||
    typeof createdAtMs !== "number"
  ) {
    return null
  }
  if (
    assignmentContext !== null &&
    assignmentContext !== undefined &&
    typeof assignmentContext !== "string"
  ) {
    return null
  }
  if (typeof model !== "string" || model.length === 0) return null
  const validatedEffort = validateEffort(effort)
  if (validatedEffort === null) return null
  const validatedExcerpts = validateExcerpts(excerpts)
  if (validatedExcerpts === null) return null
  const validatedUsage = validateUsage(usage)
  if (validatedUsage === null) return null
  return {
    memberName,
    memberEmail,
    repoGitDir,
    assignmentContext:
      typeof assignmentContext === "string" ? assignmentContext : null,
    model,
    effort: validatedEffort,
    questionCount,
    usage: validatedUsage,
    createdAtMs,
    excerpts: validatedExcerpts,
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

function validateExcerpts(raw: unknown): ExaminationCodeExcerpt[] | null {
  if (!Array.isArray(raw)) return null
  const out: ExaminationCodeExcerpt[] = []
  for (const item of raw) {
    if (!isRecord(item)) return null
    const { filePath, startLine, lines } = item
    if (typeof filePath !== "string" || typeof startLine !== "number") {
      return null
    }
    if (!Array.isArray(lines) || !lines.every((l) => typeof l === "string")) {
      return null
    }
    out.push({ filePath, startLine, lines: [...lines] })
  }
  return out
}

function validateUsage(
  raw: unknown,
): ExaminationArchivedProvenance["usage"] | null {
  if (!isRecord(raw)) return null
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
    return null
  }
  const validatedAuthMode = validateAuthMode(authMode)
  if (validatedAuthMode === null) return null
  return {
    inputTokens,
    cachedInputTokens,
    outputTokens,
    reasoningOutputTokens,
    wallMs,
    authMode: validatedAuthMode,
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
    const key =
      isRecord(item) && isRecord((item as Record<string, unknown>).key)
        ? validateKey((item as Record<string, unknown>).key)
        : null
    if (!key) {
      rejections.push(`record ${index}: missing or malformed key`)
      continue
    }
    const record = validateRecord(item, key)
    if (!record) {
      rejections.push(
        `${describeKey(key)}: record failed validation (questions or provenance)`,
      )
      continue
    }
    records.push(record)
  }
  return { records, rejections, total: raw.records.length }
}

function describeKey(key: ExaminationArchiveKey): string {
  return `group=${key.groupSetId} member=${key.memberId} commit=${key.commitOid.slice(0, 8)} q=${key.questionCount}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

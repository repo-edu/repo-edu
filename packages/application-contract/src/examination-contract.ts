import { sha256 } from "@noble/hashes/sha2.js"
import { bytesToHex } from "@noble/hashes/utils.js"
import type { PersonDbSnapshot } from "@repo-edu/domain/analysis"
import {
  bridgeAuthorsToRoster,
  extensionToLanguage,
  LANGUAGE_CATALOG,
} from "@repo-edu/domain/analysis"
import type {
  ExaminationModelsByProvider,
  PersistedLlmConnection,
} from "@repo-edu/domain/settings"
import type { Roster } from "@repo-edu/domain/types"
import type {
  ExaminationArchiveImportSummary as HostExaminationArchiveImportSummary,
  UserSaveTargetRef,
} from "@repo-edu/host-runtime-contract"
import type { LlmEffort, LlmUsage } from "@repo-edu/integrations-llm-contract"
import type { SUBMISSION_FOLDER_PERSON_ID } from "./workflow-types.js"

export type ExaminationCodeExcerpt = {
  filePath: string
  startLine: number
  lines: string[]
}

export type ExaminationLocalIdentityContext = {
  names: string[]
  emails: string[]
  opaqueIdentifiers: string[]
  gitUsernames: string[]
}

export const EXAMINATION_PROMPT_TEMPLATE_VERSION = 2 as const
export const EXAMINATION_REDACTION_POLICY_VERSION = 1 as const
export const SUBMISSION_SELECTION_MAX_FILES = 50
export const SUBMISSION_SELECTION_MAX_BYTES = 512 * 1024

const EXAMINATION_REDACTION_IDENTITY_SCOPE_VERSION =
  "examination-redaction-identity-scope-v1" as const

export type ExaminationTokenizerTreatment = "stripped" | "fallback"

export type ExaminationProviderExcerptIdentity = {
  sourceDescriptor: string
  tokenizerTreatment: ExaminationTokenizerTreatment
  startLine: number
  lineCount: number
  redactedContentFingerprint: string
}

export type ExaminationArchiveKey = {
  personId: string
  contentScopeId: string
  questionCount: number
  providerPayloadFingerprint: string
  generationContextFingerprint: string
}

export type ExaminationGenerationContext = {
  model: string
  effort: LlmEffort
  promptTemplateVersion?: number
  redactionPolicyVersion?: number
}

export type ExaminationGenerationContextCanonical = {
  model: string
  effort: LlmEffort
  promptTemplateVersion: number
  redactionPolicyVersion: number
}

const EXAMINATION_ARCHIVE_STORAGE_KEY_VERSION =
  "examination-archive-key-v2" as const

const EXAMINATION_GENERATION_CONTEXT_VERSION =
  "examination-generation-context-v2" as const

// Archive fingerprints sit inside a composite key that also includes
// repository, person, commit, question count, and generation context. A
// 32-bit hash collision alone cannot produce a wrong hit unless every other
// key field also matches, so FNV-1a is sufficient for this cache identity.
function fnv1a32Hex(input: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, "0")
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
  return fnv1a32Hex(lines.join("\n"))
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

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function canonicalizeIdentityValues(
  values: readonly string[],
  compare: (value: string) => string,
): string[] {
  return dedupeByComparison(values, compare).toSorted(compareStrings)
}

export function canonicalizeExaminationLocalIdentityContext(
  context: ExaminationLocalIdentityContext,
): ExaminationLocalIdentityContext {
  return {
    names: canonicalizeIdentityValues(context.names, (value) =>
      value.toLowerCase(),
    ),
    emails: canonicalizeIdentityValues(context.emails, (value) =>
      value.toLowerCase(),
    ),
    opaqueIdentifiers: canonicalizeIdentityValues(
      context.opaqueIdentifiers,
      (value) => value,
    ),
    gitUsernames: canonicalizeIdentityValues(context.gitUsernames, (value) =>
      value.toLowerCase(),
    ),
  }
}

export function buildExaminationRedactionIdentityScopeId(
  context: ExaminationLocalIdentityContext,
): string {
  const canonical = canonicalizeExaminationLocalIdentityContext(context)
  return fnv1a32Hex(
    JSON.stringify([
      EXAMINATION_REDACTION_IDENTITY_SCOPE_VERSION,
      EXAMINATION_REDACTION_POLICY_VERSION,
      canonical.names,
      canonical.emails,
      canonical.opaqueIdentifiers,
      canonical.gitUsernames,
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

export function buildExaminationProviderPayloadFingerprint(
  identities: readonly ExaminationProviderExcerptIdentity[],
  options: {
    sourceIds?: readonly string[]
  } = {},
): string {
  if (
    options.sourceIds !== undefined &&
    options.sourceIds.length !== identities.length
  ) {
    throw new Error("Source id count must match examination excerpt count.")
  }
  const serialized = identities
    .map((identity, index) => {
      const identityKey = providerExcerptIdentityKey(identity)
      const sourceId = options.sourceIds?.[index] ?? null
      return { identityKey, sourceId }
    })
    .toSorted((a, b) => {
      return (
        compareStrings(a.identityKey, b.identityKey) ||
        compareStrings(a.sourceId ?? "", b.sourceId ?? "")
      )
    })
    .filter((entry, index, sorted) => {
      if (index === 0) return true
      return (
        entry.identityKey !== sorted[index - 1].identityKey ||
        entry.sourceId !== sorted[index - 1].sourceId
      )
    })
    .map((entry) =>
      entry.sourceId === null
        ? entry.identityKey
        : [entry.identityKey, entry.sourceId].join("\u001d"),
    )
    .join("\u001e")
  return fnv1a32Hex(
    JSON.stringify([EXAMINATION_REDACTION_POLICY_VERSION, serialized]),
  )
}

export function assignExaminationSourceIds(
  identities: readonly ExaminationProviderExcerptIdentity[],
  options: {
    forbiddenSourceIds?: readonly string[]
  } = {},
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
  const uniqueIds = uniqueKeys.map(({ key, index }) => {
    const sourceId = chooseSourceId({
      index,
      forbidden,
      used: usedSourceIds,
    })
    usedSourceIds.add(sourceId.toLowerCase())
    return [key, sourceId] as const
  })
  const sourceIdByKey = new Map(uniqueIds)
  return identities.map((identity) => {
    const sourceId = sourceIdByKey.get(providerExcerptIdentityKey(identity))
    if (sourceId === undefined) {
      throw new Error("Missing examination source id assignment.")
    }
    return sourceId
  })
}

export function canonicalizeExaminationGenerationContext(
  context: ExaminationGenerationContext,
): ExaminationGenerationContextCanonical {
  return {
    model: context.model,
    effort: context.effort,
    promptTemplateVersion:
      context.promptTemplateVersion ?? EXAMINATION_PROMPT_TEMPLATE_VERSION,
    redactionPolicyVersion:
      context.redactionPolicyVersion ?? EXAMINATION_REDACTION_POLICY_VERSION,
  }
}

export function buildExaminationGenerationContextFingerprint(
  context: ExaminationGenerationContext,
): string {
  const canonical = canonicalizeExaminationGenerationContext(context)
  return fnv1a32Hex(
    JSON.stringify([
      EXAMINATION_GENERATION_CONTEXT_VERSION,
      canonical.model,
      canonical.effort,
      canonical.promptTemplateVersion,
      canonical.redactionPolicyVersion,
    ]),
  )
}

export function serializeExaminationArchiveStorageKey(
  key: ExaminationArchiveKey,
): string {
  return JSON.stringify([
    EXAMINATION_ARCHIVE_STORAGE_KEY_VERSION,
    key.personId,
    key.contentScopeId,
    key.questionCount,
    key.providerPayloadFingerprint,
    key.generationContextFingerprint,
  ])
}

export function parseExaminationArchiveStorageKey(
  storageKey: string,
): ExaminationArchiveKey | null {
  let raw: unknown
  try {
    raw = JSON.parse(storageKey)
  } catch {
    return null
  }
  if (!Array.isArray(raw) || raw.length !== 6) return null
  const [
    version,
    personId,
    contentScopeId,
    questionCount,
    providerPayloadFingerprint,
    generationContextFingerprint,
  ] = raw
  if (version !== EXAMINATION_ARCHIVE_STORAGE_KEY_VERSION) return null
  return validateExaminationArchiveKey({
    personId,
    contentScopeId,
    questionCount,
    providerPayloadFingerprint,
    generationContextFingerprint,
  })
}

export function isExaminationContentScopeIdShape(value: string): boolean {
  return /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(value)
}

export function buildSubmissionContentScopeId(bytes: Uint8Array): string {
  return bytesToHex(sha256(bytes))
}

/**
 * Build a stable content-scope id for a *set* of submission files. The
 * id is deterministic in the file set: sorting by relative path makes the
 * order of input independent, and hashing each file's bytes (rather than
 * concatenating raw bytes) keeps the inner work cheap for large folders.
 *
 * Adding, removing, or modifying any file in the set yields a different
 * id, which is how examination archive entries stay partitioned by which
 * files were actually examined.
 */
export function buildSubmissionFolderContentScopeId(
  files: readonly { relativePath: string; bytes: Uint8Array }[],
): string {
  const parts = [...files]
    .sort((a, b) =>
      a.relativePath < b.relativePath
        ? -1
        : a.relativePath > b.relativePath
          ? 1
          : 0,
    )
    .map((file) => [file.relativePath, bytesToHex(sha256(file.bytes))])
  const encoder = new TextEncoder()
  return bytesToHex(sha256(encoder.encode(JSON.stringify(parts))))
}

export function validateExaminationArchiveKey(
  raw: unknown,
): ExaminationArchiveKey | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null
  }
  const record = raw as Record<string, unknown>
  const allowedFields = new Set([
    "personId",
    "contentScopeId",
    "questionCount",
    "providerPayloadFingerprint",
    "generationContextFingerprint",
  ])
  if (Object.keys(record).some((field) => !allowedFields.has(field))) {
    return null
  }
  const {
    personId,
    contentScopeId,
    questionCount,
    providerPayloadFingerprint,
    generationContextFingerprint,
  } = record
  if (
    typeof personId !== "string" ||
    personId.length === 0 ||
    typeof contentScopeId !== "string" ||
    !isExaminationContentScopeIdShape(contentScopeId) ||
    typeof questionCount !== "number" ||
    !Number.isInteger(questionCount) ||
    questionCount < 1 ||
    questionCount > 20 ||
    typeof providerPayloadFingerprint !== "string" ||
    providerPayloadFingerprint.length === 0 ||
    typeof generationContextFingerprint !== "string" ||
    generationContextFingerprint.length === 0
  ) {
    return null
  }
  return {
    personId,
    contentScopeId,
    questionCount,
    providerPayloadFingerprint,
    generationContextFingerprint,
  }
}

function normalizeIdentityText(value: string): string {
  return value.trim().split(/\s+/).join(" ")
}

function dedupeByComparison(
  values: readonly string[],
  compare: (value: string) => string,
): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of values) {
    const value = normalizeIdentityText(raw)
    if (value.length === 0) continue
    const key = compare(value)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(value)
  }
  return out
}

function containsAsciiLetter(value: string): boolean {
  return /[A-Za-z]/.test(value)
}

export function buildExaminationLocalIdentityContext({
  personDb,
  roster,
}: {
  personDb: PersonDbSnapshot
  roster?: Roster | null
}): ExaminationLocalIdentityContext {
  const names: string[] = []
  const emails: string[] = []
  const opaqueIdentifiers: string[] = []
  const gitUsernames: string[] = []

  for (const person of personDb.persons) {
    names.push(person.canonicalName)
    emails.push(person.canonicalEmail)
    for (const alias of person.aliases) {
      names.push(alias.name)
      emails.push(alias.email)
    }
  }

  if (roster) {
    const members = [...roster.students, ...roster.staff]
    const memberById = new Map(members.map((member) => [member.id, member]))
    const bridge = bridgeAuthorsToRoster(personDb, members)
    for (const match of bridge.matches) {
      const member = memberById.get(match.memberId)
      if (!member) continue
      names.push(member.name)
      emails.push(member.email)
      const memberId = normalizeIdentityText(member.id)
      if (containsAsciiLetter(memberId)) {
        opaqueIdentifiers.push(memberId)
      }
      const lmsUserId =
        member.lmsUserId === null ? "" : normalizeIdentityText(member.lmsUserId)
      if (containsAsciiLetter(lmsUserId)) {
        opaqueIdentifiers.push(lmsUserId)
      }
      if (member.gitUsername !== null) {
        gitUsernames.push(member.gitUsername)
      }
    }
  }

  return {
    names: dedupeByComparison(names, (value) => value.toLowerCase()),
    emails: dedupeByComparison(emails, (value) => value.toLowerCase()),
    opaqueIdentifiers: dedupeByComparison(opaqueIdentifiers, (value) => value),
    gitUsernames: dedupeByComparison(gitUsernames, (value) =>
      value.toLowerCase(),
    ),
  }
}

function finalExtension(filePath: string): string {
  const basename = filePath.replace(/\\/g, "/").split("/").pop() ?? filePath
  const index = basename.lastIndexOf(".")
  return index < 0 ? "" : basename.slice(index + 1)
}

export function resolveExaminationSourceDescriptor(filePath: string): string {
  const language = extensionToLanguage(finalExtension(filePath))
  return language === undefined
    ? "unknown language"
    : LANGUAGE_CATALOG[language].label
}

export type ExaminationLlmSettings = {
  llmConnections: PersistedLlmConnection[]
  activeLlmConnectionId: string | null
  examinationModelsByProvider: ExaminationModelsByProvider
}

export type ExaminationGenerateQuestionsBaseInput = {
  /**
   * Stable identity of the author the excerpts belong to, derived from
   * blame canonicalization. Always present — examinations key on this so
   * generation works without a roster.
   */
  personId: string
  contentScopeId: string
  localIdentityContext: ExaminationLocalIdentityContext
  excerpts: ExaminationCodeExcerpt[]
  excerptFileSources: Record<string, string>
  questionCount: number
  /**
   * Subset of settings the examination workflow needs to resolve which LLM
   * connection and model code to use. The renderer composes LLM credentials
   * from `useCredentialsStore` with model preferences from `useAppSettingsStore`
   * so the workflow stays a pure function of its input.
   */
  llmSettings: ExaminationLlmSettings
}

export type ExaminationGenerateQuestionsInput =
  ExaminationGenerateQuestionsBaseInput & {
    /**
     * Existing accepted questions to keep when extending a set. The workflow
     * generates only the remaining questions needed to reach `questionCount`
     * and archives the combined set.
     */
    seedQuestions?: ExaminationQuestion[]
    /**
     * Process-local handle used by the renderer to soft-stop an in-flight
     * generation and keep completed questions. It is not persisted or used for
     * archive lookup.
     */
    generationControlId: string
    /**
     * When true, skip the archive read and always call the LLM. The fresh
     * result overwrites any matching archived entry on success. Errors never
     * populate the archive. Graders trigger this via a "Regenerate" action.
     */
    regenerate?: boolean
  }

export type ExaminationLookupQuestionsInput =
  ExaminationGenerateQuestionsBaseInput

export type ExaminationAttachedRosterIdentityInput = {
  name: string | null
  email: string | null
  id: string | null
  lmsUserId: string | null
  studentNumber: string | null
  gitUsername: string | null
}

export type ExaminationPrepareSubmissionSourceInput = {
  folderPath: string
  selectedRelativePaths: string[]
  configuredExtensions: string[]
  attachedRosterIdentities?: ExaminationAttachedRosterIdentityInput[]
}

export type ExaminationPreparedSubmissionSource = {
  folderPath: string
  personId: typeof SUBMISSION_FOLDER_PERSON_ID
  displayTitle: string
  displaySubtitle: string
  contentScopeId: string
  localIdentityContext: ExaminationLocalIdentityContext
  redactionPolicyVersion: typeof EXAMINATION_REDACTION_POLICY_VERSION
  excerpts: ExaminationCodeExcerpt[]
  excerptFileSources: Record<string, string>
}

export type ExaminationQuestionSummarySubjectInput = {
  subjectId: string
  personId: string
  contentScopeId: string
  localIdentityContext: ExaminationLocalIdentityContext
  excerpts: ExaminationCodeExcerpt[]
  excerptFileSources: Record<string, string>
}

export type ExaminationLookupQuestionSummariesInput = {
  subjects: ExaminationQuestionSummarySubjectInput[]
}

export type ExaminationArchivedQuestionSetSummary = {
  key: ExaminationArchiveKey
  provenance: ExaminationArchivedProvenance
}

export type ExaminationQuestionSummaryGroup = {
  subjectId: string
  sets: ExaminationArchivedQuestionSetSummary[]
}

export type ExaminationLookupQuestionSummariesResult = {
  summaries: ExaminationQuestionSummaryGroup[]
}

export type ExaminationLineRange = {
  start: number
  end: number
}

export type ExaminationSourceAnchor = {
  sourceId: string | null
  lineRange: ExaminationLineRange | null
}

export type ExaminationQuestion = {
  question: string
  answer: string
  anchor: ExaminationSourceAnchor
}

export type ExaminationUsage = LlmUsage

export type ExaminationArchivedProvenance = {
  /**
   * Catalog short code that produced the run (e.g. `"22"`, `"c33"`). The
   * code expands into a full `LlmModelSpec` via the catalog; storing the
   * code keeps the archive readable after spec metadata changes.
   */
  model: string
  /**
   * Effort tier that produced the run, retained for legacy display. Drops
   * out of `model` because the code already encodes effort.
   */
  effort: LlmEffort
  questionCount: number
  usage: ExaminationUsage | null
  createdAtMs: number
  redactionPolicyVersion: number
  promptTemplateVersion: number
}

export type ExaminationSourceReference = {
  sourceId: string
  occurrences: {
    filePath: string
    lineRange: ExaminationLineRange
  }[]
}

export type ExaminationGenerateQuestionsResult = {
  key: ExaminationArchiveKey
  questions: ExaminationQuestion[]
  usage: ExaminationUsage | null
  fromArchive: boolean
  requestedQuestionCount: number
  archivedProvenance: ExaminationArchivedProvenance
  sourceReferences: ExaminationSourceReference[]
}

export type ExaminationArchivedQuestionSet = ExaminationGenerateQuestionsResult

export type ExaminationLookupQuestionsResult = {
  requestedKey: ExaminationArchiveKey
  sourceReferences: ExaminationSourceReference[]
  exact: ExaminationGenerateQuestionsResult | null
  availableSets: ExaminationArchivedQuestionSet[]
}

export type ExaminationArchiveRecord = {
  key: ExaminationArchiveKey
  questions: ExaminationQuestion[]
  provenance: ExaminationArchivedProvenance
}

export type ExaminationInProgressQuestion = {
  question: string
  answer: string
}

export type ExaminationStreamProgress = {
  streamedCharacterCount: number
  streamedTextPreview: string
  activityLabel: string | null
}

export type ExaminationGenerateOutput =
  | { kind: "warn"; message: string }
  | ({ kind: "stream-progress" } & ExaminationStreamProgress)
  | {
      kind: "partial-questions"
      acceptedQuestionCount: number
      questions: ExaminationQuestion[]
      sourceReferences: ExaminationSourceReference[]
      inProgressQuestion: ExaminationInProgressQuestion | null
    }

export type ExaminationStopGenerationInput = {
  generationControlId: string
}

export type ExaminationStopGenerationResult =
  | { stopped: true }
  | { stopped: false; reason: "not-running" }

export const EXAMINATION_ARCHIVE_BUNDLE_FORMAT =
  "repo-edu-examination-archive" as const
export const EXAMINATION_ARCHIVE_BUNDLE_VERSION = 2 as const

export type ExaminationArchiveBundle = {
  format: typeof EXAMINATION_ARCHIVE_BUNDLE_FORMAT
  bundleVersion: typeof EXAMINATION_ARCHIVE_BUNDLE_VERSION
  exportedAt: string
  records: ExaminationArchiveRecord[]
}

export type ExaminationArchiveExportResult = {
  file: UserSaveTargetRef
  recordCount: number
}

export type ExaminationArchiveImportSummary =
  HostExaminationArchiveImportSummary

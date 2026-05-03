import type { FileFormat } from "@repo-edu/domain/types"

export const packageId = "@repo-edu/host-runtime-contract"

export type UserFileRef = {
  kind: "user-file-ref"
  referenceId: string
  displayName: string
  mediaType: string | null
  byteLength: number | null
}

export type UserSaveTargetRef = {
  kind: "user-save-target-ref"
  referenceId: string
  displayName: string
  suggestedFormat: FileFormat | null
}

export type UserFileReadRef = UserFileRef
export type UserSaveTargetWriteRef = UserSaveTargetRef

export type UserFileText = {
  displayName: string
  mediaType: string | null
  text: string
  byteLength: number
}

export type UserFileWriteReceipt = {
  displayName: string
  mediaType: string | null
  byteLength: number
  savedAt: string
}

export type UserFilePort = {
  readText(
    reference: UserFileReadRef,
    signal?: AbortSignal,
  ): Promise<UserFileText>
  writeText(
    reference: UserSaveTargetWriteRef,
    text: string,
    signal?: AbortSignal,
  ): Promise<UserFileWriteReceipt>
}

export type HttpRequest = {
  url: string
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  headers?: Record<string, string>
  body?: string
  signal?: AbortSignal
}

export type HttpResponse = {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
}

export type HttpPort = {
  fetch(request: HttpRequest): Promise<HttpResponse>
}

export type ProcessCancellation =
  | "non-cancellable"
  | "best-effort"
  | "cooperative"

export type ProcessRequest = {
  command: string
  args?: string[]
  cwd?: string
  env?: Record<string, string>
  stdinText?: string
  signal?: AbortSignal
}

export type ProcessResult = {
  exitCode: number | null
  signal: string | null
  stdout: string
  stderr: string
}

export type ProcessPort = {
  cancellation: ProcessCancellation
  run(request: ProcessRequest): Promise<ProcessResult>
}

export type GitCommandRequest = {
  args: string[]
  cwd?: string
  env?: Record<string, string>
  stdinText?: string
  signal?: AbortSignal
}

export type GitCommandPort = {
  cancellation: ProcessCancellation
  run(request: GitCommandRequest): Promise<ProcessResult>
}

export type FileSystemEntryKind = "missing" | "file" | "directory"

export type FileSystemEntryStatus = {
  path: string
  kind: FileSystemEntryKind
}

export type FileSystemInspectRequest = {
  paths: string[]
  signal?: AbortSignal
}

export type FileSystemEnsureDirectoryOperation = {
  kind: "ensure-directory"
  path: string
}

export type FileSystemDeletePathOperation = {
  kind: "delete-path"
  path: string
}

export type FileSystemCopyDirectoryOperation = {
  kind: "copy-directory"
  sourcePath: string
  destinationPath: string
}

export type FileSystemBatchOperation =
  | FileSystemEnsureDirectoryOperation
  | FileSystemCopyDirectoryOperation
  | FileSystemDeletePathOperation

export type FileSystemBatchRequest = {
  operations: FileSystemBatchOperation[]
  signal?: AbortSignal
}

export type FileSystemBatchResult = {
  completed: FileSystemBatchOperation[]
}

export type FileSystemListDirectoryRequest = {
  path: string
  signal?: AbortSignal
}

export type FileSystemDirectoryEntry = {
  name: string
  kind: "file" | "directory"
}

export type FileSystemPort = {
  inspect(request: FileSystemInspectRequest): Promise<FileSystemEntryStatus[]>
  applyBatch(request: FileSystemBatchRequest): Promise<FileSystemBatchResult>
  createTempDirectory(prefix: string): Promise<string>
  listDirectory(
    request: FileSystemListDirectoryRequest,
  ): Promise<FileSystemDirectoryEntry[]>
  readonly userHomeSystemDirectories: readonly string[]
}

// LlmPort wraps the prompt/reply LlmTextClient from
// @repo-edu/integrations-llm-contract. This package re-declares the relevant
// types instead of importing them so it stays free of inter-package coupling
// and continues to be browser-safe.

export type LlmProvider = "claude" | "codex"

export type LlmEffort =
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max"

export type LlmAuthMode = "subscription" | "api"

export type LlmModelSpec = {
  provider: LlmProvider
  family: string
  modelId: string
  effort: LlmEffort
}

export type LlmRunRequest = {
  spec: LlmModelSpec
  prompt: string
  signal?: AbortSignal
}

export type LlmUsage = {
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  reasoningOutputTokens: number
  wallMs: number
  authMode: LlmAuthMode
}

export type LlmRunResult = {
  reply: string
  usage: LlmUsage
}

export type LlmPort = {
  run(request: LlmRunRequest): Promise<LlmRunResult>
}

// ---------------------------------------------------------------------------
// PersistentCache port — opaque byte-level key/value store. Schema
// invalidation is governed exclusively by the database `user_version`; a
// mismatch wipes the file wholesale. There is no per-row schema tracking.
// ---------------------------------------------------------------------------

export type PersistentCacheEntry = {
  bytes: Uint8Array
}

export type PersistentCacheSetEntry = {
  key: string
  bytes: Uint8Array
}

export type PersistentCacheStats = {
  sizeBytes: number
  entryCount: number
}

export type PersistentCache = {
  get(key: string): PersistentCacheEntry | undefined
  set(key: string, bytes: Uint8Array): void
  getMany(keys: readonly string[]): (PersistentCacheEntry | undefined)[]
  setMany(entries: readonly PersistentCacheSetEntry[]): void
  touch(key: string): void
  touchMany(keys: readonly string[]): void
  clear(): void
  stats(): PersistentCacheStats
  close(): void
}

// ---------------------------------------------------------------------------
// ExaminationArchiveStoragePort — JSON payload store keyed by the structured
// archive identity. The application archive adapter owns typed payload
// validation; the storage port owns addressing and persistence only, trusts
// that callers provide well-formed entries, and leaves database/handle
// lifecycle to the composition root.
// ---------------------------------------------------------------------------

export type ExaminationArchiveKey = {
  groupSetId: string
  memberId: string
  commitOid: string
  questionCount: number
  excerptsFingerprint: string
}

export type ExaminationArchiveStoredEntry = {
  key: ExaminationArchiveKey
  createdAtMs: number
  payloadJson: string
}

export type ExaminationArchiveImportSummary = {
  totalInBundle: number
  inserted: number
  updated: number
  skipped: number
  rejected: number
  /**
   * Human-readable reasons for each rejected record, in bundle order.
   * Length equals `rejected`. Surfaced through workflow diagnostics so the
   * user can tell which records failed without consulting logs.
   */
  rejections: string[]
}

export type ExaminationArchiveStoragePort = {
  get(key: ExaminationArchiveKey): ExaminationArchiveStoredEntry | undefined
  put(entry: ExaminationArchiveStoredEntry): void
  exportAll(): ExaminationArchiveStoredEntry[]
  importAll(
    entries: readonly ExaminationArchiveStoredEntry[],
  ): ExaminationArchiveImportSummary
}

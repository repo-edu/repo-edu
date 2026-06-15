import type {
  LoadedTokenizerLanguage,
  TokenizerSupportedLanguage,
} from "@repo-edu/domain/analysis"
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

export type FileSystemStatRequest = {
  path: string
  signal?: AbortSignal
}

export type FileSystemStatResult = {
  kind: FileSystemEntryKind
  size: number | null
}

export type FileSystemListFilesRequest = {
  rootPath: string
  extensions: string[]
  signal?: AbortSignal
}

export type FileSystemListedFile = {
  relativePath: string
  size: number
}

export type FileSystemReadFileInsideRootRequest = {
  rootPath: string
  relativePath: string
  maxBytes: number
  signal?: AbortSignal
}

export type FileSystemReadFileInsideRootResult = {
  relativePath: string
  bytes: Uint8Array
}

export type FileSystemPort = {
  inspect(request: FileSystemInspectRequest): Promise<FileSystemEntryStatus[]>
  stat(request: FileSystemStatRequest): Promise<FileSystemStatResult>
  applyBatch(request: FileSystemBatchRequest): Promise<FileSystemBatchResult>
  createTempDirectory(prefix: string): Promise<string>
  listDirectory(
    request: FileSystemListDirectoryRequest,
  ): Promise<FileSystemDirectoryEntry[]>
  listFiles(
    request: FileSystemListFilesRequest,
  ): Promise<FileSystemListedFile[]>
  readFileInsideRoot(
    request: FileSystemReadFileInsideRootRequest,
  ): Promise<FileSystemReadFileInsideRootResult>
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

export type LlmProviderRuntimeConfig = {
  authMode?: LlmAuthMode
  env?: Record<string, string>
  apiKey?: string
  baseUrl?: string
}

export type ClaudeLlmProviderRuntimeConfig = LlmProviderRuntimeConfig & {
  maxTokens?: number
}

export type CodexLlmProviderRuntimeConfig = LlmProviderRuntimeConfig & {
  binaryPath?: string
}

export type LlmRuntimeConfig = {
  claude?: ClaudeLlmProviderRuntimeConfig
  codex?: CodexLlmProviderRuntimeConfig
}

export type LlmRunRequest = {
  spec: LlmModelSpec
  prompt: string
  runtimeConfig?: LlmRuntimeConfig
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

export type LlmStreamEvent =
  | { kind: "text-delta"; text: string }
  | { kind: "activity"; label: string }
  | { kind: "done"; usage: LlmUsage }

export type LlmPort = {
  run(request: LlmRunRequest): Promise<LlmRunResult>
  stream(request: LlmRunRequest): AsyncIterable<LlmStreamEvent>
}

// TokenizerPort prepares live tree-sitter parser handles for application code
// running in the same process as the host implementation. Unsupported-language
// decisions belong at the caller boundary via domain tokenizer helpers; load
// rejection here is an environment or asset failure.

export type TokenizerPort = {
  loadTokenizerLanguage(
    id: TokenizerSupportedLanguage,
  ): Promise<LoadedTokenizerLanguage>
}

// ---------------------------------------------------------------------------
// ExaminationArchiveStoragePort — opaque JSON payload store for examination
// archives. The application archive adapter owns archive-key semantics,
// typed payload validation, and storage-key serialization; the host storage
// port owns persistence only, trusts that callers provide well-formed entries,
// and leaves database/handle lifecycle to the composition root.
// ---------------------------------------------------------------------------

export type ExaminationArchiveStoredEntry = {
  storageKey: string
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
  get(storageKey: string): ExaminationArchiveStoredEntry | undefined
  put(entry: ExaminationArchiveStoredEntry): void
  remove(storageKey: string): void
  exportAll(): ExaminationArchiveStoredEntry[]
  importAll(
    entries: readonly ExaminationArchiveStoredEntry[],
  ): ExaminationArchiveImportSummary
}

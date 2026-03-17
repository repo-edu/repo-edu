import type { FileFormat } from "@repo-edu/domain"

export const packageId = "@repo-edu/host-runtime-contract"

export type UserFileReadRef = {
  kind: "user-file-ref"
  referenceId: string
  displayName: string
  mediaType: string | null
  byteLength: number | null
}

export type UserSaveTargetWriteRef = {
  kind: "user-save-target-ref"
  referenceId: string
  displayName: string
  suggestedFormat: FileFormat | null
}

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

export type FileSystemPort = {
  inspect(request: FileSystemInspectRequest): Promise<FileSystemEntryStatus[]>
  applyBatch(request: FileSystemBatchRequest): Promise<FileSystemBatchResult>
  createTempDirectory(prefix: string): Promise<string>
}

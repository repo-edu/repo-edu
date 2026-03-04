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
  readText(reference: UserFileReadRef, signal?: AbortSignal): Promise<UserFileText>
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

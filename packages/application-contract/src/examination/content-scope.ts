import { sha256 } from "@noble/hashes/sha2.js"
import { bytesToHex } from "@noble/hashes/utils.js"

export function isExaminationContentScopeIdShape(value: string): boolean {
  return /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(value)
}

export function buildSubmissionContentScopeId(bytes: Uint8Array): string {
  return bytesToHex(sha256(bytes))
}

/**
 * Build a stable content-scope id for a set of submission files. Sorting by
 * relative path makes the input order irrelevant. Hashing each file before
 * the outer tuple avoids concatenating large byte arrays while preserving
 * changes to file paths and contents in the resulting identity.
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

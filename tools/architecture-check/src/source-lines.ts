import * as fs from "node:fs"

import { repoPathToAbsolute } from "./repo-paths.js"

const BINARY_SAMPLE_BYTES = 1024

export function countRepoFileLines(root: string, repoPath: string): number {
  return countFileLines(repoPathToAbsolute(root, repoPath))
}

export function countFileLines(filePath: string): number {
  try {
    return countLinesInBuffer(fs.readFileSync(filePath))
  } catch (error) {
    if (isMissingFileError(error)) return 0
    throw error
  }
}

export function countLinesInBuffer(content: Buffer): number {
  if (content.length === 0 || isProbablyBinary(content)) return 0

  let lines = 0
  for (const byte of content) {
    if (byte === 10) lines += 1
  }

  if (content[content.length - 1] !== 10) lines += 1
  return lines
}

export function isProbablyBinary(content: Buffer): boolean {
  const sampleSize = Math.min(content.length, BINARY_SAMPLE_BYTES)
  for (let index = 0; index < sampleSize; index += 1) {
    if (content[index] === 0) return true
  }
  return false
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT"
}

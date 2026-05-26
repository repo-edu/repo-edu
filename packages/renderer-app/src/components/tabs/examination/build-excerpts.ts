import {
  type ExaminationCodeExcerpt,
  SUBMISSION_FILE_MAX_BYTES,
  SUBMISSION_FILE_MAX_LINES,
} from "@repo-edu/application-contract"
import type { BlameResult, PersonDbSnapshot } from "@repo-edu/domain/analysis"

// Per-member excerpt budget. Larger values give the LLM richer context but
// cost more tokens and wall time; the cap also protects against blame results
// dominated by a single author on a huge file.
const MAX_TOTAL_LINES = 400
const MAX_EXCERPTS = 30
const MAX_LINES_PER_EXCERPT = 40

export type DecodedSubmissionFile = {
  bytes: Uint8Array
  decodedText: string
}

function normalizeNameForKey(name: string): string {
  return name.trim().split(/\s+/).join(" ").toLowerCase()
}

function normalizeEmailForKey(email: string): string {
  return email.trim().toLowerCase()
}

function identityKey(name: string, email: string): string {
  return `${normalizeEmailForKey(email)}\0${normalizeNameForKey(name)}`
}

export function buildMemberExcerpts(
  blameResult: BlameResult,
  personDb: PersonDbSnapshot,
  personId: string,
): ExaminationCodeExcerpt[] {
  const excerpts: ExaminationCodeExcerpt[] = []
  let totalLines = 0

  for (const fileBlame of blameResult.fileBlames) {
    if (excerpts.length >= MAX_EXCERPTS || totalLines >= MAX_TOTAL_LINES) {
      break
    }

    let currentStart: number | null = null
    let currentLines: string[] = []
    const flushRun = () => {
      if (currentStart === null || currentLines.length === 0) return
      const sliced = currentLines.slice(0, MAX_LINES_PER_EXCERPT)
      excerpts.push({
        filePath: fileBlame.path,
        startLine: currentStart,
        lines: sliced,
      })
      totalLines += sliced.length
      currentStart = null
      currentLines = []
    }

    for (const line of fileBlame.lines) {
      if (excerpts.length >= MAX_EXCERPTS || totalLines >= MAX_TOTAL_LINES) {
        break
      }
      const key = identityKey(line.authorName, line.authorEmail)
      const linePersonId = personDb.identityIndex.get(key)
      if (linePersonId !== personId) {
        flushRun()
        continue
      }
      if (currentStart === null) {
        currentStart = line.lineNumber
        currentLines = [line.content]
      } else if (line.lineNumber === currentStart + currentLines.length) {
        currentLines.push(line.content)
      } else {
        flushRun()
        currentStart = line.lineNumber
        currentLines = [line.content]
      }
    }
    flushRun()
  }

  return excerpts
}

export function buildExcerptFileSources(
  blameResult: BlameResult,
  excerpts: readonly ExaminationCodeExcerpt[],
): Record<string, string> {
  const requested = new Set(excerpts.map((excerpt) => excerpt.filePath))
  const sources: Record<string, string> = {}
  for (const fileBlame of blameResult.fileBlames) {
    if (!requested.has(fileBlame.path)) continue
    sources[fileBlame.path] = [...fileBlame.lines]
      .sort((a, b) => a.lineNumber - b.lineNumber)
      .map((line) => line.content)
      .join("\n")
  }
  return sources
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

export function decodeSubmissionFileBytes(input: {
  base64: string
  byteLength: number
}): DecodedSubmissionFile {
  const bytes = base64ToBytes(input.base64)
  if (bytes.byteLength !== input.byteLength) {
    throw new Error(
      "Submission file byte length did not match the workflow result.",
    )
  }
  if (bytes.byteLength > SUBMISSION_FILE_MAX_BYTES) {
    throw new Error(
      `Submission file exceeds the ${Math.round(
        SUBMISSION_FILE_MAX_BYTES / 1024,
      )} KiB sanity cap.`,
    )
  }
  const decodedText = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  if (decodedText.split("\n").length > SUBMISSION_FILE_MAX_LINES) {
    throw new Error(
      `Submission file exceeds the ${SUBMISSION_FILE_MAX_LINES}-line sanity cap.`,
    )
  }
  return { bytes, decodedText }
}

export function buildSubmissionExcerpts(
  relativePath: string,
  decodedText: string,
): ExaminationCodeExcerpt[] {
  return [
    {
      filePath: relativePath,
      startLine: 1,
      lines: decodedText.split("\n"),
    },
  ]
}

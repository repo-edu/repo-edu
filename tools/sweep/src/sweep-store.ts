import * as fs from "node:fs"
import * as path from "node:path"
import { fileURLToPath } from "node:url"

/**
 * Both state files live beside the tool, gitignored. They are tool-owned and
 * never committed, so co-locating them with the tool keeps the cache out of
 * both repos and out of the source inventory.
 */
const STATE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
)
const SKIP_CACHE = path.join(STATE_DIR, "skip-cache.tsv")
const REFACTOR_TODO = path.join(STATE_DIR, "refactor-todo.tsv")

const FIELD_SEPARATOR = "\t"

/** An ok verdict: the file at this content was judged not worth splitting. */
export type SkipEntry = {
  readonly hash: string
  readonly path: string
}

/** A flag verdict: the file at this content was judged worth refactoring. */
export type FlagEntry = SkipEntry & {
  readonly reason: string
}

export function readSkipEntries(): SkipEntry[] {
  return readRecords(SKIP_CACHE).flatMap((fields) => {
    const [hash, repoPath] = fields
    if (!hash || !repoPath) return []
    return [{ hash, path: repoPath }]
  })
}

export function appendSkipEntry(entry: SkipEntry): void {
  appendRecord(SKIP_CACHE, [entry.hash, entry.path])
}

export function readFlagEntries(): FlagEntry[] {
  return readRecords(REFACTOR_TODO).flatMap((fields) => {
    const [hash, repoPath, ...reasonParts] = fields
    if (!hash || !repoPath) return []
    return [{ hash, path: repoPath, reason: reasonParts.join(FIELD_SEPARATOR) }]
  })
}

export function appendFlagEntry(entry: FlagEntry): void {
  appendRecord(REFACTOR_TODO, [entry.hash, entry.path, entry.reason])
}

export function writeFlagEntries(entries: readonly FlagEntry[]): void {
  writeRecords(
    REFACTOR_TODO,
    entries.map((entry) => [entry.hash, entry.path, entry.reason]),
  )
}

function readRecords(file: string): string[][] {
  let content: string
  try {
    content = fs.readFileSync(file, "utf8")
  } catch (error) {
    if (isMissingFileError(error)) return []
    throw error
  }
  return content
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => line.split(FIELD_SEPARATOR))
}

function appendRecord(file: string, fields: readonly string[]): void {
  fs.appendFileSync(file, `${fields.join(FIELD_SEPARATOR)}\n`)
}

function writeRecords(file: string, records: readonly string[][]): void {
  const body = records.map((fields) => fields.join(FIELD_SEPARATOR)).join("\n")
  fs.writeFileSync(file, body.length > 0 ? `${body}\n` : "")
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT"
}

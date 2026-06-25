import * as fs from "node:fs"
import * as path from "node:path"
import { fileURLToPath } from "node:url"

/**
 * The two state files split by lifetime. The skip cache is a disposable,
 * hash-keyed record of "already judged at this content": it churns on every
 * edit and costs only machine time to rebuild, so it stays beside the tool,
 * gitignored and out of both repos' history. The refactor backlog is the
 * durable half, path-keyed reasons and routing status the queue drains, so it
 * lives committed in the sibling plan repo where planning churn belongs and its
 * routing reasons already point. The plan path assumes plan and repo-edu sit
 * side by side; trivial to make configurable when that stops holding.
 */
const TOOL_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
)
const REPO_EDU_ROOT = path.resolve(TOOL_DIR, "..", "..")
const SKIP_CACHE = path.join(TOOL_DIR, "skip-cache.tsv")
const REFACTOR_BACKLOG = path.resolve(
  REPO_EDU_ROOT,
  "..",
  "plan",
  "notes",
  "refactor-backlog.tsv",
)

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
  return readRecords(REFACTOR_BACKLOG).flatMap((fields) => {
    const [hash, repoPath, ...reasonParts] = fields
    if (!hash || !repoPath) return []
    return [{ hash, path: repoPath, reason: reasonParts.join(FIELD_SEPARATOR) }]
  })
}

export function appendFlagEntry(entry: FlagEntry): void {
  appendRecord(REFACTOR_BACKLOG, [entry.hash, entry.path, entry.reason])
}

export function writeFlagEntries(entries: readonly FlagEntry[]): void {
  writeRecords(
    REFACTOR_BACKLOG,
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

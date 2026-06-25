import { readSourceInventory } from "../../architecture-check/src/inventory.js"
import {
  normalizeRepoPath,
  ROOT,
} from "../../architecture-check/src/repo-paths.js"
import { countRepoFileLines } from "../../architecture-check/src/source-lines.js"
import { gitHashObject } from "./git-hash.js"
import {
  appendFlagEntry,
  appendSkipEntry,
  type FlagEntry,
  readFlagEntries,
  readSkipEntries,
  type SkipEntry,
  writeFlagEntries,
} from "./sweep-store.js"

/** A file surfaced for judgment: the biggest one not yet judged at its hash. */
export type Candidate = {
  readonly path: string
  readonly lines: number
  readonly hash: string
}

/** A flagged file as the backlog shows it: current size plus its reason. */
export type QueueItem = {
  readonly path: string
  readonly lines: number
  readonly reason: string
}

/**
 * The biggest source file whose current content has no ok or flag verdict, or
 * null when every file is judged. Both verdict kinds count as judged: an entry
 * is keyed on (path, content hash), so a content change invalidates it and the
 * file re-surfaces.
 */
export function findNextCandidate(): Candidate | null {
  const inventory = readSourceInventory(ROOT)
  const hashByPath = gitHashObject(ROOT, inventory.files)
  const judged = judgedKeys()

  const ranked = inventory.files
    .map((repoPath) => ({
      path: repoPath,
      lines: countRepoFileLines(ROOT, repoPath),
      hash: hashByPath.get(repoPath) ?? "",
    }))
    .sort(
      (left, right) =>
        right.lines - left.lines || left.path.localeCompare(right.path),
    )

  return (
    ranked.find((file) => !judged.has(verdictKey(file.path, file.hash))) ?? null
  )
}

/** Record an ok verdict for the file at its current content. */
export function recordOk(filePath: string): SkipEntry {
  const repoPath = requireInventoryPath(filePath)
  const entry: SkipEntry = { hash: hashOf(repoPath), path: repoPath }
  appendSkipEntry(entry)
  return entry
}

/** Flag the file for refactor at its current content, with a reason. */
export function recordFlag(filePath: string, reason: string): FlagEntry {
  const cleanReason = normalizeReason(reason)
  if (cleanReason.length === 0) {
    throw new Error("A flag needs a non-empty --reason.")
  }
  const repoPath = requireInventoryPath(filePath)
  const entry: FlagEntry = {
    hash: hashOf(repoPath),
    path: repoPath,
    reason: cleanReason,
  }
  appendFlagEntry(entry)
  return entry
}

/**
 * The refactor backlog, biggest first. Multiple verdicts for one path collapse
 * to the latest, since the backlog tracks a file's outstanding refactor, not
 * each judgment event.
 */
export function readQueue(): QueueItem[] {
  const latestByPath = new Map<string, FlagEntry>()
  for (const entry of readFlagEntries()) latestByPath.set(entry.path, entry)

  return [...latestByPath.values()]
    .map((entry) => ({
      path: entry.path,
      lines: countRepoFileLines(ROOT, entry.path),
      reason: entry.reason,
    }))
    .sort(
      (left, right) =>
        right.lines - left.lines || left.path.localeCompare(right.path),
    )
}

/** Drop every backlog entry for a path. Returns how many were dropped. */
export function markDone(filePath: string): number {
  const repoPath = normalizeRepoPath(filePath)
  const entries = readFlagEntries()
  const kept = entries.filter((entry) => entry.path !== repoPath)
  if (kept.length !== entries.length) writeFlagEntries(kept)
  return entries.length - kept.length
}

function judgedKeys(): Set<string> {
  const keys = new Set<string>()
  for (const entry of readSkipEntries())
    keys.add(verdictKey(entry.path, entry.hash))
  for (const entry of readFlagEntries())
    keys.add(verdictKey(entry.path, entry.hash))
  return keys
}

function verdictKey(repoPath: string, hash: string): string {
  return `${hash}\0${repoPath}`
}

function hashOf(repoPath: string): string {
  const hash = gitHashObject(ROOT, [repoPath]).get(repoPath)
  if (!hash) throw new Error(`Unable to hash ${repoPath}.`)
  return hash
}

function requireInventoryPath(filePath: string): string {
  const repoPath = normalizeRepoPath(filePath)
  if (!readSourceInventory(ROOT).fileSet.has(repoPath)) {
    throw new Error(`Not a tracked source file: ${repoPath}`)
  }
  return repoPath
}

function normalizeReason(reason: string): string {
  return reason.replace(/\s+/g, " ").trim()
}

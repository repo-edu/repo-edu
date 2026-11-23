import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import * as path from "node:path"
import { z } from "zod"
import type { ReportedDiagnostic } from "./diagnostics.js"
import { MoveInputError } from "./input-error.js"
import { targetPath, workspacePath } from "./move.js"
import { type MoveRange, prepareMoves } from "./move-service.js"
import { findTypecheckConfig } from "./typecheck-config.js"

const lineNumber = z.int().min(1)

/**
 * A move list as the `list` command reads it: the workspace-relative source,
 * the Git blob hash of the content the list was written for and the ordered
 * entries. Each entry names one target and the line ranges that go there, in
 * the lines of that unchanged content.
 */
const moveListSchema = z.strictObject({
  source: z.string().min(1),
  hash: z.string().regex(/^[0-9a-f]{40}$/),
  entries: z
    .array(
      z.strictObject({
        target: z.string().min(1),
        ranges: z
          .array(z.strictObject({ start: lineNumber, end: lineNumber }))
          .min(1),
      }),
    )
    .min(1),
})

export type MoveList = z.infer<typeof moveListSchema>

/** A file a clean list would write, with its workspace-relative path. */
export interface ListedFile {
  readonly path: string
  readonly text: string
  readonly isNew: boolean
}

/**
 * The reply of the `list` command. `clean` names every file the list would
 * write, with its new text. `changed` says the source no longer holds the
 * content the list names. `refused` names the first entry the tool cannot
 * carry out, or no entry when the tool cannot move statements of the source
 * at all.
 */
export type MoveListReply =
  | { readonly outcome: "clean"; readonly files: readonly ListedFile[] }
  | { readonly outcome: "changed"; readonly message: string }
  | {
      readonly outcome: "refused"
      readonly entry: number | null
      readonly message: string
      readonly diagnostics: readonly ReportedDiagnostic[]
    }

/** Reads a move list from its JSON text. */
export function parseMoveList(text: string): MoveList {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (error) {
    throw new MoveInputError(
      `the move list is not JSON: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  const parsed = moveListSchema.safeParse(value)
  if (!parsed.success) {
    throw new MoveInputError(
      `the move list does not have its form:\n${z.prettifyError(parsed.error)}`,
    )
  }
  return parsed.data
}

/**
 * Tries the whole move list in one in-memory attempt and writes nothing. The
 * attempt runs only when the source still holds the content the list names.
 * Its moves run in list order, each entry's ranges in their given order, and
 * the first refused move ends it.
 */
export function attemptMoveList(root: string, list: MoveList): MoveListReply {
  // Module resolution follows real paths, as for a single move.
  const realRoot = fs.realpathSync(root)
  try {
    return attempt(realRoot, list)
  } catch (error) {
    if (!(error instanceof MoveInputError)) {
      throw error
    }
    return {
      outcome: "refused",
      entry: null,
      message: error.message,
      diagnostics: [],
    }
  }
}

function attempt(root: string, list: MoveList): MoveListReply {
  const sourcePath = workspacePath(root, list.source, "source")
  if (!fs.existsSync(sourcePath)) {
    return { outcome: "changed", message: `${list.source} no longer exists` }
  }
  const hash = blobHash(root, sourcePath)
  if (hash !== list.hash) {
    return {
      outcome: "changed",
      message: `${list.source} holds content ${hash}, not the content ${list.hash} the list names`,
    }
  }

  const moves: MoveRange[] = []
  const owners: { readonly entry: number; readonly label: string }[] = []
  for (const [index, entry] of list.entries.entries()) {
    const number = index + 1
    let target: string
    try {
      target = targetPath(root, sourcePath, entry.target)
    } catch (error) {
      if (!(error instanceof MoveInputError)) {
        throw error
      }
      return {
        outcome: "refused",
        entry: number,
        message: `entry ${number} (${entry.target}): ${error.message}`,
        diagnostics: [],
      }
    }
    for (const range of entry.ranges) {
      moves.push({
        targetPath: target,
        startLine: range.start,
        endLine: range.end,
      })
      owners.push({
        entry: number,
        label: `entry ${number} (${entry.target}), lines ${range.start}-${range.end}`,
      })
    }
  }

  const candidate = prepareMoves({
    root,
    configPath: findTypecheckConfig(root, sourcePath),
    sourcePath,
    moves,
  })
  if (candidate.kind === "accepted") {
    return {
      outcome: "clean",
      files: candidate.files.map((file) => ({
        path: path.relative(root, file.path),
        text: file.text,
        isNew: file.isNew,
      })),
    }
  }
  const { refusal } = candidate
  const owner = owners[refusal.index]
  return refusal.kind === "input"
    ? {
        outcome: "refused",
        entry: owner.entry,
        message: `${owner.label}: ${refusal.message}`,
        diagnostics: [],
      }
    : {
        outcome: "refused",
        entry: owner.entry,
        message: `${owner.label}: the move adds TypeScript 6 project diagnostics`,
        diagnostics: refusal.diagnostics,
      }
}

/**
 * The source's Git blob hash, as `git hash-object` prints it. Git hashes the
 * file after the line-ending normalisation the repository's attributes ask
 * for, so a hash of the raw bytes can differ.
 */
function blobHash(root: string, sourcePath: string): string {
  const result = spawnSync(
    "git",
    ["hash-object", "--", path.relative(root, sourcePath)],
    { cwd: root, encoding: "utf8" },
  )
  if (result.error !== undefined) {
    throw result.error
  }
  if (result.status !== 0) {
    throw new Error(
      `git hash-object failed: ${result.stderr.trim() || "unknown error"}`,
    )
  }
  return result.stdout.trim()
}

import { spawnSync } from "node:child_process"

import {
  parseFlagEntries,
  REFACTOR_BACKLOG_REPO_PATH,
  serializeFlagEntries,
} from "./sweep-store.js"

/**
 * Stage the HEAD backlog with every row for one plan reason removed. The
 * working backlog is never used as input, so unrelated working changes remain
 * outside the index.
 */
export function stageHeadBacklogWithoutReason(
  root: string,
  reason: string,
): boolean {
  const treeEntry = readHeadBacklogEntry(root)
  const headEntries = parseFlagEntries(
    runGit(root, ["cat-file", "blob", treeEntry.object]),
  )
  const kept = headEntries.filter((entry) => entry.reason !== reason)
  const blob = runGit(
    root,
    ["hash-object", "-w", "--stdin"],
    serializeFlagEntries(kept),
  ).trim()

  runGit(root, [
    "update-index",
    "--add",
    "--cacheinfo",
    treeEntry.mode,
    blob,
    REFACTOR_BACKLOG_REPO_PATH,
  ])

  return kept.length !== headEntries.length
}

function readHeadBacklogEntry(root: string): {
  readonly mode: string
  readonly object: string
} {
  const output = runGit(root, [
    "ls-tree",
    "HEAD",
    "--",
    REFACTOR_BACKLOG_REPO_PATH,
  ]).trimEnd()
  const match = /^(\d{6}) blob ([0-9a-f]+)\t/u.exec(output)
  if (!match) {
    throw new Error(`Unable to find ${REFACTOR_BACKLOG_REPO_PATH} in HEAD.`)
  }
  return { mode: match[1], object: match[2] }
}

function runGit(root: string, args: readonly string[], input?: string): string {
  const result = spawnSync("git", args, {
    cwd: root,
    input,
    encoding: "utf8",
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(
      `git ${args[0]} failed: ${result.stderr.trim() || "unknown error"}`,
    )
  }
  return result.stdout
}

import { spawnSync } from "node:child_process"

import { normalizeRepoPath } from "./repo-paths.js"

export type TrackedPathProvider = (root: string) => readonly string[]

export type GitWorktreeStatus = {
  readonly dirtyPaths: readonly string[]
  readonly untrackedPaths: readonly string[]
}

export function readGitTrackedPaths(root: string): string[] {
  const result = spawnSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "buffer",
  })

  if (result.status !== 0) {
    const stderr = result.stderr.toString("utf8").trim()
    throw new Error(
      `Unable to read tracked files with git ls-files: ${stderr || "unknown error"}`,
    )
  }

  return result.stdout
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .map(normalizeRepoPath)
    .sort()
}

export function readGitWorktreeStatus(root: string): GitWorktreeStatus {
  const result = spawnSync(
    "git",
    ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
    {
      cwd: root,
      encoding: "buffer",
    },
  )

  if (result.status !== 0) {
    const stderr = result.stderr.toString("utf8").trim()
    throw new Error(
      `Unable to read worktree status with git status: ${stderr || "unknown error"}`,
    )
  }

  return parseGitStatusOutput(result.stdout)
}

export function parseGitStatusOutput(
  output: Buffer | string,
): GitWorktreeStatus {
  const dirtyPaths = new Set<string>()
  const untrackedPaths = new Set<string>()
  const text = Buffer.isBuffer(output) ? output.toString("utf8") : output
  const entries = text.split("\0").filter(Boolean)

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]
    if (entry.length < 4) continue

    const status = entry.slice(0, 2)
    const filePath = normalizeRepoPath(entry.slice(3))
    if (status === "??") {
      untrackedPaths.add(filePath)
      continue
    }
    if (status === "!!") continue

    dirtyPaths.add(filePath)

    if (status.includes("R") || status.includes("C")) {
      index += 1
    }
  }

  return {
    dirtyPaths: [...dirtyPaths].sort(),
    untrackedPaths: [...untrackedPaths].sort(),
  }
}

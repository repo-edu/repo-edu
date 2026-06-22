import { spawnSync } from "node:child_process"

import { normalizeRepoPath } from "./repo-paths.js"

export type TrackedPathProvider = (root: string) => readonly string[]

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

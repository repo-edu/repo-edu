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

export type GitCommit = {
  readonly hash: string
  readonly parents: readonly string[]
  readonly subject: string
  readonly changedPaths: readonly string[]
}

export function readRecentCommits(root: string, count: number): GitCommit[] {
  const result = spawnSync(
    "git",
    [
      "log",
      `-${count}`,
      "--find-renames",
      "--name-only",
      "-z",
      "--format=%x1e%H%x00%P%x00%s",
    ],
    {
      cwd: root,
      encoding: "buffer",
    },
  )

  if (result.status !== 0) {
    const stderr = result.stderr.toString("utf8").trim()
    throw new Error(
      `Unable to read git history for redesign-density: ${
        stderr || "unknown error"
      }`,
    )
  }

  return parseGitLog(result.stdout.toString("utf8"))
}

export function parseGitLog(output: string): GitCommit[] {
  return output
    .split("\x1e")
    .filter((record) => record.length > 0)
    .map((record) => {
      const fields = record.split("\0")
      const [hash = "", parents = "", subject = "", ...changedPaths] = fields
      return {
        hash,
        parents: parents.split(" ").filter(Boolean),
        subject,
        changedPaths: changedPaths.filter(Boolean).map(normalizeRepoPath),
      }
    })
    .filter((commit) => commit.hash.length > 0)
}

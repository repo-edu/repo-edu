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
      "--name-status",
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
      const [hash = "", parents = "", subject = "", ...changedPathEntries] =
        fields
      return {
        hash,
        parents: parents.split(" ").filter(Boolean),
        subject,
        changedPaths: parseChangedPaths(changedPathEntries),
      }
    })
    .filter((commit) => commit.hash.length > 0)
}

function parseChangedPaths(entries: readonly string[]): string[] {
  const changedPaths: string[] = []
  for (let index = 0; index < entries.length; ) {
    const status = entries[index]
    index += 1
    if (!status) continue

    if (/^[CR]\d+/.test(status)) {
      const destination = entries[index + 1]
      index += 2
      if (destination) changedPaths.push(normalizeRepoPath(destination))
      continue
    }

    const filePath = entries[index]
    index += 1
    if (filePath) changedPaths.push(normalizeRepoPath(filePath))
  }
  return changedPaths
}

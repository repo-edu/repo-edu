import type { GitCommandPort } from "@repo-edu/host-runtime-contract"
import type {
  PatchFile,
  PatchFileStatus,
} from "@repo-edu/integrations-git-contract"

function stripCredentials(url: string): string {
  const parsed = new URL(url)
  parsed.username = ""
  parsed.password = ""
  return parsed.toString()
}

function isMissingRemoteHeadError(stderr: string, stdout: string): boolean {
  const text = `${stderr}\n${stdout}`.toLowerCase()
  return (
    text.includes("couldn't find remote ref head") ||
    text.includes("could not find remote ref head")
  )
}

export async function isGitRepositoryPath(
  gitCommand: GitCommandPort,
  path: string,
  signal?: AbortSignal,
): Promise<boolean> {
  const result = await gitCommand.run({
    args: ["-C", path, "rev-parse", "--is-inside-work-tree"],
    signal,
  })
  return result.exitCode === 0
}

export async function resolveGitRepositoryRoot(
  gitCommand: GitCommandPort,
  path: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const result = await gitCommand.run({
    args: ["-C", path, "rev-parse", "--show-toplevel"],
    signal,
  })
  if (result.exitCode !== 0) return null
  const root = result.stdout.trim()
  return root.length > 0 ? root : null
}

export async function initPullClone(
  gitCommand: GitCommandPort,
  authUrl: string,
  destPath: string,
  signal?: AbortSignal,
): Promise<boolean> {
  const init = await gitCommand.run({
    args: ["init", destPath],
    signal,
  })
  if (init.exitCode !== 0) return false

  const pull = await gitCommand.run({
    args: ["pull", authUrl],
    cwd: destPath,
    signal,
  })
  if (
    pull.exitCode !== 0 &&
    !isMissingRemoteHeadError(pull.stderr, pull.stdout)
  ) {
    return false
  }

  const cleanUrl = stripCredentials(authUrl)
  const addRemote = await gitCommand.run({
    args: ["remote", "add", "origin", cleanUrl],
    cwd: destPath,
    signal,
  })
  return addRemote.exitCode === 0
}

export async function pushTemplateToRepo(
  gitCommand: GitCommandPort,
  templateLocalPath: string,
  authUrl: string,
  defaultBranch: string,
  signal?: AbortSignal,
): Promise<boolean> {
  const result = await gitCommand.run({
    args: ["push", authUrl, `HEAD:refs/heads/${defaultBranch}`, "--force"],
    cwd: templateLocalPath,
    signal,
  })
  return result.exitCode === 0
}

export async function resolveLocalTemplateSha(
  gitCommand: GitCommandPort,
  templatePath: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const result = await gitCommand.run({
    args: ["rev-parse", "HEAD"],
    cwd: templatePath,
    signal,
  })
  return result.exitCode === 0 ? result.stdout.trim() : null
}

export async function resolveLocalDefaultBranch(
  gitCommand: GitCommandPort,
  templatePath: string,
  signal?: AbortSignal,
): Promise<string> {
  const result = await gitCommand.run({
    args: ["rev-parse", "--abbrev-ref", "HEAD"],
    cwd: templatePath,
    signal,
  })
  return result.exitCode === 0 ? result.stdout.trim() : "main"
}

export async function cloneRemoteTemplateToTmpdir(
  gitCommand: GitCommandPort,
  authUrl: string,
  destPath: string,
  signal?: AbortSignal,
): Promise<boolean> {
  const result = await gitCommand.run({
    args: ["clone", "--single-branch", authUrl, destPath],
    signal,
  })
  return result.exitCode === 0
}

function parseGitDiffNameStatus(
  output: string,
): { status: PatchFileStatus; path: string; previousPath: string | null }[] {
  const entries: {
    status: PatchFileStatus
    path: string
    previousPath: string | null
  }[] = []

  for (const line of output.split("\n")) {
    const trimmed = line.trim()
    if (trimmed.length === 0) continue

    const statusChar = trimmed[0]
    const rest = trimmed.slice(1).trim()

    if (statusChar === "R") {
      const parts = rest.split("\t")
      entries.push({
        status: "renamed",
        path: parts[1] ?? parts[0],
        previousPath: parts[0],
      })
    } else {
      const path = rest.split("\t")[0] ?? rest
      let status: PatchFileStatus
      if (statusChar === "A") status = "added"
      else if (statusChar === "D") status = "removed"
      else status = "modified"
      entries.push({ status, path, previousPath: null })
    }
  }

  return entries
}

export async function computeLocalTemplateDiff(
  gitCommand: GitCommandPort,
  templatePath: string,
  fromSha: string,
  toSha: string,
  signal?: AbortSignal,
): Promise<PatchFile[]> {
  const nameStatus = await gitCommand.run({
    args: ["diff", "--name-status", `${fromSha}..${toSha}`],
    cwd: templatePath,
    signal,
  })

  if (nameStatus.exitCode !== 0) {
    return []
  }

  const entries = parseGitDiffNameStatus(nameStatus.stdout)
  const files: PatchFile[] = []

  for (const entry of entries) {
    let contentBase64: string | null = null

    if (entry.status !== "removed") {
      const show = await gitCommand.run({
        args: ["show", `${toSha}:${entry.path}`],
        cwd: templatePath,
        signal,
      })
      if (show.exitCode === 0) {
        contentBase64 = Buffer.from(show.stdout).toString("base64")
      }
    }

    files.push({
      path: entry.path,
      previousPath: entry.previousPath,
      status: entry.status,
      contentBase64,
    })
  }

  return files
}

export async function mapConcurrent<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  limit: number,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0

  async function worker() {
    while (next < items.length) {
      const index = next++
      results[index] = await fn(items[index])
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () =>
    worker(),
  )
  await Promise.all(workers)
  return results
}

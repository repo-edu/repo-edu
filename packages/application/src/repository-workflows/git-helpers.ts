import { CommandOutcomeError } from "@repo-edu/application-contract"
import type {
  GitCommandPort,
  ProcessResult,
} from "@repo-edu/host-runtime-contract"
import type {
  PatchFile,
  PatchFileStatus,
} from "@repo-edu/integrations-git-contract"
import { commandRefusal } from "../command-outcomes.js"

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

type NameStatusEntry = Omit<PatchFile, "contentBase64">

// `-z` leaves paths unquoted and ends every field with NUL. A rename or copy
// status carries a similarity score and is followed by both paths.
function parseGitDiffNameStatus(output: string): NameStatusEntry[] {
  const fields = output.split("\0")
  const entries: NameStatusEntry[] = []
  let index = 0

  while (index < fields.length && fields[index] !== "") {
    const statusChar = fields[index][0]
    if (statusChar === "R" || statusChar === "C") {
      const previousPath = fields[index + 1]
      const path = fields[index + 2]
      entries.push(
        statusChar === "R"
          ? { status: "renamed", path, previousPath }
          : { status: "added", path, previousPath: null },
      )
      index += 3
      continue
    }

    let status: PatchFileStatus
    if (statusChar === "A") status = "added"
    else if (statusChar === "D") status = "removed"
    else status = "modified"
    entries.push({ status, path: fields[index + 1], previousPath: null })
    index += 2
  }

  return entries
}

function gitFailureDetail(result: ProcessResult): string {
  return (
    result.stderr.trim() ||
    `Git exited with ${result.exitCode ?? result.signal}.`
  )
}

/** The update reads the template before it writes any repository, so a Git
 * failure here refuses the command instead of dropping changed files. */
export async function computeLocalTemplateDiff(
  gitCommand: GitCommandPort,
  templatePath: string,
  fromSha: string,
  toSha: string,
  signal?: AbortSignal,
): Promise<PatchFile[]> {
  const nameStatus = await gitCommand.run({
    args: ["diff", "--name-status", "-z", `${fromSha}..${toSha}`],
    cwd: templatePath,
    signal,
  })
  if (nameStatus.exitCode !== 0) {
    throw commandRefusal({
      type: "effect",
      message: `Template changes from ${fromSha.slice(0, 7)} to ${toSha.slice(0, 7)} could not be listed in '${templatePath}': ${gitFailureDetail(nameStatus)}`,
    })
  }

  const files: PatchFile[] = []
  for (const entry of parseGitDiffNameStatus(nameStatus.stdout)) {
    if (entry.status === "removed") {
      files.push({ ...entry, contentBase64: null })
      continue
    }
    const show = await gitCommand.run({
      args: ["show", `${toSha}:${entry.path}`],
      cwd: templatePath,
      signal,
    })
    if (show.exitCode !== 0) {
      throw commandRefusal({
        type: "effect",
        message: `Template file '${entry.path}' could not be read in '${templatePath}': ${gitFailureDetail(show)}`,
      })
    }
    files.push({
      ...entry,
      contentBase64: Buffer.from(show.stdout).toString("base64"),
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
      try {
        results[index] = await fn(items[index])
      } catch (error) {
        next = items.length
        throw error
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () =>
    worker(),
  )
  const endings = await Promise.allSettled(workers)
  const failures = endings.flatMap((ending) =>
    ending.status === "rejected" ? [ending.reason as unknown] : [],
  )
  // Every started effect must have proof. One stop cannot hide a sibling's loss.
  const terminal = failures.findIndex(
    (error) =>
      !(error instanceof CommandOutcomeError) ||
      (error.outcome.disposition === "uncertain" &&
        error.outcome.reason === "proof-lost"),
  )
  if (terminal !== -1) throw failures[terminal]
  const unknown = failures.find(
    (error) =>
      error instanceof CommandOutcomeError &&
      error.outcome.disposition === "uncertain",
  )
  if (unknown !== undefined) throw unknown
  if (failures.length > 0) throw failures[0]
  return results
}

import { CommandOutcomeError } from "@repo-edu/application-contract"
import type {
  GitCommandPort,
  GitCommandRequest,
} from "@repo-edu/host-runtime-contract"
import type {
  PatchFile,
  PatchFileStatus,
} from "@repo-edu/integrations-git-contract"
import { commandRefusal } from "../command-outcomes.js"

/** Only a completed exit 0 yields output; every other answer carries Git's
 * own reason, so no caller can read a failure as a value. */
export type GitRunResult =
  | { readonly ok: true; readonly stdout: string }
  | { readonly ok: false; readonly detail: string }

/** Every local Git command runs here. A read changes nothing outside the app,
 * so its lost result is a failed run. A write that loses its result stays
 * unknown, and confirmation expiry stays unknown for both. */
async function runGit(
  gitCommand: GitCommandPort,
  effect: "read" | "write",
  request: GitCommandRequest,
): Promise<GitRunResult> {
  let result: Awaited<ReturnType<GitCommandPort["run"]>>
  try {
    result = await gitCommand.run(request)
  } catch (error) {
    if (
      effect === "read" &&
      error instanceof CommandOutcomeError &&
      error.outcome.disposition === "uncertain" &&
      error.outcome.reason === "proof-lost"
    ) {
      return {
        ok: false,
        detail: `git ${request.args[0]} lost its result: ${error.message}`,
      }
    }
    throw error
  }
  if (result.exitCode === 0) return { ok: true, stdout: result.stdout }
  return {
    ok: false,
    detail:
      result.stderr.trim() ||
      `git ${request.args[0]} exited with ${result.exitCode ?? result.signal}.`,
  }
}

function stripCredentials(url: string): string {
  const parsed = new URL(url)
  parsed.username = ""
  parsed.password = ""
  return parsed.toString()
}

function isMissingRemoteHead(detail: string): boolean {
  const text = detail.toLowerCase()
  return (
    text.includes("couldn't find remote ref head") ||
    text.includes("could not find remote ref head")
  )
}

/** A failed probe means the path is not a readable work tree. */
export async function isGitRepositoryPath(
  gitCommand: GitCommandPort,
  path: string,
  signal?: AbortSignal,
): Promise<boolean> {
  const result = await runGit(gitCommand, "read", {
    args: ["-C", path, "rev-parse", "--is-inside-work-tree"],
    signal,
  })
  return result.ok
}

/** A failed probe means the path is not inside a readable work tree. */
export async function resolveGitRepositoryRoot(
  gitCommand: GitCommandPort,
  path: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const result = await runGit(gitCommand, "read", {
    args: ["-C", path, "rev-parse", "--show-toplevel"],
    signal,
  })
  if (!result.ok) return null
  const root = result.stdout.trim()
  return root.length > 0 ? root : null
}

/** An empty remote has no HEAD to pull, which still yields an empty clone. */
export async function initPullClone(
  gitCommand: GitCommandPort,
  authUrl: string,
  destPath: string,
  signal?: AbortSignal,
): Promise<GitRunResult> {
  const init = await runGit(gitCommand, "write", {
    args: ["init", destPath],
    signal,
  })
  if (!init.ok) return init

  const pull = await runGit(gitCommand, "write", {
    args: ["pull", authUrl],
    cwd: destPath,
    signal,
  })
  if (!pull.ok && !isMissingRemoteHead(pull.detail)) return pull

  return runGit(gitCommand, "write", {
    args: ["remote", "add", "origin", stripCredentials(authUrl)],
    cwd: destPath,
    signal,
  })
}

export async function pushTemplateToRepo(
  gitCommand: GitCommandPort,
  templateLocalPath: string,
  authUrl: string,
  template: LocalTemplateHead,
  signal?: AbortSignal,
): Promise<GitRunResult> {
  return runGit(gitCommand, "write", {
    args: [
      "push",
      authUrl,
      `${template.sha}:refs/heads/${template.branchName}`,
      "--force",
    ],
    cwd: templateLocalPath,
    signal,
  })
}

export async function resolveLocalTemplateSha(
  gitCommand: GitCommandPort,
  templatePath: string,
  signal?: AbortSignal,
): Promise<GitRunResult> {
  const result = await runGit(gitCommand, "read", {
    args: ["rev-parse", "HEAD"],
    cwd: templatePath,
    signal,
  })
  if (!result.ok) return result
  const sha = result.stdout.trim()
  return sha === ""
    ? { ok: false, detail: "git rev-parse answered no commit." }
    : { ok: true, stdout: sha }
}

export type LocalTemplateHead = {
  readonly sha: string
  readonly branchName: string
}

/** The pushed commit and the stored template commit are the same value, read
 * once before any push. A detached HEAD has no branch to push to. */
export async function resolveLocalTemplateHead(
  gitCommand: GitCommandPort,
  templatePath: string,
  signal?: AbortSignal,
): Promise<
  | { readonly ok: true; readonly head: LocalTemplateHead }
  | { readonly ok: false; readonly detail: string }
> {
  const sha = await resolveLocalTemplateSha(gitCommand, templatePath, signal)
  if (!sha.ok) return sha
  const branch = await runGit(gitCommand, "read", {
    args: ["symbolic-ref", "--short", "HEAD"],
    cwd: templatePath,
    signal,
  })
  if (!branch.ok) return branch
  const branchName = branch.stdout.trim()
  if (branchName === "") {
    return { ok: false, detail: "git symbolic-ref answered no branch." }
  }
  return { ok: true, head: { sha: sha.stdout, branchName } }
}

export async function cloneRemoteTemplateToTmpdir(
  gitCommand: GitCommandPort,
  authUrl: string,
  destPath: string,
  signal?: AbortSignal,
): Promise<GitRunResult> {
  return runGit(gitCommand, "write", {
    args: ["clone", "--single-branch", authUrl, destPath],
    signal,
  })
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

/** The update reads the template before it writes any repository, so a Git
 * failure here refuses the command instead of dropping changed files. File
 * content is read as base64 so binary files reach the branch intact. */
export async function computeLocalTemplateDiff(
  gitCommand: GitCommandPort,
  templatePath: string,
  fromSha: string,
  toSha: string,
  signal?: AbortSignal,
): Promise<PatchFile[]> {
  const nameStatus = await runGit(gitCommand, "read", {
    args: ["diff", "--name-status", "-z", `${fromSha}..${toSha}`],
    cwd: templatePath,
    signal,
  })
  if (!nameStatus.ok) {
    throw commandRefusal({
      type: "effect",
      message: `Template changes from ${fromSha.slice(0, 7)} to ${toSha.slice(0, 7)} could not be listed in '${templatePath}': ${nameStatus.detail}`,
    })
  }

  const files: PatchFile[] = []
  for (const entry of parseGitDiffNameStatus(nameStatus.stdout)) {
    if (entry.status === "removed") {
      files.push({ ...entry, contentBase64: null })
      continue
    }
    const show = await runGit(gitCommand, "read", {
      args: ["show", `${toSha}:${entry.path}`],
      cwd: templatePath,
      stdoutEncoding: "base64",
      signal,
    })
    if (!show.ok) {
      throw commandRefusal({
        type: "effect",
        message: `Template file '${entry.path}' could not be read in '${templatePath}': ${show.detail}`,
      })
    }
    files.push({ ...entry, contentBase64: show.stdout })
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

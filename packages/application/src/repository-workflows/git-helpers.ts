import { CommandOutcomeError } from "@repo-edu/application-contract"
import type {
  GitCommandPort,
  ProcessOutputEncoding,
} from "@repo-edu/host-runtime-contract"
import type {
  PatchFile,
  PatchFileStatus,
} from "@repo-edu/integrations-git-contract"
import { commandRefusal, commandValidationError } from "../command-outcomes.js"

/** Only a completed exit 0 yields output; every other answer carries Git's
 * own reason, so no caller can read a failure as a value. */
export type GitRunResult =
  | { readonly ok: true; readonly stdout: string }
  | { readonly ok: false; readonly detail: string }

type GitRun = {
  readonly args: readonly string[]
  /** The folder Git works in. Git receives it as `-C`, so a missing folder is
   * Git's own reason instead of a failed start. */
  readonly folder?: string
  readonly stdoutEncoding?: ProcessOutputEncoding
  readonly signal?: AbortSignal
}

/** Every local Git command runs here. A read changes nothing outside the app,
 * so its lost result is a failed run. A write that loses its result stays
 * unknown, and confirmation expiry stays unknown for both. */
async function runGit(
  gitCommand: GitCommandPort,
  effect: "read" | "write",
  run: GitRun,
): Promise<GitRunResult> {
  const args =
    run.folder === undefined ? [...run.args] : ["-C", run.folder, ...run.args]
  let result: Awaited<ReturnType<GitCommandPort["run"]>>
  try {
    result = await gitCommand.run({
      args,
      stdoutEncoding: run.stdoutEncoding,
      signal: run.signal,
    })
  } catch (error) {
    if (
      effect === "read" &&
      error instanceof CommandOutcomeError &&
      error.outcome.disposition === "uncertain" &&
      error.outcome.reason === "proof-lost"
    ) {
      return {
        ok: false,
        detail: `git ${run.args[0]} lost its result: ${error.message}`,
      }
    }
    throw error
  }
  if (result.exitCode === 0) return { ok: true, stdout: result.stdout }
  return {
    ok: false,
    detail:
      result.stderr.trim() ||
      `git ${run.args[0]} exited with ${result.exitCode ?? result.signal}.`,
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

/** A folder holds an existing repository only at the top of its own work
 * tree. A folder inside another repository's work tree holds none. */
export async function checkRepositoryFolder(
  gitCommand: GitCommandPort,
  path: string,
  signal?: AbortSignal,
): Promise<
  { readonly ok: true } | { readonly ok: false; readonly detail: string }
> {
  const result = await runGit(gitCommand, "read", {
    args: ["rev-parse", "--is-inside-work-tree", "--show-prefix"],
    folder: path,
    signal,
  })
  if (!result.ok) return result
  const [insideWorkTree, prefix] = result.stdout.split(/\r?\n/)
  if (insideWorkTree !== "true") {
    return { ok: false, detail: "Git finds no work tree there." }
  }
  if (prefix !== "") {
    return {
      ok: false,
      detail: `Git reads it as folder '${prefix}' of an enclosing repository.`,
    }
  }
  return { ok: true }
}

/** A failed probe means the path is not inside a readable work tree. */
export async function resolveGitRepositoryRoot(
  gitCommand: GitCommandPort,
  path: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const result = await runGit(gitCommand, "read", {
    args: ["rev-parse", "--show-toplevel"],
    folder: path,
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
    folder: destPath,
    signal,
  })
  if (!pull.ok && !isMissingRemoteHead(pull.detail)) return pull

  return runGit(gitCommand, "write", {
    args: ["remote", "add", "origin", stripCredentials(authUrl)],
    folder: destPath,
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
    folder: templateLocalPath,
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
    folder: templatePath,
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
    folder: templatePath,
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

type TemplateChange = {
  readonly file: Omit<PatchFile, "contentBase64">
  readonly modes: readonly [before: string, after: string]
  readonly blob: string
}

// `git diff-tree -r -z` ends every field with NUL and leaves paths unquoted. A
// header reads `:<old mode> <new mode> <old blob> <new blob> <status>`. A
// rename status carries a score and is followed by both paths. Without `-C`
// and outside a merge, Git lists no other status.
const changeHeader = /^:(\d{6}) (\d{6}) [0-9a-f]+ ([0-9a-f]+) ([ADMRT])\d*$/
const changeStatus: Record<string, PatchFileStatus> = {
  A: "added",
  D: "removed",
  M: "modified",
  R: "renamed",
  T: "modified",
}

function parseTemplateChanges(output: string): TemplateChange[] | null {
  const fields = output.split("\0")
  const changes: TemplateChange[] = []
  let index = 0
  while (index < fields.length && fields[index] !== "") {
    const header = changeHeader.exec(fields[index])
    if (header === null) return null
    const [, before, after, blob, letter] = header
    const status = changeStatus[letter]
    const renamed = status === "renamed"
    const path = fields[index + (renamed ? 2 : 1)]
    if (path === undefined || path === "") return null
    changes.push({
      file: { status, path, previousPath: renamed ? fields[index + 1] : null },
      modes: [before, after],
      blob,
    })
    index += renamed ? 3 : 2
  }
  return changes
}

/** The kind of a side Git does not record as a plain file. An absent side
 * reads `000000`, and every plain file mode starts with `100`. */
function nonPlainKind(mode: string): string | null {
  if (mode === "000000" || mode.startsWith("100")) return null
  if (mode === "120000") return "symbolic link"
  if (mode === "160000") return "submodule"
  return `entry of mode ${mode}`
}

/** The update reads the template before it writes any repository, so a Git
 * failure here refuses the command instead of dropping changed files. Every
 * file mode is read before any content, and a changed symbolic link or
 * submodule refuses the whole update, because a template update carries plain
 * files only. File content is read as base64 so binary files reach the branch
 * intact. */
export async function computeLocalTemplateDiff(
  gitCommand: GitCommandPort,
  templatePath: string,
  fromSha: string,
  toSha: string,
  signal?: AbortSignal,
): Promise<PatchFile[]> {
  const range = `${fromSha.slice(0, 7)} to ${toSha.slice(0, 7)}`
  const listed = await runGit(gitCommand, "read", {
    args: ["diff-tree", "-r", "-z", "-M", fromSha, toSha],
    folder: templatePath,
    signal,
  })
  if (!listed.ok) {
    throw commandRefusal({
      type: "effect",
      message: `Template changes from ${range} could not be listed in '${templatePath}': ${listed.detail}`,
    })
  }
  const changes = parseTemplateChanges(listed.stdout)
  if (changes === null) {
    throw commandRefusal({
      type: "effect",
      message: `Git listed the template changes from ${range} in a form the update cannot read.`,
    })
  }

  const nonPlain = changes.flatMap((change) => {
    const kind = nonPlainKind(change.modes[1]) ?? nonPlainKind(change.modes[0])
    return kind === null
      ? []
      : [
          {
            path: "template",
            message: `Changed template entry '${change.file.path}' is a ${kind}.`,
          },
        ]
  })
  if (nonPlain.length > 0) {
    throw commandValidationError(
      `Template changes from ${range} include entries that are not plain files, and a template update carries plain files only.`,
      nonPlain,
    )
  }

  const files: PatchFile[] = []
  for (const { file, blob } of changes) {
    if (file.status === "removed") {
      files.push({ ...file, contentBase64: null })
      continue
    }
    const content = await runGit(gitCommand, "read", {
      args: ["cat-file", "blob", blob],
      folder: templatePath,
      stdoutEncoding: "base64",
      signal,
    })
    if (!content.ok) {
      throw commandRefusal({
        type: "effect",
        message: `Template file '${file.path}' could not be read in '${templatePath}': ${content.detail}`,
      })
    }
    files.push({ ...file, contentBase64: content.stdout })
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

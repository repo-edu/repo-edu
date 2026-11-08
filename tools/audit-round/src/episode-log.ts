import { execa } from "execa"

/**
 * The six-character display form used by reports and file names. Durable
 * deferral citations keep the full commit ID instead.
 */
export function shortSha(sha: string): string {
  return sha.slice(0, 6)
}

/** Git history is newest first. Both paths of a rename are touched files. */
export type LogCommit = {
  readonly sha: string
  readonly committedAt: string
  readonly subject: string
  readonly body: string
  readonly files: readonly string[]
  readonly renames: readonly { readonly from: string; readonly to: string }[]
}

export type CommitEvidence = Pick<
  LogCommit,
  "sha" | "committedAt" | "subject" | "body"
>

/** Read exact commits even when they are outside the current HEAD's ancestry. */
export async function readCommitEvidence(
  cwd: string,
  shas: readonly string[],
): Promise<CommitEvidence[]> {
  return Promise.all(
    shas.map(async (sha) => {
      const { stdout } = await execa(
        "git",
        ["show", "-s", "--format=%H%x00%cI%x00%s%x00%b", sha],
        { cwd },
      )
      const [resolved, committedAt, subject, body] = stdout.split("\0")
      if (
        resolved === undefined ||
        committedAt === undefined ||
        subject === undefined ||
        body === undefined
      )
        throw new Error(`Git returned an incomplete header for ${sha}`)
      return { sha: resolved, committedAt, subject, body }
    }),
  )
}

/** Git supplies rename detection and NUL-delimited paths, including unusual names. */
export async function readLog(cwd: string): Promise<LogCommit[]> {
  const { stdout } = await execa(
    "git",
    [
      "log",
      "--format=%x00%H%x00%cI%x00%s%x00%b",
      "--name-status",
      "-z",
      "--find-renames",
      "--diff-merges=first-parent",
    ],
    { cwd, maxBuffer: 256 * 1024 * 1024, stripFinalNewline: false },
  )
  const fields = stdout.split("\0")
  const commits: LogCommit[] = []
  let at = 0
  while (at < fields.length - 1) {
    at += 1 // The empty field before each commit's header.
    const sha = fields[at++]
    const committedAt = fields[at++]
    const subject = fields[at++]
    const body = fields[at++]
    const files: string[] = []
    const renames: { from: string; to: string }[] = []
    while (at < fields.length && fields[at] !== "") {
      const status = fields[at++].trimStart()
      const from = fields[at++]
      files.push(from)
      if (status.startsWith("R") || status.startsWith("C")) {
        const to = fields[at++]
        files.push(to)
        if (status.startsWith("R")) renames.push({ from, to })
      }
    }
    commits.push({
      sha,
      committedAt,
      subject,
      body,
      files: [...new Set(files)],
      renames,
    })
  }
  return commits
}

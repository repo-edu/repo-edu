import { execa } from "execa"
import { errorMessage } from "./feedback.js"

/** What one evidence commit did. */
export type EvidenceCommit =
  | { readonly status: "committed"; readonly sha: string }
  | { readonly status: "unchanged" }
  | { readonly status: "failed"; readonly reason: string }

/**
 * Commit every uncommitted file in the evidence checkout under one plain
 * subject, so a round file is in Git within one command of being written and
 * an overwritten or deleted file can be restored. The commit carries no
 * capability tag or model record and runs no hook, because nothing reads the
 * evidence log as a trajectory. A checkout with nothing to commit gets no
 * commit. A failure is returned rather than thrown: the files stay in place
 * and the next commit takes them, so the command's own result stands.
 */
export async function commitEvidence(
  evidenceRoot: string,
  subject: string,
): Promise<EvidenceCommit> {
  try {
    await execa("git", ["add", "--all"], { cwd: evidenceRoot })
    const staged = await execa("git", ["diff", "--cached", "--quiet"], {
      cwd: evidenceRoot,
      reject: false,
    })
    if (staged.exitCode === 0) return { status: "unchanged" }
    if (staged.exitCode !== 1)
      throw new Error(staged.stderr || `git diff exited ${staged.exitCode}`)
    await execa(
      "git",
      ["-c", "core.hooksPath=/dev/null", "commit", "--quiet", "-m", subject],
      { cwd: evidenceRoot },
    )
    const { stdout } = await execa("git", ["rev-parse", "HEAD"], {
      cwd: evidenceRoot,
    })
    return { status: "committed", sha: stdout }
  } catch (error) {
    return { status: "failed", reason: errorMessage(error) }
  }
}

/** The one line a failed evidence commit prints, which leaves the command's result as it was. */
export function evidenceFailureText(
  commit: Extract<EvidenceCommit, { status: "failed" }>,
): string {
  return `Warning: the evidence commit failed; the next command that writes a round file commits these files. ${commit.reason}`
}

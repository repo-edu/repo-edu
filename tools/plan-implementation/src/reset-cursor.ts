import { realpath } from "node:fs/promises"
import { resolve } from "node:path"
import type { PlanSourceIdentity } from "./contracts.js"
import { readGitText, runGit } from "./git-command.js"
import { parseZeroSeparatedGitLog } from "./git-log.js"
import { readCommittedImplementationPlan } from "./plan-reader.js"
import { createCursorResetCommitMessage } from "./plan-record.js"
import { claimPlanImplementationRunnerAdmission } from "./runner-admission.js"

const singleCommitFormat = "format:%H%x00%s%x00%b%x00"

export type ResetPlanCursorRequest = {
  readonly repoEduRoot: string
  readonly planPath: string
  readonly nextStep: number
}

export type ResetPlanCursorResult = {
  readonly commitOid: string
  readonly source: PlanSourceIdentity
  readonly nextStep: number
}

export class ResetCursorError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = "ResetCursorError"
  }
}

async function resolveRepositoryRoot(startPath: string): Promise<string> {
  try {
    const root = await readGitText(startPath, ["rev-parse", "--show-toplevel"])
    return await realpath(resolve(root))
  } catch (error) {
    throw new ResetCursorError(
      "The reset action must run inside the Repo Edu Git checkout.",
      { cause: error },
    )
  }
}

async function requireCurrentBranch(repoEduRoot: string): Promise<void> {
  try {
    const branch = await readGitText(repoEduRoot, [
      "symbolic-ref",
      "--quiet",
      "--short",
      "HEAD",
    ])
    if (branch.length === 0) {
      throw new Error("Git returned an empty branch name.")
    }
  } catch (error) {
    throw new ResetCursorError(
      "The reset action requires a current branch, not a detached HEAD.",
      { cause: error },
    )
  }
}

async function requireCleanCheckout(repoEduRoot: string): Promise<void> {
  let status: Buffer
  try {
    status = (
      await runGit(repoEduRoot, [
        "status",
        "--porcelain=v1",
        "-z",
        "--untracked-files=all",
      ])
    ).stdout
  } catch (error) {
    throw new ResetCursorError("Git could not inspect the Repo Edu checkout.", {
      cause: error,
    })
  }
  if (status.length > 0) {
    throw new ResetCursorError(
      "The reset action requires no staged, unstaged or untracked files.",
    )
  }
}

async function requireUnchangedPlanSource(
  source: PlanSourceIdentity,
): Promise<void> {
  const current = await readCommittedImplementationPlan(source.planPath)
  if (
    current.source.planName !== source.planName ||
    current.source.planPath !== source.planPath ||
    current.source.blobOid !== source.blobOid
  ) {
    throw new ResetCursorError(
      "The committed plan source changed before the reset commit.",
    )
  }
}

async function commitCursorReset(
  repoEduRoot: string,
  source: PlanSourceIdentity,
  nextStep: number,
): Promise<string> {
  const message = createCursorResetCommitMessage(source, nextStep)
  try {
    await runGit(repoEduRoot, [
      "commit",
      "--allow-empty",
      "--message",
      message.subject,
      "--message",
      message.body,
    ])
    const history = parseZeroSeparatedGitLog(
      (
        await runGit(repoEduRoot, [
          "log",
          "-1",
          `--format=${singleCommitFormat}`,
        ])
      ).stdout,
    )
    if (
      history.length !== 1 ||
      history[0].subject !== message.subject ||
      history[0].body !== `${message.body}\n`
    ) {
      throw new ResetCursorError(
        "Git did not preserve the exact cursor-reset message.",
      )
    }
    const changedPaths = await readGitText(repoEduRoot, [
      "diff-tree",
      "--no-commit-id",
      "--name-only",
      "-r",
      "HEAD",
    ])
    if (changedPaths.length > 0) {
      throw new ResetCursorError("The cursor-reset commit is not empty.")
    }
    return history[0].commitOid
  } catch (error) {
    if (error instanceof ResetCursorError) {
      throw error
    }
    throw new ResetCursorError("Git could not write the cursor-reset commit.", {
      cause: error,
    })
  }
}

export async function resetPlanCursor(
  request: ResetPlanCursorRequest,
): Promise<ResetPlanCursorResult> {
  const repoEduRoot = await resolveRepositoryRoot(request.repoEduRoot)
  const plan = await readCommittedImplementationPlan(request.planPath)
  if (
    !Number.isSafeInteger(request.nextStep) ||
    request.nextStep < 1 ||
    request.nextStep > plan.steps.length + 1
  ) {
    throw new ResetCursorError(
      `The reset step must be from 1 through ${plan.steps.length + 1}.`,
    )
  }

  const admission = await claimPlanImplementationRunnerAdmission(repoEduRoot)
  if (admission.status === "busy") {
    throw new ResetCursorError(
      "Another plan implementation runner owns this checkout.",
    )
  }

  try {
    await requireCurrentBranch(repoEduRoot)
    await requireCleanCheckout(repoEduRoot)
    await requireUnchangedPlanSource(plan.source)
    await requireCleanCheckout(repoEduRoot)
    const commitOid = await commitCursorReset(
      repoEduRoot,
      plan.source,
      request.nextStep,
    )
    await requireCleanCheckout(repoEduRoot)
    return {
      commitOid,
      source: plan.source,
      nextStep: request.nextStep,
    }
  } finally {
    admission.release()
  }
}

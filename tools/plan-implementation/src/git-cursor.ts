import type { CommittedImplementationPlan } from "./contracts.js"
import { runGit } from "./git-command.js"
import { type GitCommitFields, parseZeroSeparatedGitLog } from "./git-log.js"
import { type PlanCommitRecord, parsePlanCommitRecord } from "./plan-record.js"

const historyFormat = "format:%H%x00%s%x00%b%x00"

type HistoryRecord = {
  readonly commitOid: string
  readonly record: PlanCommitRecord
}

export type ResolvedPlanCursor = {
  readonly nextStep: number
  readonly resetCommitOid: string | null
  readonly stepCommitOids: readonly string[]
}

export class GitCursorError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = "GitCursorError"
  }
}

function readHistoryRecords(
  commits: readonly GitCommitFields[],
): readonly HistoryRecord[] {
  return commits.flatMap((commit) => {
    const record = parsePlanCommitRecord(commit.subject, commit.body)
    return record ? [{ commitOid: commit.commitOid, record }] : []
  })
}

function validateTotalSteps(totalSteps: number): void {
  if (!Number.isSafeInteger(totalSteps) || totalSteps < 1) {
    throw new GitCursorError("The plan must contain at least one step.")
  }
}

export function resolvePlanCursorFromHistory(
  commits: readonly GitCommitFields[],
  plan: CommittedImplementationPlan,
): ResolvedPlanCursor {
  const totalSteps = plan.steps.length
  validateTotalSteps(totalSteps)
  const records = readHistoryRecords(commits).filter(
    ({ record }) => record.planName === plan.source.planName,
  )
  const newestResetIndex = records.findIndex(
    ({ record }) => record.kind === "cursor-reset",
  )
  const newestReset = newestResetIndex === -1 ? null : records[newestResetIndex]

  let nextStep = 1
  let newerRecords = records
  if (newestReset) {
    if (newestReset.record.kind !== "cursor-reset") {
      throw new GitCursorError("The newest reset has an invalid record kind.")
    }
    if (newestReset.record.sourceBlobOid !== plan.source.blobOid) {
      throw new GitCursorError(
        "The newest cursor reset names another plan source; reset the current source before continuing.",
      )
    }
    nextStep = newestReset.record.nextStep
    if (nextStep > totalSteps + 1) {
      throw new GitCursorError(
        "The newest cursor reset points beyond one past the final step.",
      )
    }
    newerRecords = records.slice(0, newestResetIndex)
  } else {
    const changedSource = records.some(
      ({ record }) =>
        record.kind === "step" && record.sourceBlobOid !== plan.source.blobOid,
    )
    if (changedSource) {
      throw new GitCursorError(
        "The plan source changed without a matching cursor reset.",
      )
    }
  }

  const stepCommitOids: string[] = []
  const chronologicalSteps = newerRecords
    .filter(
      (
        entry,
      ): entry is HistoryRecord & {
        readonly record: Extract<PlanCommitRecord, { readonly kind: "step" }>
      } => entry.record.kind === "step",
    )
    .reverse()
  for (const { commitOid, record } of chronologicalSteps) {
    if (record.sourceBlobOid !== plan.source.blobOid) {
      throw new GitCursorError(
        "A step after the cursor reset names another plan source.",
      )
    }
    if (record.step > totalSteps) {
      throw new GitCursorError(
        `The ledger records step ${record.step} beyond the final plan step.`,
      )
    }
    if (record.step !== nextStep) {
      throw new GitCursorError(
        `The plan ledger expected step ${nextStep} but found step ${record.step}.`,
      )
    }
    stepCommitOids.push(commitOid)
    nextStep += 1
  }

  return {
    nextStep,
    resetCommitOid: newestReset?.commitOid ?? null,
    stepCommitOids,
  }
}

export async function resolvePlanCursor(
  repoEduRoot: string,
  plan: CommittedImplementationPlan,
): Promise<ResolvedPlanCursor> {
  let output: Buffer
  try {
    output = (await runGit(repoEduRoot, ["log", `--format=${historyFormat}`]))
      .stdout
  } catch (error) {
    throw new GitCursorError("Git could not read the current branch history.", {
      cause: error,
    })
  }
  return resolvePlanCursorFromHistory(parseZeroSeparatedGitLog(output), plan)
}

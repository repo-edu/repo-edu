import { execa } from "execa"
import type { CommitStamps } from "./commit-msg.js"
import type { LandedCommit } from "./round-data.js"
import { parseSubject, type Repository } from "./subject.js"
import { type AuditTarget, planStem, type RoundContext } from "./target.js"

export type CleanInput = RoundContext &
  AuditTarget & {
    readonly report: string
    readonly judgedRepos: readonly Repository[]
  }

export type CleanCompletion = {
  readonly message: string
  readonly commits: readonly LandedCommit[]
}

/**
 * Record a report with no findings without starting another assistant. Keep
 * the report as evidence and leave handoffs untouched: no correction consumed
 * their reasoning. Commit audits have no plan record and keep the report alone.
 */
export async function completeClean(
  input: CleanInput,
  stamps: CommitStamps,
): Promise<CleanCompletion> {
  if ("commits" in input)
    return {
      message: `Clean audit. Report retained: ${input.report}`,
      commits: [],
    }

  const cwd =
    input.judgedRepos.length === 1
      ? input.judgedRepos[0] === "plan"
        ? input.planRoot
        : input.repoEduRoot
      : input.repoEduRoot
  if (stamps.auditor === null || stamps.phases === null)
    throw new Error(
      "The clean record needs the audit's model and capability tag",
    )
  const repository = cwd === input.planRoot ? "plan" : "repo-edu"
  const role =
    input.roundKind === "planning" ? "plan-audit" : `impl-audit-${input.scope}`
  const subject = `${planStem(input.plan)}/${role} ${stamps.auditor} clean: record audit with no findings`
  parseSubject(subject, repository)
  const body = `${stamps.phases}\n\nRound yield: 0 ordinary; 0 rare; 0 developer.\nStructure: 0 removing, 0 adding, 0 flat.`
  // --only with --allow-empty records HEAD's tree even when the user has
  // staged changes. Git still runs the normal hooks and signing configuration.
  await execa(
    "git",
    ["commit", "--only", "--allow-empty", "-m", subject, "-m", body],
    {
      cwd,
      env: { COMMIT_AUDITOR: stamps.auditor, COMMIT_PHASES: stamps.phases },
    },
  )
  const sha = (await execa("git", ["rev-parse", "HEAD"], { cwd })).stdout
  return {
    message: `Clean audit recorded. Report retained: ${input.report}`,
    commits: [{ repository, sha }],
  }
}

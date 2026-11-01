import type { CommitStamps } from "./commit-msg.js"
import { commitOnly } from "./lifecycle.js"
import type { OpenDeferral } from "./open-deferrals.js"
import type { LandedCommit } from "./round-data.js"
import { parseSubject, type Repository } from "./subject.js"
import { type AuditTarget, planStem, type RoundContext } from "./target.js"

export type CleanInput = RoundContext &
  AuditTarget & {
    readonly report: string
    readonly judgedRepos: readonly Repository[]
    /** The open deferrals this clean record must settle. */
    readonly deferrals?: readonly OpenDeferral[]
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
  if ("groups" in input)
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
  const citations = (input.deferrals ?? []).map(
    (deferral) =>
      `- [applies:${deferral.sha}/${deferral.position}] The plan stands.`,
  )
  const body = [stamps.phases, citations.join("\n")]
    .filter(Boolean)
    .join("\n\n")
  const { sha } = await commitOnly({ cwd, subject, body, stamps })
  return {
    message: `Clean audit recorded. Report retained: ${input.report}`,
    commits: [{ repository, sha }],
  }
}

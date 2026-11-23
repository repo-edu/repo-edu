import type { CommitStamps } from "./commit-msg.js"
import { commitOnly } from "./lifecycle.js"
import type { OpenDeferral } from "./open-deferrals.js"
import type { LandedCommit } from "./round-data.js"
import { targetLabel } from "./round-paths.js"
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
 * Record an audit report with no findings without starting another assistant.
 * Keep the audit report as evidence and leave handoffs untouched: no correction
 * consumed their reasoning. The one empty record lands in the sole judged repo,
 * or in Repo Edu when both were judged. A plan's record opens with its stem and
 * a commit audit's or a move-list round's with its series label, so the log
 * shows that the audit ran. A move-list audit judges the plan repo alone, so
 * its record lands there, beside its list.
 */
export async function completeClean(
  input: CleanInput,
  stamps: CommitStamps,
): Promise<CleanCompletion> {
  const repository: Repository =
    input.judgedRepos.length === 1 ? input.judgedRepos[0] : "repo-edu"
  const cwd = repository === "plan" ? input.planRoot : input.repoEduRoot
  if (stamps.auditor === null || stamps.phases === null)
    throw new Error(
      "The clean record needs the audit's model and capability tag",
    )
  const form =
    "groups" in input
      ? `${targetLabel(input)}/commit-audit`
      : "source" in input
        ? `${targetLabel(input)}/split-audit`
        : `${planStem(input.plan)}/${input.roundKind === "planning" ? "plan-audit" : `impl-audit-${input.scope}`}`
  const subject = `${form} ${stamps.auditor} clean: record audit with no findings`
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
    message: `Clean audit recorded. Audit report retained: ${input.report}`,
    commits: [{ repository, sha }],
  }
}

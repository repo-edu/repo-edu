import { dirname } from "node:path"
import { execa } from "execa"
import type { CommitStamps } from "./commit-msg.js"
import type { ExecutionContext } from "./context.js"
import { parseSubject } from "./subject.js"
import { type AuditTarget, planStem } from "./target.js"

export type CleanInput = ExecutionContext &
  AuditTarget & {
    readonly report: string
  }

/**
 * Record a report with no findings without starting another assistant. Keep
 * the report as evidence and leave handoffs untouched: no correction consumed
 * their reasoning. Commit audits have no plan record and keep the report alone.
 */
export async function completeClean(
  input: CleanInput,
  stamps: CommitStamps,
): Promise<string> {
  if ("commits" in input) return `Clean audit. Report retained: ${input.report}`

  const cwd = dirname(input.report)
  if (cwd !== input.repoEduRoot && cwd !== input.planRoot)
    throw new Error(
      "The clean report must belong to one of the judged repositories",
    )
  if (stamps.auditor === null || stamps.phases === null)
    throw new Error(
      "The clean record needs the audit's model and capability tag",
    )
  const repository = cwd === input.planRoot ? "plan" : "repo-edu"
  const role =
    input.roundKind === "planning"
      ? "audit"
      : `impl-audit-${input.scope ?? "all"}`
  const subject = `${planStem(input.plan)}/${role} ${stamps.auditor} clean: record audit with no findings`
  parseSubject(subject, repository)
  const body =
    repository === "repo-edu"
      ? `${stamps.phases}\n\nRound yield: 0 ordinary; 0 rare; 0 developer.\nStructure: 0 removing, 0 adding, 0 flat.`
      : stamps.phases
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
  return `Clean audit recorded. Report retained: ${input.report}`
}

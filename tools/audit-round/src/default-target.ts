import { InvalidArgumentError } from "commander"
import type { ExecutionContext } from "./context.js"
import { stemCommits } from "./episode.js"
import { type LogCommit, readLog } from "./episode-log.js"
import { errorMessage } from "./feedback.js"
import { parseSubject, type Repository, type Subject } from "./subject.js"
import { type AuditTarget, activePlan, auditTarget } from "./target.js"

/** Both histories at their current heads, which every omitted argument reads. */
async function readLogs(
  context: ExecutionContext,
): Promise<Record<Repository, LogCommit[]>> {
  const [plan, repoEdu] = await Promise.all([
    readLog(context.planRoot),
    readLog(context.repoEduRoot),
  ])
  return { plan, "repo-edu": repoEdu }
}

/** The plan an omitted stem names, for the plan brief as for an omitted target. */
export async function defaultPlan(context: ExecutionContext): Promise<string> {
  return (await newestPlan(await readLogs(context), context.planRoot)).path
}

export async function defaultTarget(
  context: ExecutionContext,
): Promise<AuditTarget> {
  return selectTarget(await readLogs(context), context.planRoot)
}

/**
 * Repeat the newest unfinished audit of the newest plan. Moving on to another
 * scope is the user's call, so any other newest commit stops with its reason.
 */
export async function selectTarget(
  logs: Readonly<Record<Repository, readonly LogCommit[]>>,
  planRoot: string,
): Promise<AuditTarget> {
  const { topic, commit, repository } = await newestPlan(logs, planRoot)
  return repeatedTarget(topic, readNewest(topic, commit, repository))
}

/** The active plan whose stem commit is newest in either history, with that commit. */
async function newestPlan(
  logs: Readonly<Record<Repository, readonly LogCommit[]>>,
  planRoot: string,
) {
  const inactive = new Set<string>()
  for (const { repository, commit, topic } of stemCommits(logs)) {
    if (inactive.has(topic)) continue
    const path = await activePlan(planRoot, topic)
    if (path !== null) return { repository, commit, topic, path }
    inactive.add(topic)
  }
  throw new InvalidArgumentError(
    "No active plan at the plan root has a stem commit. Name one.",
  )
}

function readNewest(
  topic: string,
  commit: LogCommit,
  repository: Repository,
): Subject {
  try {
    return parseSubject(commit.subject, repository)
  } catch (error) {
    throw new InvalidArgumentError(
      `The newest ${topic} commit ${commit.sha.slice(0, 8)} does not parse: ${errorMessage(error)}. Name a target.`,
    )
  }
}

function repeatedTarget(
  topic: string,
  { form, severity }: Subject,
): AuditTarget {
  // The `.md` keeps a commit-shaped stem a plan, as it does for a typed target.
  const plan = `${topic}.md`
  switch (form?.role) {
    case "init":
    case "audit":
    case "settle":
    case "ready":
      return auditTarget(plan, [])
    case "impl-audit":
      if (severity !== "clean" && form.scope !== null)
        return auditTarget(plan, [form.scope])
  }
  const reason =
    form?.role === "impl-audit"
      ? `its last audit of ${form.scope} was clean`
      : form?.role === "impl"
        ? `its newest commit lands step ${form.scope}`
        : `its newest commit is the ${form?.role} marker`
  throw new InvalidArgumentError(
    `No audit to repeat for ${topic}: ${reason}. Name a target, such as ${topic} <steps|all>.`,
  )
}

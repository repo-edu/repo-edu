import { InvalidArgumentError } from "commander"
import type { ExecutionContext } from "./context.js"
import { stemCommits } from "./episode.js"
import { type LogCommit, readLog } from "./episode-log.js"
import { errorMessage } from "./feedback.js"
import {
  looseForm,
  parseSubject,
  type Repository,
  stemTopic,
} from "./subject.js"
import {
  type AuditTarget,
  activePlan,
  planStem,
  resolvePlan,
  type TargetRequest,
} from "./target.js"

type Logs = Readonly<Record<Repository, readonly LogCommit[]>>
type StemCommit = ReturnType<typeof stemCommits>[number]

/** Both histories at their current heads, which every plan target reads. */
async function readLogs(context: ExecutionContext): Promise<Logs> {
  const [plan, repoEdu] = await Promise.all([
    readLog(context.planRoot),
    readLog(context.repoEduRoot),
  ])
  return { plan, "repo-edu": repoEdu }
}

/** The plan an omitted stem names, for the plan brief and close as for an omitted target. */
export async function defaultPlan(context: ExecutionContext): Promise<string> {
  return (await newestPlan(await readLogs(context), context.planRoot)).path
}

/** The audit a command line asks for, with no target meaning the newest plan. */
export async function resolveTarget(
  context: ExecutionContext,
  request: TargetRequest | null,
): Promise<AuditTarget> {
  if (request !== null && "commits" in request) return request
  return selectTarget(await readLogs(context), context.planRoot, request)
}

/**
 * A plan's own history decides what its name alone audits, so the shortest
 * command runs the audit the plan's state calls for. Moving on to another
 * scope is the user's call, so a plan between its steps stops with its reason.
 */
export async function selectTarget(
  logs: Logs,
  planRoot: string,
  request: { readonly plan: string; readonly scope: string | null } | null,
): Promise<AuditTarget> {
  const plan =
    request === null
      ? (await newestPlan(logs, planRoot)).path
      : await resolvePlan(planRoot, request.plan)
  const topic = stemTopic(planStem(plan))
  const history = stemCommits(logs).filter((entry) => entry.topic === topic)
  const { steps, unmarked } = progress(history)
  const implementation = (scope: string): AuditTarget => ({
    roundKind: "implementation",
    plan,
    scope,
  })
  if (request?.scope != null) {
    if (steps.length === 0)
      throw new InvalidArgumentError(
        `No step of ${topic} has landed, so it has no implementation to audit. Name the plan alone for a planning round.`,
      )
    return implementation(request.scope)
  }
  if (steps.length === 0) return { roundKind: "planning", plan }
  const unfinished = unfinishedScope(topic, history[0])
  if (unfinished !== null) return implementation(unfinished)
  if (unmarked.length === 0) return implementation("all")
  throw new InvalidArgumentError(
    `${topic} is still being implemented. Landed steps: ${steps.join(", ")}. The implemented marker is missing in ${unmarked.join(" and ")}. Name a step scope, such as ${topic} ${steps.at(-1)}.`,
  )
}

/**
 * The steps that have landed and the repos hosting one without its
 * `implemented` marker. Loose forms reach subjects older than the grammar.
 */
function progress(history: readonly StemCommit[]): {
  readonly steps: readonly number[]
  readonly unmarked: readonly string[]
} {
  const steps = new Set<number>()
  const hosts = new Set<Repository>()
  const marked = new Set<Repository>()
  for (const { repository, commit } of history) {
    const role = looseForm(commit.subject)?.role ?? ""
    const step = /^impl-([1-9]\d*)$/.exec(role)
    if (step !== null) {
      steps.add(Number(step[1]))
      hosts.add(repository)
    }
    if (role === "implemented") marked.add(repository)
  }
  return {
    steps: [...steps].sort((first, second) => first - second),
    unmarked: [...hosts]
      .filter((repository) => !marked.has(repository))
      .map((repository) =>
        repository === "repo-edu" ? "Repo Edu" : "the plan repo",
      ),
  }
}

/** The scope of a newest implementation-audit record that was not clean. */
function unfinishedScope(topic: string, newest: StemCommit): string | null {
  if (!looseForm(newest.commit.subject)?.role.startsWith("impl-audit-"))
    return null
  let subject: ReturnType<typeof parseSubject>
  try {
    subject = parseSubject(newest.commit.subject, newest.repository)
  } catch (error) {
    throw new InvalidArgumentError(
      `The newest ${topic} commit ${newest.commit.sha.slice(0, 8)} does not parse: ${errorMessage(error)}. Name a step scope.`,
    )
  }
  return subject.severity === "clean" ? null : (subject.form?.scope ?? null)
}

/** The active plan whose stem commit is newest in either history. */
async function newestPlan(logs: Logs, planRoot: string) {
  const inactive = new Set<string>()
  for (const { topic } of stemCommits(logs)) {
    if (inactive.has(topic)) continue
    const path = await activePlan(planRoot, topic)
    if (path !== null) return { topic, path }
    inactive.add(topic)
  }
  throw new InvalidArgumentError(
    "No active plan at the plan root has a stem commit. Name one.",
  )
}

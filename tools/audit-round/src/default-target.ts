import { readFile } from "node:fs/promises"
import { InvalidArgumentError } from "commander"
import type { ExecutionContext } from "./context.js"
import { stemCommits } from "./episode.js"
import { type LogCommit, readLog } from "./episode-log.js"
import { type PlanStep, readPlanSteps } from "./plan-steps.js"
import { looseForm, type Repository } from "./subject.js"
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
  const topic = planStem(plan)
  const history = stemCommits(logs).filter((entry) => entry.topic === topic)
  const listedSteps = readPlanSteps(await readFile(plan, "utf8"))
  const status = progress(history, listedSteps)
  const implementation = (scope: string): AuditTarget => ({
    roundKind: "implementation",
    plan,
    scope,
  })
  if (request?.scope != null) {
    if (status.landed.length === 0)
      throw new InvalidArgumentError(
        `No step of ${topic} has landed, so it has no implementation to audit. Name the plan alone for a planning round.`,
      )
    return implementation(request.scope)
  }
  if (status.landed.length === 0) return { roundKind: "planning", plan }
  if (
    status.repositories.every(
      ({ pending, marker }) => pending.length === 0 && marker === "current",
    )
  ) {
    const last = listedSteps.length
    return implementation(last === 1 ? "1" : `1-${last}`)
  }
  const pending = status.repositories.flatMap(({ name, pending }) =>
    pending.length === 0
      ? []
      : [`Pending steps in ${name}: ${pending.join(", ")}.`],
  )
  const markers = status.repositories.flatMap(({ name, marker }) =>
    marker === "current"
      ? []
      : [
          `The implemented marker is ${marker === "missing" ? "missing" : "stale"} in ${name}.`,
        ],
  )
  throw new InvalidArgumentError(
    `${topic} is still being implemented. ${[...pending, ...markers].join(" ")} Name a step scope, such as ${topic} ${status.landed.at(-1)}.`,
  )
}

type MarkerStatus = "current" | "missing" | "stale"

/** Listed-step completion and marker freshness in each hosting repository. */
function progress(
  history: readonly StemCommit[],
  listedSteps: readonly PlanStep[],
): {
  readonly landed: readonly number[]
  readonly repositories: readonly {
    readonly name: string
    readonly pending: readonly number[]
    readonly marker: MarkerStatus
  }[]
} {
  const repositoryOrder = ["repo-edu", "plan"] as const
  const expected = new Map<Repository, Set<number>>()
  for (const step of listedSteps)
    for (const repository of step.repositories) {
      const steps = expected.get(repository) ?? new Set<number>()
      steps.add(step.number)
      expected.set(repository, steps)
    }
  const landed = new Map<Repository, Set<number>>()
  const newestStep = new Map<Repository, number>()
  const newestMarker = new Map<Repository, number>()
  history.forEach(({ repository, commit }, index) => {
    const role = looseForm(commit.subject)?.role ?? ""
    const step = /^impl-([1-9]\d*)$/.exec(role)
    const number = step === null ? null : Number(step[1])
    if (number !== null && expected.get(repository)?.has(number)) {
      const steps = landed.get(repository) ?? new Set<number>()
      steps.add(number)
      landed.set(repository, steps)
      if (!newestStep.has(repository)) newestStep.set(repository, index)
    }
    if (role === "implemented" && !newestMarker.has(repository))
      newestMarker.set(repository, index)
  })
  const repositories = repositoryOrder.flatMap((repository) => {
    const hosted = expected.get(repository)
    if (hosted === undefined) return []
    const completed = landed.get(repository) ?? new Set<number>()
    const markerIndex = newestMarker.get(repository)
    const stepIndex = newestStep.get(repository)
    const marker: MarkerStatus =
      markerIndex === undefined
        ? "missing"
        : stepIndex !== undefined && markerIndex > stepIndex
          ? "stale"
          : "current"
    return [
      {
        name: repository === "repo-edu" ? "Repo Edu" : "the plan repo",
        pending: [...hosted].filter((step) => !completed.has(step)),
        marker,
      },
    ]
  })
  return {
    landed: [
      ...new Set([...landed.values()].flatMap((steps) => [...steps])),
    ].sort((first, second) => first - second),
    repositories,
  }
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

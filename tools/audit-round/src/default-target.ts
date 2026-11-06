import { readFile } from "node:fs/promises"
import { InvalidArgumentError } from "commander"
import { execa } from "execa"
import type { ExecutionContext, PlanRoots } from "./context.js"
import { stemCommits } from "./episode.js"
import { type LogCommit, readLog, shortSha } from "./episode-log.js"
import { type PlanStep, readAuditRanges, readPlanSteps } from "./plan-steps.js"
import { looseForm, type Repository } from "./subject.js"
import {
  type AuditTarget,
  activePlan,
  type CommitGroup,
  type CommitGroupRequest,
  headOffset,
  planningScope,
  planPhase,
  planStem,
  resolvePlan,
  type ScopeRequest,
  type TargetRequest,
  unprefixedCommitReference,
} from "./target.js"

/** The targets one command line runs in order; a scope list gives several. */
export type AuditTargets = readonly [AuditTarget, ...AuditTarget[]]

export type ImplementationLogs = Readonly<
  Record<Repository, readonly LogCommit[]>
>

/** Both histories at their current heads, which every plan target reads. */
export async function readImplementationLogs(
  context: ExecutionContext,
): Promise<ImplementationLogs> {
  const [plan, repoEdu] = await Promise.all([
    readLog(context.planRoot),
    readLog(context.repoEduRoot),
  ])
  return { plan, "repo-edu": repoEdu }
}

/** The plan an omitted stem names, for the plan brief and close as for an omitted target. */
export async function defaultPlan(context: ExecutionContext): Promise<string> {
  return (
    await newestPlan(await readImplementationLogs(context), context.activeRoot)
  ).path
}

/** The audits a command line asks for, with no target meaning the newest plan. */
export async function resolveTargets(
  context: ExecutionContext,
  request: TargetRequest | null,
): Promise<AuditTargets> {
  if (request !== null && "groups" in request) {
    const groups = await Promise.all(
      request.groups.map((group) =>
        resolveCommitGroup(
          group,
          group.repository === "plan" ? context.planRoot : context.repoEduRoot,
        ),
      ),
    )
    return [
      {
        ...request,
        groups: groups as [CommitGroup, ...CommitGroup[]],
      },
    ]
  }
  return selectTargets(await readImplementationLogs(context), context, request)
}

/**
 * A group's starting HEAD is captured once, and every typed reference is
 * resolved against it, so the filename names the commits the round judges
 * even when the repo moves before the audit starts. A reference that names no
 * commit is refused here, before any round file is claimed.
 */
async function resolveCommitGroup(
  group: CommitGroupRequest,
  cwd: string,
): Promise<CommitGroup> {
  const startingHead = shortSha(
    (await execa("git", ["rev-parse", "HEAD"], { cwd })).stdout,
  )
  const fullCommit = async (endpoint: string): Promise<string> => {
    const offset = headOffset(endpoint)
    const revision = offset === null ? endpoint : `${startingHead}~${offset}`
    const resolved = await execa(
      "git",
      ["rev-parse", "--verify", "--quiet", `${revision}^{commit}`],
      { cwd, reject: false },
    )
    if (resolved.exitCode !== 0)
      throw new InvalidArgumentError(
        `${endpoint} names no commit in the ${group.repository} checkout.`,
      )
    return resolved.stdout
  }
  const resolvedReferences = await Promise.all(
    group.references.map(async (reference) =>
      Promise.all(
        unprefixedCommitReference(reference).split("..").map(fullCommit),
      ),
    ),
  )
  const shortReferences = resolvedReferences.map((reference) =>
    reference.map(shortSha).join(".."),
  )
  const commits =
    resolvedReferences.length === 1 && resolvedReferences[0].length === 2
      ? await inclusiveRange(
          cwd,
          resolvedReferences[0][0],
          resolvedReferences[0][1],
        )
      : await orderedCommits(cwd, resolvedReferences.flat())
  return {
    ...group,
    startingHead,
    commits: commits as [string, ...string[]],
    shortReferences: shortReferences as [string, ...string[]],
  }
}

/** Expand an inclusive ancestry range in repository order. */
async function inclusiveRange(
  cwd: string,
  first: string,
  last: string,
): Promise<string[]> {
  const ancestry = await execa(
    "git",
    ["merge-base", "--is-ancestor", first, last],
    { cwd, reject: false },
  )
  if (ancestry.exitCode !== 0)
    throw new InvalidArgumentError(
      `${shortSha(first)}..${shortSha(last)} is not an increasing ancestry range.`,
    )
  const afterFirst = await execa(
    "git",
    ["rev-list", "--reverse", "--ancestry-path", `${first}..${last}`],
    { cwd },
  )
  return [first, ...afterFirst.stdout.split("\n").filter(Boolean)]
}

/** Put an exact commit list in repository order, independent of typed order. */
async function orderedCommits(
  cwd: string,
  commits: readonly string[],
): Promise<string[]> {
  if (commits.length === 1) return [...commits]
  const wanted = new Set(commits)
  const ordered = (
    await execa("git", ["rev-list", "--reverse", "--topo-order", ...commits], {
      cwd,
    })
  ).stdout
    .split("\n")
    .filter((commit) => wanted.has(commit))
  if (ordered.length !== wanted.size)
    throw new Error("Git did not return every resolved commit in the group")
  return ordered
}

/**
 * A plan's own history decides what its name alone audits, so the shortest
 * command runs the audit the plan's state calls for. The planning word names
 * the planning round whatever has landed, because a bare name stops selecting
 * it once a step lands. Moving on to another scope is the user's call, so a
 * plan between its steps stops with its reason. Named step scopes each become
 * one target, in the order given, once any step has landed.
 */
export async function selectTargets(
  logs: ImplementationLogs,
  roots: PlanRoots,
  request: {
    readonly plan: string
    readonly scope: ScopeRequest | null
  } | null,
): Promise<AuditTargets> {
  const plan =
    request === null
      ? (await newestPlan(logs, roots.activeRoot)).path
      : await resolvePlan(roots, request.plan)
  const topic = planStem(plan)
  const implementation = (scope: string): AuditTarget => ({
    roundKind: "implementation",
    plan,
    scope,
  })
  if (request?.scope === planningScope) return [{ roundKind: "planning", plan }]
  if (!hasLandedStep(logs, topic)) {
    if (request?.scope != null)
      throw new InvalidArgumentError(
        `No step of ${topic} has landed, so it has no implementation to audit. Name the plan alone for a planning round.`,
      )
    return [{ roundKind: "planning", plan }]
  }
  if (request?.scope != null) {
    const [first, ...more] = request.scope
    return [implementation(first), ...more.map(implementation)]
  }
  const source = await readFile(plan, "utf8")
  const listedSteps = readPlanSteps(source)
  const status = implementationProgress(logs, topic, listedSteps)
  if (implementationComplete(status)) {
    const last = listedSteps.length
    const fullRange = last === 1 ? "1" : `1-${last}`
    const ranges = readAuditRanges(source, last)
    if (ranges.length === 1) return [implementation(fullRange)]
    return [
      implementation(ranges[0]),
      ...ranges.slice(1).map(implementation),
      implementation(fullRange),
    ]
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
  const example = status.landed.at(-1)
  const scopeHint =
    example === undefined
      ? "Name a step scope."
      : `Name a step scope, such as ${topic} ${example}.`
  throw new InvalidArgumentError(
    `${topic} is still being implemented. ${[...pending, ...markers].join(" ")} ${scopeHint}`,
  )
}

/**
 * The lifecycle stage an active plan's state calls for, which the run starts
 * at. The filename names widening, a settled plan without a ready record is
 * detailing, and the ready plan's per-repo progress separates implementation
 * from the audit range series, so no run file keeps a second copy of it.
 */
export type LifecycleStage = "widening" | "detailing" | "implement" | "ranges"

export async function lifecycleStage(
  context: ExecutionContext,
  plan: string,
): Promise<LifecycleStage> {
  if (planPhase(plan) === "widening") return "widening"
  const topic = planStem(plan)
  const logs = await readImplementationLogs(context)
  const ready = logs.plan.some((commit) => {
    const form = looseForm(commit.subject)
    return form?.stem === topic && form.role === "ready"
  })
  if (!ready) return "detailing"
  const steps = readPlanSteps(await readFile(plan, "utf8"))
  return implementationComplete(implementationProgress(logs, topic, steps))
    ? "ranges"
    : "implement"
}

/** Every hosted share has landed and each repo's marker follows its newest step. */
function implementationComplete(status: ImplementationProgress): boolean {
  return status.repositories.every(
    ({ pending, marker }) => pending.length === 0 && marker === "current",
  )
}

/** Whether either repository holds an implementation step for this plan. */
function hasLandedStep(logs: ImplementationLogs, topic: string): boolean {
  return Object.values(logs).some((commits) =>
    commits.some((commit) => {
      const form = looseForm(commit.subject)
      return form?.stem === topic && /^impl-[1-9]\d*$/.test(form.role)
    }),
  )
}

export type MarkerStatus = "current" | "missing" | "stale"

export type RepositoryProgress = {
  readonly repository: Repository
  readonly name: string
  readonly pending: readonly number[]
  readonly marker: MarkerStatus
}

export type ImplementationProgress = {
  readonly landed: readonly number[]
  readonly repositories: readonly RepositoryProgress[]
}

/** Listed-step completion and marker freshness in each hosting repository. */
export function implementationProgress(
  logs: ImplementationLogs,
  topic: string,
  listedSteps: readonly PlanStep[],
): ImplementationProgress {
  const repositoryOrder = ["repo-edu", "plan"] as const
  const expected = new Map<Repository, Set<number>>()
  for (const step of listedSteps)
    for (const repository of step.repositories) {
      const steps = expected.get(repository) ?? new Set<number>()
      steps.add(step.number)
      expected.set(repository, steps)
    }
  const landed = new Set<number>()
  const repositories = repositoryOrder.flatMap((repository) => {
    const hosted = expected.get(repository)
    if (hosted === undefined) return []
    const completed = new Set<number>()
    let stepIndex: number | undefined
    let markerIndex: number | undefined
    logs[repository]
      .flatMap((commit) => {
        const form = looseForm(commit.subject)
        return form?.stem === topic ? [form.role] : []
      })
      .forEach((role, index) => {
        const step = /^impl-([1-9]\d*)$/.exec(role)
        const number = step === null ? null : Number(step[1])
        if (number !== null && hosted.has(number)) {
          completed.add(number)
          landed.add(number)
          if (stepIndex === undefined) stepIndex = index
        }
        if (role === "implemented" && markerIndex === undefined)
          markerIndex = index
      })
    const marker: MarkerStatus =
      markerIndex === undefined
        ? "missing"
        : stepIndex !== undefined && markerIndex > stepIndex
          ? "stale"
          : "current"
    return [
      {
        repository,
        name: repository === "repo-edu" ? "Repo Edu" : "the plan repo",
        pending: [...hosted].filter((step) => !completed.has(step)),
        marker,
      },
    ]
  })
  return {
    landed: [...landed].sort((first, second) => first - second),
    repositories,
  }
}

/** The active plan whose stem commit is newest in either history. */
async function newestPlan(logs: ImplementationLogs, activeRoot: string) {
  const inactive = new Set<string>()
  for (const { topic } of stemCommits(logs)) {
    if (inactive.has(topic)) continue
    const path = await activePlan(activeRoot, topic)
    if (path !== null) return { topic, path }
    inactive.add(topic)
  }
  throw new InvalidArgumentError(
    "No active plan in the active folder has a stem commit. Name one.",
  )
}

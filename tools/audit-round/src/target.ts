import { readdir, stat } from "node:fs/promises"
import { basename, dirname, join, resolve } from "node:path"
import { InvalidArgumentError } from "commander"
import type { ExecutionContext } from "./context.js"
import type { Repository } from "./subject.js"

export type RoundKind = "planning" | "implementation"
export type RoundContext = ExecutionContext & {
  readonly roundKind: RoundKind
  readonly cwd: string
}

export function roundContext(
  context: ExecutionContext,
  roundKind: RoundKind,
): RoundContext {
  return {
    ...context,
    roundKind,
    cwd: roundKind === "planning" ? context.planRoot : context.repoEduRoot,
  }
}

type CommitTarget = {
  readonly roundKind: "implementation"
  readonly repository: Repository
  readonly commits: readonly [string, ...string[]]
}

/** One scope owner for argument validation, phase routing and run presentation. */
export type AuditTarget =
  | { readonly roundKind: "planning"; readonly plan: string }
  | {
      readonly roundKind: "implementation"
      readonly plan: string
      readonly scope: string
    }
  | CommitTarget

/**
 * What a command line names. Commits are a complete target; a plan's round
 * waits for its history, which `default-target.ts` reads.
 */
export type TargetRequest =
  | CommitTarget
  | { readonly plan: string; readonly scope: string | null }

/** Active and archived plan paths share one identity for files and records. */
export function planStem(plan: string): string {
  return (
    basename(plan) === "plan.md"
      ? basename(dirname(plan))
      : basename(plan, ".md")
  ).replace(/-widen$/, "")
}

/** An active plan sits directly at the plan root; archived plans sit below it. */
export function isActivePlanPath(planRoot: string, plan: string): boolean {
  return dirname(resolve(planRoot, plan)) === resolve(planRoot)
}

function stepScope(value: string): string {
  if (value === "all") return value
  const match = /^([1-9]\d*)(?:-([1-9]\d*))?$/.exec(value)
  if (match === null)
    throw new InvalidArgumentError(
      "Use all, a positive step number or an increasing range, such as 2-4.",
    )
  const first = Number(match[1])
  const last = Number(match[2] ?? match[1])
  if (
    !Number.isSafeInteger(first) ||
    !Number.isSafeInteger(last) ||
    last < first
  )
    throw new InvalidArgumentError(
      "The step range must use safe positive integers in increasing order.",
    )
  return value
}

function commitReference(value: string): boolean {
  if (/^[a-fA-F0-9]{4,40}$/.test(value)) return true
  const head = /^HEAD(?:-(0|[1-9]\d*))?$/.exec(value)
  return head !== null && Number.isSafeInteger(Number(head[1] ?? 0))
}

export const planRepositoryPrefix = "plan@"

function unprefixedCommitReference(value: string): string {
  return value.startsWith(planRepositoryPrefix)
    ? value.slice(planRepositoryPrefix.length)
    : value
}

/**
 * A reference attempt is judged as commits, so a malformed `HEAD-<n>` or
 * range is refused as one, and a plan whose bare stem reads as a SHA keeps its
 * `.md` to be told apart.
 */
export function commitShaped(value: string): boolean {
  const reference = unprefixedCommitReference(value)
  return (
    !reference.endsWith(".md") &&
    (reference.includes("..") ||
      reference.startsWith("HEAD") ||
      /^[a-fA-F0-9]+$/.test(reference))
  )
}

/** A plan argument names a stem, never a path. */
function refusePath(value: string): void {
  if (/[\\/]/.test(value))
    throw new InvalidArgumentError(
      `Name the plan by its stem, such as ${planStem(value.replaceAll("\\", "/"))}, without a path.`,
    )
}

/** Git resolution and inclusive-range admission belong to the audit workflow. */
export function targetRequest(
  first: string,
  rest: readonly string[],
): TargetRequest {
  refusePath(first)
  if (rest.some((reference) => reference.startsWith(planRepositoryPrefix)))
    throw new InvalidArgumentError(
      "Use plan@ only on the first commit reference.",
    )
  const repository: Repository = first.startsWith(planRepositoryPrefix)
    ? "plan"
    : "repo-edu"
  if (repository === "repo-edu" && !commitShaped(first)) {
    if (rest.length > 1)
      throw new InvalidArgumentError("A plan accepts at most one step scope.")
    return {
      plan: planStem(first),
      scope: rest[0] === undefined ? null : stepScope(rest[0]),
    }
  }
  const commits: [string, ...string[]] = [first, ...rest]
  const references = [unprefixedCommitReference(first), ...rest]
  const endpoints = references[0].split("..")
  if (
    references.every(commitReference) ||
    (rest.length === 0 &&
      endpoints.length === 2 &&
      endpoints.every(commitReference))
  )
    return { commits, repository, roundKind: "implementation" }
  throw new InvalidArgumentError(
    "Name a plan, a SHA, HEAD, HEAD-<n>, a list of commit references or an inclusive <from>..<to> range.",
  )
}

/** The plan's artifact at the plan root, or null once it is archived or absent. */
export async function activePlan(
  planRoot: string,
  stem: string,
): Promise<string | null> {
  for (const name of [`${stem}.md`, `${stem}-widen.md`]) {
    const path = join(planRoot, name)
    try {
      if ((await stat(path)).isFile()) return path
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    }
  }
  return null
}

/** Resolve one plan identity, preferring the active artifact over its archive. */
export async function resolvePlan(
  planRoot: string,
  stem: string,
): Promise<string> {
  const active = await activePlan(planRoot, stem)
  if (active !== null) return active
  const archive = join(planRoot, "archive")
  let files: string[]
  try {
    files = await readdir(archive, { recursive: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    files = []
  }
  const matches = []
  for (const file of files) {
    const path = join(archive, file)
    if (
      path.endsWith(".md") &&
      planStem(path) === stem &&
      (await stat(path)).isFile()
    )
      matches.push(path)
  }
  if (matches.length === 1) return matches[0]
  if (matches.length > 1)
    throw new Error(
      `Several archived plans have the stem ${stem}:\n${matches.sort().join("\n")}`,
    )
  throw new Error(`No plan named ${stem} at ${planRoot} or in its archive.`)
}

/** Resolve the active plan a lifecycle command names. */
export async function requiredActivePlan(
  planRoot: string,
  value: string,
  command: "close" | "ready" | "settle",
): Promise<string> {
  refusePath(value)
  const stem = planStem(value)
  const plan = await activePlan(planRoot, stem)
  if (plan === null) {
    const reason =
      command === "close"
        ? "An archived plan is already closed."
        : `The ${command} command requires an active plan.`
    throw new Error(`No active plan named ${stem} at ${planRoot}. ${reason}`)
  }
  return plan
}

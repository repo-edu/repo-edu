import { readdir, stat } from "node:fs/promises"
import { basename, dirname, join } from "node:path"
import { InvalidArgumentError } from "commander"
import type { ExecutionContext } from "./context.js"

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

/** One scope owner for argument validation, phase routing and run presentation. */
export type AuditTarget =
  | { readonly roundKind: "planning"; readonly plan: string }
  | {
      readonly roundKind: "implementation"
      readonly plan: string
      readonly scope: string
    }
  | {
      readonly roundKind: "implementation"
      readonly commits: readonly [string, ...string[]]
    }

/** Active and archived plan paths share one identity for files and records. */
export function planStem(plan: string): string {
  return (
    basename(plan) === "plan.md"
      ? basename(dirname(plan))
      : basename(plan, ".md")
  ).replace(/-widen$/, "")
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

/**
 * A reference attempt is judged as commits, so a malformed `HEAD-<n>` or
 * range is refused as one, and a plan whose bare stem reads as a SHA keeps its
 * `.md` to be told apart.
 */
export function commitShaped(value: string): boolean {
  return (
    !value.endsWith(".md") &&
    (value.includes("..") ||
      value.startsWith("HEAD") ||
      /^[a-fA-F0-9]+$/.test(value))
  )
}

/** Git resolution and inclusive-range admission belong to the audit workflow. */
export function auditTarget(
  first: string,
  rest: readonly string[],
): AuditTarget {
  if (/[\\/]/.test(first))
    throw new InvalidArgumentError(
      `Name the plan by its stem, such as ${planStem(first.replaceAll("\\", "/"))}, without a path.`,
    )
  if (!commitShaped(first)) {
    if (rest.length > 1)
      throw new InvalidArgumentError("A plan accepts at most one step scope.")
    const plan = planStem(first)
    return rest[0] === undefined
      ? { roundKind: "planning", plan }
      : { roundKind: "implementation", plan, scope: stepScope(rest[0]) }
  }
  const commits: [string, ...string[]] = [first, ...rest]
  const endpoints = first.split("..")
  if (
    commits.every(commitReference) ||
    (rest.length === 0 &&
      endpoints.length === 2 &&
      endpoints.every(commitReference))
  )
    return { commits, roundKind: "implementation" }
  throw new InvalidArgumentError(
    "Name a plan, a SHA, HEAD, HEAD-<n>, a list of commit references or an inclusive <from>..<to> range.",
  )
}

/** Resolve one plan identity, preferring the active artifact over its archive. */
export async function resolvePlan(
  planRoot: string,
  stem: string,
): Promise<string> {
  for (const name of [`${stem}.md`, `${stem}-widen.md`]) {
    const path = join(planRoot, name)
    try {
      if ((await stat(path)).isFile()) return path
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    }
  }
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

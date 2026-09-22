import { basename, dirname } from "node:path"
import { InvalidArgumentError } from "commander"
import type { RoundKind } from "./context.js"

/** One scope owner for argument validation, phase routing and run presentation. */
export type AuditTarget =
  | { readonly plan: string; readonly scope?: string }
  | { readonly commits: readonly [string, ...string[]] }

/** Active and archived plan paths share one identity for files and records. */
export function planStem(plan: string): string {
  return (
    basename(plan) === "plan.md"
      ? basename(dirname(plan))
      : basename(plan, ".md")
  ).replace(/-widen$/, "")
}

function stepScope(value: string): string {
  const match = /^([1-9]\d*)(?:-([1-9]\d*))?$/.exec(value)
  if (match === null)
    throw new InvalidArgumentError(
      "Use a positive step number or an increasing range, such as 2-4.",
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
 * `.md` to be told apart. A path separator marks a plan, so `../plan/<stem>`
 * never reads as a range.
 */
function commitShaped(value: string): boolean {
  return (
    !value.includes("/") &&
    (value.includes("..") ||
      value.startsWith("HEAD") ||
      /^[a-fA-F0-9]+$/.test(value))
  )
}

/** A plan is named by its Markdown file; a bare stem gets the extension. */
function planFile(value: string): string {
  return value.endsWith(".md") ? value : `${value}.md`
}

/** Git resolution and inclusive-range admission belong to the audit workflow. */
export function auditTarget(
  first: string,
  rest: readonly string[],
  kind: RoundKind = "implementation",
): AuditTarget {
  if (kind === "planning") {
    if (commitShaped(first) || rest.length > 0)
      throw new InvalidArgumentError(
        "From the plan root, name only a plan artifact. Implementation and commit audits run from Repo Edu.",
      )
    return { plan: planFile(first) }
  }
  if (!commitShaped(first)) {
    if (rest.length > 1)
      throw new InvalidArgumentError("A plan accepts at most one step scope.")
    return {
      plan: planFile(first),
      scope: rest[0] === undefined ? undefined : stepScope(rest[0]),
    }
  }
  const commits: [string, ...string[]] = [first, ...rest]
  const endpoints = first.split("..")
  if (
    commits.every(commitReference) ||
    (rest.length === 0 &&
      endpoints.length === 2 &&
      endpoints.every(commitReference))
  )
    return { commits }
  throw new InvalidArgumentError(
    "Name a plan, a SHA, HEAD, HEAD-<n>, a list of commit references or an inclusive <from>..<to> range.",
  )
}

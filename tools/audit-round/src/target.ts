import { InvalidArgumentError } from "commander"
import type { RoundKind } from "./context.js"

/** One scope owner for argument validation, phase routing and run presentation. */
export type AuditTarget =
  | { readonly plan: string; readonly scope?: string }
  | { readonly commits: readonly [string, ...string[]] }

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

/** Git resolution and inclusive-range admission belong to the audit workflow. */
export function auditTarget(
  first: string,
  rest: readonly string[],
  kind: RoundKind = "implementation",
): AuditTarget {
  if (kind === "planning") {
    if (!first.endsWith(".md") || rest.length > 0)
      throw new InvalidArgumentError(
        "From the plan root, name only a .md artifact. Implementation and commit audits run from Repo Edu.",
      )
    return { plan: first }
  }
  if (first.endsWith(".md")) {
    if (rest.length > 1)
      throw new InvalidArgumentError("A plan accepts at most one step scope.")
    return {
      plan: first,
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
    "Name a .md plan, a SHA, HEAD, HEAD-<n>, a list of commit references or an inclusive <from>..<to> range.",
  )
}

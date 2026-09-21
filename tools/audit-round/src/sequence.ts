import type { Finding } from "./findings.js"
import {
  looseForm,
  type Repository,
  type Run,
  type Severity,
  SubjectError,
} from "./subject.js"

/** Reduce graded bullets to the sequence's two sorted runs. */
export function findingSequence(
  findings: readonly Finding[],
  repository: Repository,
): Severity {
  if (findings.length === 0) return "clean"
  const upper: Run[] = []
  const lower: Run[] = []
  for (const tier of ["a", "b", "c", "d"] as const) {
    const atTier = findings.filter((finding) => finding.tier === tier)
    const developer =
      repository === "plan"
        ? 0
        : atTier.filter((finding) => finding.reach === "developer").length
    if (atTier.length > developer)
      upper.push({ tier, count: atTier.length - developer })
    if (developer > 0) lower.push({ tier, count: developer })
  }
  return {
    ordinary:
      repository === "repo-edu" &&
      findings.some((finding) => finding.reach === "ordinary"),
    upper,
    lower,
  }
}

export function printSequence(sequence: Severity): string {
  if (sequence === "clean") return sequence
  return (
    (sequence.ordinary ? "!" : "") +
    sequence.upper
      .map(({ tier, count }) => `${tier.toUpperCase()}${count}`)
      .join("") +
    sequence.lower.map(({ tier, count }) => `${tier}${count}`).join("")
  )
}

/**
 * Fill only the severity slot before full subject validation. The role, repo
 * and presence of a kind decide whether this class takes findings or clean.
 * Everything outside the derived slot remains subject to parseSubject.
 */
export function stampSequence(
  line: string,
  findings: readonly Finding[],
  repository: Repository,
): string {
  const tokens = line.split(" ")
  const colon = tokens.findIndex((token) => token.endsWith(":"))
  if (colon === -1)
    throw new SubjectError("the subject needs a colon after its last tag")
  const tags = tokens.slice(0, colon + 1)
  tags[colon] = tags[colon].slice(0, -1)
  const form = looseForm(line)
  let slot = form === null ? 1 : 2
  if (/^(growth|pruning)-(low|medium|high)$/.test(tags[slot] ?? "")) slot += 1
  if (/^(?:clean|!?(?:[A-Da-d]\d+)+)$/.test(tags[slot] ?? ""))
    tags.splice(slot, 1)
  const sequence = findingSequence(findings, repository)
  const audit = form?.role === "audit" || form?.role.startsWith("impl-audit-")
  const hasKind = tags
    .slice(slot)
    .some((token) => /^[a-z]+\([a-z0-9-]+\)$/.test(token))
  if (audit || form === null) {
    if (sequence !== "clean") tags.splice(slot, 0, printSequence(sequence))
    else if (form?.role === "audit" || (audit && !hasKind))
      tags.splice(slot, 0, "clean")
    else if (audit || repository === "repo-edu")
      throw new SubjectError(
        "a fix or off-plan Repo Edu commit needs at least one graded finding bullet",
      )
  } else if (sequence !== "clean") {
    throw new SubjectError(
      `the ${form.role} class carries no severity and refuses graded finding bullets`,
    )
  }
  return `${tags.join(" ")}: ${tokens.slice(colon + 1).join(" ")}`
}

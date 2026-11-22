import type { Finding } from "./findings.js"
import {
  isAuditRole,
  locateSubjectSlots,
  looseRole,
  type Repository,
  type Run,
  type Severity,
  SubjectError,
} from "./subject.js"

/**
 * Reduce graded bullets to the sequence's two sorted runs. A letter is upper
 * case when an end user meets the harm, and the leading `!` marks an end-user
 * harm that needs no special condition.
 */
export function findingSequence(findings: readonly Finding[]): Severity {
  if (findings.length === 0) return "clean"
  const upper: Run[] = []
  const lower: Run[] = []
  for (const tier of ["a", "b", "c", "d"] as const) {
    const atTier = findings.filter((finding) => finding.tier === tier)
    const developer = atTier.filter(
      (finding) => finding.reach === "developer",
    ).length
    if (atTier.length > developer)
      upper.push({ tier, count: atTier.length - developer })
    if (developer > 0) lower.push({ tier, count: developer })
  }
  return {
    ordinary: findings.some(
      (finding) =>
        finding.reach === "end-user" && finding.rarity === "ordinary",
    ),
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
 * and presence of a kind decide whether this class takes findings or clean. A
 * commit audit's record takes them as a plan's audit record does. Everything
 * outside the derived slot remains subject to parseSubject.
 */
export function stampSequence(
  line: string,
  findings: readonly Finding[],
  repository: Repository,
): string {
  const {
    tags,
    sentence,
    severity: slot,
    hasSeverity,
    kind,
  } = locateSubjectSlots(line)
  const role = looseRole(line)
  if (hasSeverity) tags.splice(slot, 1)
  const sequence = findingSequence(findings)
  const audit = isAuditRole(role ?? "")
  const hasKind = kind !== null
  if (audit || role === null) {
    if (sequence !== "clean") tags.splice(slot, 0, printSequence(sequence))
    else if (role === "plan-audit" || (audit && !hasKind))
      tags.splice(slot, 0, "clean")
    else if (audit || repository === "repo-edu")
      throw new SubjectError(
        "a fix or off-plan Repo Edu commit needs at least one graded finding bullet",
      )
  } else if (sequence !== "clean") {
    throw new SubjectError(
      `the ${role} class carries no severity and refuses graded finding bullets`,
    )
  }
  return `${tags.join(" ")}: ${sentence}`
}

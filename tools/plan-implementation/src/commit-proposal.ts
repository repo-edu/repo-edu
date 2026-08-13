import type { CodingCommitProposal } from "./contracts.js"
import { PlanRecordError } from "./plan-record-error.js"

const severitySequencePattern =
  /^(?:A[1-9][0-9]*)?(?:B[1-9][0-9]*)?(?:C[1-9][0-9]*)?(?:D[1-9][0-9]*)?$/
const conventionalKinds = new Set([
  "build",
  "chore",
  "ci",
  "docs",
  "feat",
  "fix",
  "perf",
  "redesign",
  "refactor",
  "revert",
  "style",
  "test",
])

function assertSingleLine(value: string, description: string): void {
  if (value.length === 0 || value.trim() !== value || /[\r\n\0]/.test(value)) {
    throw new PlanRecordError(`${description} must be one non-blank line.`)
  }
}

export function validateStepCommitSubject(subject: string): void {
  assertSingleLine(subject, "The step commit subject")
  const match =
    /^(?<severity>[A-D0-9]+) (?<kind>[a-z]+)\((?<scope>[a-z0-9]+(?:-[a-z0-9]+)*)\): (?<summary>.+)$/.exec(
      subject,
    )
  if (!match?.groups) {
    throw new PlanRecordError(
      "The step commit subject must contain a severity sequence, conventional kind, scope and summary.",
    )
  }
  if (
    match.groups.severity.length === 0 ||
    !severitySequencePattern.test(match.groups.severity)
  ) {
    throw new PlanRecordError(
      "The step commit severity sequence must use canonical A-to-D counts.",
    )
  }
  if (!conventionalKinds.has(match.groups.kind)) {
    throw new PlanRecordError(
      `The step commit kind is not supported: ${match.groups.kind}.`,
    )
  }
  if (match.groups.summary.trim() !== match.groups.summary) {
    throw new PlanRecordError("The step commit summary has outer whitespace.")
  }
}

function validateDecisionBullet(bullet: string): void {
  assertSingleLine(bullet, "Each decision bullet")
  if (!/^[A-Z]/.test(bullet)) {
    throw new PlanRecordError("Each decision bullet must start with a capital.")
  }
  if (!bullet.endsWith(".")) {
    throw new PlanRecordError("Each decision bullet must be one sentence.")
  }
  if (/^Co-Authored-By:/i.test(bullet)) {
    throw new PlanRecordError("Co-Authored-By trailers are not allowed.")
  }
}

export function validateStepCommitProposal(
  proposal: CodingCommitProposal,
): void {
  validateStepCommitSubject(proposal.subject)
  if (proposal.decisionBullets.length === 0) {
    throw new PlanRecordError(
      "A step commit must contain at least one decision-and-reason bullet.",
    )
  }
  for (const bullet of proposal.decisionBullets) {
    validateDecisionBullet(bullet)
  }
}

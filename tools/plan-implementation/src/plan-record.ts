import { validateStepCommitProposal } from "./commit-proposal.js"
import type { CodingCommitProposal, PlanSourceIdentity } from "./contracts.js"
import { PlanRecordError } from "./plan-record-error.js"

const fullObjectIdPattern = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/

const recordFieldNames = [
  "Plan",
  "Plan-Step",
  "Plan-Cursor-Reset",
  "Plan-Source-Commit",
  "Plan-Source-Blob",
] as const

type PlanRecordFields = {
  readonly planName: string
  readonly sourceCommitOid: string
  readonly sourceBlobOid: string
}

export type PlanStepCommitRecord = PlanRecordFields & {
  readonly kind: "step"
  readonly step: number
  readonly subject: string
  readonly decisionBullets: readonly string[]
}

export type PlanCursorResetCommitRecord = PlanRecordFields & {
  readonly kind: "cursor-reset"
  readonly nextStep: number
}

export type PlanCommitRecord =
  | PlanStepCommitRecord
  | PlanCursorResetCommitRecord

export type FormattedCommitMessage = {
  readonly subject: string
  readonly body: string
}

export { PlanRecordError } from "./plan-record-error.js"

function assertSingleLine(value: string, description: string): void {
  if (value.length === 0 || value.trim() !== value || /[\r\n\0]/.test(value)) {
    throw new PlanRecordError(`${description} must be one non-blank line.`)
  }
}

function assertFullObjectId(value: string, description: string): void {
  if (!fullObjectIdPattern.test(value)) {
    throw new PlanRecordError(
      `${description} must be a full lowercase Git object ID.`,
    )
  }
}

function parsePositiveInteger(value: string, description: string): number {
  if (!/^[1-9][0-9]*$/.test(value)) {
    throw new PlanRecordError(
      `${description} must be a canonical positive base-10 integer.`,
    )
  }
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed)) {
    throw new PlanRecordError(`${description} exceeds the safe integer range.`)
  }
  return parsed
}

function countField(lines: readonly string[], fieldName: string): number {
  return lines.filter((line) => line.startsWith(`${fieldName}:`)).length
}

function fieldValue(line: string, fieldName: string): string {
  const prefix = `${fieldName}: `
  if (!line.startsWith(prefix)) {
    throw new PlanRecordError(`The ${fieldName} field is malformed.`)
  }
  const value = line.slice(prefix.length)
  assertSingleLine(value, `The ${fieldName} value`)
  return value
}

function normalizeBody(body: string): string {
  if (body.includes("\r") || body.includes("\0")) {
    throw new PlanRecordError("Plan record bodies must use plain Git lines.")
  }
  return body.endsWith("\n") ? body.slice(0, -1) : body
}

function hasRecordFields(lines: readonly string[]): boolean {
  return lines.some((line) =>
    recordFieldNames
      .slice(1)
      .some((fieldName) => line.startsWith(`${fieldName}:`)),
  )
}

function assertExactFieldCounts(
  lines: readonly string[],
  kind: "step" | "cursor-reset",
): void {
  const expectedCounts = {
    Plan: 1,
    "Plan-Step": kind === "step" ? 1 : 0,
    "Plan-Cursor-Reset": kind === "cursor-reset" ? 1 : 0,
    "Plan-Source-Commit": 1,
    "Plan-Source-Blob": 1,
  } as const
  for (const [fieldName, expected] of Object.entries(expectedCounts)) {
    const actual = countField(lines, fieldName)
    if (actual !== expected) {
      throw new PlanRecordError(
        `The ${kind} record requires ${expected} ${fieldName} field${expected === 1 ? "" : "s"}; found ${actual}.`,
      )
    }
  }
}

export function parsePlanCommitRecord(
  subject: string,
  body: string,
): PlanCommitRecord | null {
  const lines = normalizeBody(body).split("\n")
  if (!hasRecordFields(lines)) {
    return null
  }

  const stepFields = countField(lines, "Plan-Step")
  const resetFields = countField(lines, "Plan-Cursor-Reset")
  if ((stepFields === 0) === (resetFields === 0)) {
    throw new PlanRecordError(
      "A plan commit must contain exactly one step or cursor-reset record kind.",
    )
  }

  const kind = stepFields > 0 ? "step" : "cursor-reset"
  assertExactFieldCounts(lines, kind)
  if (lines[1] !== "") {
    throw new PlanRecordError("A plan record must follow one blank line.")
  }

  const planName = fieldValue(lines[0], "Plan")
  if (kind === "step") {
    if (lines.length < 7 || lines[5] !== "") {
      throw new PlanRecordError(
        "A step record must be followed by one blank line and decision bullets.",
      )
    }
    const step = parsePositiveInteger(
      fieldValue(lines[2], "Plan-Step"),
      "Plan-Step",
    )
    const sourceCommitOid = fieldValue(lines[3], "Plan-Source-Commit")
    const sourceBlobOid = fieldValue(lines[4], "Plan-Source-Blob")
    assertFullObjectId(sourceCommitOid, "Plan-Source-Commit")
    assertFullObjectId(sourceBlobOid, "Plan-Source-Blob")
    const decisionBullets = lines.slice(6).map((line) => {
      if (!line.startsWith("- ")) {
        throw new PlanRecordError(
          "Step decision bullets must be consecutive '- ' lines.",
        )
      }
      return line.slice(2)
    })
    validateStepCommitProposal({ subject, decisionBullets })
    return {
      kind,
      planName,
      step,
      sourceCommitOid,
      sourceBlobOid,
      subject,
      decisionBullets,
    }
  }

  if (lines.length !== 5) {
    throw new PlanRecordError(
      "A cursor-reset record must contain only its exact five lines.",
    )
  }
  const nextStep = parsePositiveInteger(
    fieldValue(lines[2], "Plan-Cursor-Reset"),
    "Plan-Cursor-Reset",
  )
  const sourceCommitOid = fieldValue(lines[3], "Plan-Source-Commit")
  const sourceBlobOid = fieldValue(lines[4], "Plan-Source-Blob")
  assertFullObjectId(sourceCommitOid, "Plan-Source-Commit")
  assertFullObjectId(sourceBlobOid, "Plan-Source-Blob")
  const expectedSubject = `chore(plan-implementation): reset ${planName} cursor to step ${nextStep}`
  if (subject !== expectedSubject) {
    throw new PlanRecordError(
      "The cursor-reset subject does not match its plan and next step.",
    )
  }
  return {
    kind,
    planName,
    nextStep,
    sourceCommitOid,
    sourceBlobOid,
  }
}

function recordSourceLines(source: PlanSourceIdentity): readonly string[] {
  assertSingleLine(source.planName, "The plan name")
  assertFullObjectId(source.commitOid, "The plan source commit")
  assertFullObjectId(source.blobOid, "The plan source blob")
  return [
    `Plan-Source-Commit: ${source.commitOid}`,
    `Plan-Source-Blob: ${source.blobOid}`,
  ]
}

export function createPlanStepCommitMessage(
  source: PlanSourceIdentity,
  step: number,
  proposal: CodingCommitProposal,
): FormattedCommitMessage {
  parsePositiveInteger(String(step), "Plan-Step")
  validateStepCommitProposal(proposal)
  const body = [
    `Plan: ${source.planName}`,
    "",
    `Plan-Step: ${step}`,
    ...recordSourceLines(source),
    "",
    ...proposal.decisionBullets.map((bullet) => `- ${bullet}`),
  ].join("\n")
  const record = parsePlanCommitRecord(proposal.subject, body)
  if (record?.kind !== "step") {
    throw new PlanRecordError("The step writer produced an invalid record.")
  }
  return { subject: proposal.subject, body }
}

export function createCursorResetCommitMessage(
  source: PlanSourceIdentity,
  nextStep: number,
): FormattedCommitMessage {
  parsePositiveInteger(String(nextStep), "Plan-Cursor-Reset")
  const subject = `chore(plan-implementation): reset ${source.planName} cursor to step ${nextStep}`
  const body = [
    `Plan: ${source.planName}`,
    "",
    `Plan-Cursor-Reset: ${nextStep}`,
    ...recordSourceLines(source),
  ].join("\n")
  const record = parsePlanCommitRecord(subject, body)
  if (record?.kind !== "cursor-reset") {
    throw new PlanRecordError(
      "The cursor-reset writer produced an invalid record.",
    )
  }
  return { subject, body }
}

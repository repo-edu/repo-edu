import {
  parseStepCommitSubject,
  validateStepCommitProposal,
} from "./commit-proposal.js"
import type { CodingCommitProposal, PlanSourceIdentity } from "./contracts.js"
import { PlanRecordError } from "./plan-record-error.js"

const fullObjectIdPattern = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/
const completionSummary = "record completed implementation"

const sourceFieldNames = ["Plan-Source-Commit", "Plan-Source-Blob"] as const

type PlanRecordFields = {
  readonly planName: string
  readonly sourceCommitOid: string
  readonly sourceBlobOid: string
}

export type PlanStepCommitRecord = PlanRecordFields & {
  readonly kind: "step"
  readonly steps: readonly number[]
  readonly subject: string
  readonly decisionBullets: readonly string[]
}

export type PlanCursorResetCommitRecord = PlanRecordFields & {
  readonly kind: "cursor-reset"
  readonly nextStep: number
}

export type PlanCompletionCommitRecord = {
  readonly kind: "completion"
  readonly planName: string
}

export type PlanCommitRecord =
  | PlanStepCommitRecord
  | PlanCursorResetCommitRecord
  | PlanCompletionCommitRecord

export type FormattedCommitMessage = {
  readonly subject: string
  readonly body: string
}

type ParsedRecordSubject =
  | {
      readonly kind: "step"
      readonly planName: string
      readonly steps: readonly number[]
      readonly severitySequence: string
      readonly conventionalSubject: string
    }
  | {
      readonly kind: "cursor-reset"
      readonly planName: string
      readonly nextStep: number
    }
  | {
      readonly kind: "completion"
      readonly planName: string
    }

export { PlanRecordError } from "./plan-record-error.js"

function assertSingleLine(value: string, description: string): void {
  if (value.length === 0 || value.trim() !== value || /[\r\n\0]/.test(value)) {
    throw new PlanRecordError(`${description} must be one non-blank line.`)
  }
}

function assertPlanName(planName: string): void {
  assertSingleLine(planName, "The plan name")
  if (planName.includes("/")) {
    throw new PlanRecordError("The plan name cannot contain a slash.")
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

function parseStepList(value: string): readonly number[] {
  const steps = value
    .split(",")
    .map((step) => parsePositiveInteger(step, "Each step subject number"))
  for (let index = 1; index < steps.length; index += 1) {
    if (steps[index] <= steps[index - 1]) {
      throw new PlanRecordError(
        "A multi-step subject must list unique steps in ascending order.",
      )
    }
  }
  return Object.freeze(steps)
}

function parseRecordSubject(subject: string): ParsedRecordSubject | null {
  const sharedSubject =
    /^(?<planName>[^/]+)\/(?<form>[^:]+): (?<summary>.+)$/.exec(subject)
  if (!sharedSubject?.groups) return null

  const { planName, form, summary } = sharedSubject.groups
  assertPlanName(planName)

  if (form === "completed") {
    assertSingleLine(summary, "The completion marker summary")
    return { kind: "completion", planName }
  }

  if (form.startsWith("reset-")) {
    const nextStep = parsePositiveInteger(
      form.slice("reset-".length),
      "The cursor-reset subject step",
    )
    if (summary !== `reset cursor to step ${nextStep}`) {
      throw new PlanRecordError(
        "The cursor-reset subject does not match its next step.",
      )
    }
    return { kind: "cursor-reset", planName, nextStep }
  }

  const singleStep = /^step-(?<step>[1-9][0-9]*)-(?<severity>[A-D0-9]+)$/.exec(
    form,
  )
  const multipleSteps =
    /^steps-(?<steps>[1-9][0-9]*(?:,[1-9][0-9]*)+)-(?<severity>[A-D0-9]+)$/.exec(
      form,
    )
  const stepGroups = singleStep?.groups ?? multipleSteps?.groups
  if (!stepGroups) {
    if (form.startsWith("step-") || form.startsWith("steps-")) {
      throw new PlanRecordError("The implementation step subject is malformed.")
    }
    return null
  }

  const steps = singleStep?.groups
    ? Object.freeze([
        parsePositiveInteger(singleStep.groups.step, "The step subject number"),
      ])
    : parseStepList(stepGroups.steps)
  const proposalSubject = `${stepGroups.severity} ${summary}`
  const proposal = parseStepCommitSubject(proposalSubject)
  return {
    kind: "step",
    planName,
    steps,
    severitySequence: proposal.severitySequence,
    conventionalSubject: proposal.conventionalSubject,
  }
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

function hasSourceFields(lines: readonly string[]): boolean {
  return sourceFieldNames.some((fieldName) => countField(lines, fieldName) > 0)
}

function parseSourceFields(lines: readonly string[]): {
  readonly sourceCommitOid: string
  readonly sourceBlobOid: string
} {
  for (const fieldName of sourceFieldNames) {
    const count = countField(lines, fieldName)
    if (count !== 1) {
      throw new PlanRecordError(
        `A runner record requires one ${fieldName} field; found ${count}.`,
      )
    }
  }
  const sourceCommitOid = fieldValue(lines[0], "Plan-Source-Commit")
  const sourceBlobOid = fieldValue(lines[1], "Plan-Source-Blob")
  assertFullObjectId(sourceCommitOid, "Plan-Source-Commit")
  assertFullObjectId(sourceBlobOid, "Plan-Source-Blob")
  return { sourceCommitOid, sourceBlobOid }
}

export function parsePlanCommitRecord(
  subject: string,
  body: string,
): PlanCommitRecord | null {
  const parsedSubject = parseRecordSubject(subject)
  if (!parsedSubject) return null

  const normalizedBody = normalizeBody(body)
  if (parsedSubject.kind === "completion") {
    if (normalizedBody.length > 0) {
      throw new PlanRecordError("A completion marker body must be empty.")
    }
    return {
      kind: parsedSubject.kind,
      planName: parsedSubject.planName,
    }
  }

  const lines = normalizedBody.split("\n")
  if (!hasSourceFields(lines)) {
    return null
  }
  const source = parseSourceFields(lines)

  if (parsedSubject.kind === "step") {
    if (lines.length < 4 || lines[2] !== "") {
      throw new PlanRecordError(
        "A step record must follow its source fields with one blank line and decision bullets.",
      )
    }
    const decisionBullets = lines.slice(3).map((line) => {
      if (!line.startsWith("- ")) {
        throw new PlanRecordError(
          "Step decision bullets must be consecutive '- ' lines.",
        )
      }
      return line.slice(2)
    })
    validateStepCommitProposal({
      subject: `${parsedSubject.severitySequence} ${parsedSubject.conventionalSubject}`,
      decisionBullets,
    })
    return {
      kind: parsedSubject.kind,
      planName: parsedSubject.planName,
      steps: parsedSubject.steps,
      ...source,
      subject,
      decisionBullets,
    }
  }

  if (lines.length !== 2) {
    throw new PlanRecordError(
      `A ${parsedSubject.kind} record must contain only its two source fields.`,
    )
  }
  return {
    kind: parsedSubject.kind,
    planName: parsedSubject.planName,
    nextStep: parsedSubject.nextStep,
    ...source,
  }
}

function recordSourceLines(source: PlanSourceIdentity): readonly string[] {
  assertPlanName(source.planName)
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
  parsePositiveInteger(String(step), "The step subject number")
  validateStepCommitProposal(proposal)
  const parsedProposal = parseStepCommitSubject(proposal.subject)
  const subject = `${source.planName}/step-${step}-${parsedProposal.severitySequence}: ${parsedProposal.conventionalSubject}`
  const body = [
    ...recordSourceLines(source),
    "",
    ...proposal.decisionBullets.map((bullet) => `- ${bullet}`),
  ].join("\n")
  const record = parsePlanCommitRecord(subject, body)
  if (record?.kind !== "step") {
    throw new PlanRecordError("The step writer produced an invalid record.")
  }
  return { subject, body }
}

export function createCursorResetCommitMessage(
  source: PlanSourceIdentity,
  nextStep: number,
): FormattedCommitMessage {
  parsePositiveInteger(String(nextStep), "The cursor-reset subject step")
  const subject = `${source.planName}/reset-${nextStep}: reset cursor to step ${nextStep}`
  const body = recordSourceLines(source).join("\n")
  const record = parsePlanCommitRecord(subject, body)
  if (record?.kind !== "cursor-reset") {
    throw new PlanRecordError(
      "The cursor-reset writer produced an invalid record.",
    )
  }
  return { subject, body }
}

export function createPlanCompletionCommitMessage(
  source: PlanSourceIdentity,
): FormattedCommitMessage {
  assertPlanName(source.planName)
  const subject = `${source.planName}/completed: ${completionSummary}`
  const body = ""
  const record = parsePlanCommitRecord(subject, body)
  if (record?.kind !== "completion") {
    throw new PlanRecordError(
      "The completion writer produced an invalid record.",
    )
  }
  return { subject, body }
}

import type {
  CommittedImplementationPlan,
  PlanImplementationRunRequest,
  PlanUserActionProof,
} from "./contracts.js"
import type { ResolvedPlanCursor } from "./git-cursor.js"

export type FrozenRunAuthorization = {
  readonly request: PlanImplementationRunRequest
  readonly resumeStep: number
  readonly resolvedCeiling: number
  readonly totalSteps: number
}

export class RunLimitError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "RunLimitError"
  }
}

export class UserActionProofError extends RunLimitError {
  readonly step: number
  readonly action: string

  constructor(step: number, action: string) {
    super(`Implementation step ${step} requires user action: ${action}`)
    this.name = "UserActionProofError"
    this.step = step
    this.action = action
  }
}

function assertPositiveInteger(value: number, description: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RunLimitError(`${description} must be a positive safe integer.`)
  }
}

function validatePlanAndCursor(
  plan: CommittedImplementationPlan,
  cursor: ResolvedPlanCursor,
): void {
  const totalSteps = plan.steps.length
  assertPositiveInteger(totalSteps, "The plan step count")
  for (const [index, step] of plan.steps.entries()) {
    if (step.number !== index + 1) {
      throw new RunLimitError(
        "The implementation steps must have contiguous numbers starting at 1.",
      )
    }
  }
  if (
    !Number.isSafeInteger(cursor.nextStep) ||
    cursor.nextStep < 1 ||
    cursor.nextStep > totalSteps + 1
  ) {
    throw new RunLimitError(
      `The Git cursor must point from step 1 through ${totalSteps + 1}.`,
    )
  }
}

function cloneRequest(
  request: PlanImplementationRunRequest,
): PlanImplementationRunRequest {
  switch (request.mode) {
    case "complete":
      return Object.freeze({ mode: request.mode })
    case "count":
      assertPositiveInteger(request.count, "The step count")
      return Object.freeze({ mode: request.mode, count: request.count })
    case "through-step":
      assertPositiveInteger(request.throughStep, "The through-step value")
      return Object.freeze({
        mode: request.mode,
        throughStep: request.throughStep,
      })
  }
}

function resolveCeiling(
  request: PlanImplementationRunRequest,
  resumeStep: number,
  totalSteps: number,
): number {
  switch (request.mode) {
    case "complete":
      return totalSteps
    case "count": {
      assertPositiveInteger(request.count, "The step count")
      const remainingSteps = Math.max(totalSteps - resumeStep + 1, 0)
      return resumeStep > totalSteps
        ? totalSteps
        : resumeStep + Math.min(request.count, remainingSteps) - 1
    }
    case "through-step":
      assertPositiveInteger(request.throughStep, "The through-step value")
      if (request.throughStep > totalSteps) {
        throw new RunLimitError(
          `The through-step value exceeds the final plan step ${totalSteps}.`,
        )
      }
      if (request.throughStep < resumeStep) {
        throw new RunLimitError(
          `The through-step value is before the resume step ${resumeStep}.`,
        )
      }
      return request.throughStep
  }
}

function isUserActionProof(
  proof: CommittedImplementationPlan["steps"][number]["proofs"]["items"][number],
): proof is PlanUserActionProof {
  return "user-action" in proof
}

function refuseUserActions(
  plan: CommittedImplementationPlan,
  resumeStep: number,
  resolvedCeiling: number,
): void {
  if (resumeStep > resolvedCeiling) {
    return
  }
  for (const step of plan.steps.slice(resumeStep - 1, resolvedCeiling)) {
    const proof = step.proofs.items.find(isUserActionProof)
    if (proof) {
      throw new UserActionProofError(step.number, proof["user-action"])
    }
  }
}

export function resolveRunAuthorization(
  plan: CommittedImplementationPlan,
  cursor: ResolvedPlanCursor,
  request: PlanImplementationRunRequest,
): FrozenRunAuthorization {
  validatePlanAndCursor(plan, cursor)
  const totalSteps = plan.steps.length
  const resolvedCeiling = resolveCeiling(request, cursor.nextStep, totalSteps)
  refuseUserActions(plan, cursor.nextStep, resolvedCeiling)
  return Object.freeze({
    request: cloneRequest(request),
    resumeStep: cursor.nextStep,
    resolvedCeiling,
    totalSteps,
  })
}

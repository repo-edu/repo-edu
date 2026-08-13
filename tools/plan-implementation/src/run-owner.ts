import type { FrozenRunAuthorization } from "./run-limits.js"

type RunStateFields = {
  readonly authorization: FrozenRunAuthorization
}

type OpenWorkAdmission = {
  readonly newWorkAdmission: "open"
  readonly closureReason: null
}

type ClosedWorkAdmission = {
  readonly newWorkAdmission: "closed"
  readonly closureReason: string
}

type ActiveRunStateFields = RunStateFields &
  (OpenWorkAdmission | ClosedWorkAdmission)

export type PlanImplementationRunState =
  | (ActiveRunStateFields & { readonly status: "admission" })
  | (ActiveRunStateFields & {
      readonly status: "implementing" | "checking" | "committing"
      readonly step: number
    })
  | (RunStateFields & {
      readonly status: "completed" | "bound-reached"
      readonly lastCommittedStep: number
    })
  | (RunStateFields & {
      readonly status: "stopped"
      readonly reason: string
    })

type ActivePlanImplementationRunState = Extract<
  PlanImplementationRunState,
  { readonly newWorkAdmission: "open" | "closed" }
>

export type PlanImplementationOwnerEvent =
  | { readonly kind: "admission-completed" }
  | { readonly kind: "implementation-completed"; readonly step: number }
  | { readonly kind: "checks-completed"; readonly step: number }
  | {
      readonly kind: "commit-completed"
      readonly step: number
      readonly checkout: "clean"
    }
  | { readonly kind: "close-new-work"; readonly reason: string }
  | { readonly kind: "closed-work-settled" }

export class RunOwnerError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "RunOwnerError"
  }
}

function freezeState<T extends PlanImplementationRunState>(state: T): T {
  return Object.freeze(state)
}

function requireStep(actual: number, expected: number): void {
  if (actual !== expected) {
    throw new RunOwnerError(
      `The run owner expected step ${expected} but received step ${actual}.`,
    )
  }
}

function invalidTransition(
  state: PlanImplementationRunState,
  event: unknown,
): never {
  const eventKind = (event as { readonly kind?: unknown }).kind
  throw new RunOwnerError(
    `Event ${String(eventKind)} cannot move run state ${state.status}.`,
  )
}

function isActiveRunState(
  state: PlanImplementationRunState,
): state is ActivePlanImplementationRunState {
  return "newWorkAdmission" in state
}

export function createRunOwnerState(
  authorization: FrozenRunAuthorization,
): PlanImplementationRunState {
  return freezeState({
    status: "admission",
    authorization,
    newWorkAdmission: "open",
    closureReason: null,
  })
}

export function isNewWorkAdmissionOpen(
  state: PlanImplementationRunState,
): boolean {
  return "newWorkAdmission" in state && state.newWorkAdmission === "open"
}

export function readRunClosureReason(
  state: PlanImplementationRunState,
): string | null {
  if (state.status === "stopped") return state.reason
  if ("newWorkAdmission" in state && state.newWorkAdmission === "closed") {
    return state.closureReason
  }
  return null
}

export function reduceRunOwnerState(
  state: PlanImplementationRunState,
  event: PlanImplementationOwnerEvent,
): PlanImplementationRunState {
  if (event.kind === "close-new-work") {
    if (event.reason.trim().length === 0) {
      throw new RunOwnerError("A stopped run requires a non-blank reason.")
    }
    if (!isActiveRunState(state)) {
      throw new RunOwnerError(`Run state ${state.status} is terminal.`)
    }
    if (state.newWorkAdmission === "closed") {
      return state
    }
    return freezeState({
      ...state,
      newWorkAdmission: "closed",
      closureReason: event.reason,
    })
  }

  if (event.kind === "closed-work-settled") {
    if (!isActiveRunState(state)) {
      throw new RunOwnerError(`Run state ${state.status} is terminal.`)
    }
    if (state.newWorkAdmission !== "closed") {
      return invalidTransition(state, event)
    }
    return freezeState({
      status: "stopped",
      authorization: state.authorization,
      reason: state.closureReason,
    })
  }

  switch (state.status) {
    case "admission":
      if (event.kind !== "admission-completed") {
        return invalidTransition(state, event)
      }
      if (state.newWorkAdmission === "closed") {
        return freezeState({
          status: "stopped",
          authorization: state.authorization,
          reason: state.closureReason,
        })
      }
      if (
        state.authorization.resumeStep > state.authorization.resolvedCeiling
      ) {
        return freezeState({
          status: "completed",
          authorization: state.authorization,
          lastCommittedStep: state.authorization.totalSteps,
        })
      }
      return freezeState({
        status: "implementing",
        authorization: state.authorization,
        step: state.authorization.resumeStep,
        newWorkAdmission: "open",
        closureReason: null,
      })
    case "implementing":
      if (event.kind !== "implementation-completed") {
        return invalidTransition(state, event)
      }
      if (state.newWorkAdmission === "closed") {
        return invalidTransition(state, event)
      }
      requireStep(event.step, state.step)
      return freezeState({
        status: "checking",
        authorization: state.authorization,
        step: state.step,
        newWorkAdmission: "open",
        closureReason: null,
      })
    case "checking":
      if (event.kind !== "checks-completed") {
        return invalidTransition(state, event)
      }
      if (state.newWorkAdmission === "closed") {
        return invalidTransition(state, event)
      }
      requireStep(event.step, state.step)
      return freezeState({
        status: "committing",
        authorization: state.authorization,
        step: state.step,
        newWorkAdmission: "open",
        closureReason: null,
      })
    case "committing":
      if (event.kind !== "commit-completed") {
        return invalidTransition(state, event)
      }
      requireStep(event.step, state.step)
      if (event.checkout !== "clean") {
        return invalidTransition(state, event)
      }
      if (state.newWorkAdmission === "closed") {
        return freezeState({
          status: "stopped",
          authorization: state.authorization,
          reason: state.closureReason,
        })
      }
      if (state.step === state.authorization.resolvedCeiling) {
        return freezeState({
          status:
            state.step === state.authorization.totalSteps
              ? "completed"
              : "bound-reached",
          authorization: state.authorization,
          lastCommittedStep: state.step,
        })
      }
      if (state.step >= state.authorization.resolvedCeiling) {
        throw new RunOwnerError("The run moved beyond its frozen ceiling.")
      }
      return freezeState({
        status: "implementing",
        authorization: state.authorization,
        step: state.step + 1,
        newWorkAdmission: "open",
        closureReason: null,
      })
    case "completed":
    case "bound-reached":
    case "stopped":
      throw new RunOwnerError(`Run state ${state.status} is terminal.`)
  }
}

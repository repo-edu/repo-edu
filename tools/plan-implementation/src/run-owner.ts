import type { FrozenRunAuthorization } from "./run-limits.js"

type RunStateFields = {
  readonly authorization: FrozenRunAuthorization
}

export type PlanImplementationRunState =
  | (RunStateFields & { readonly status: "admission" })
  | (RunStateFields & {
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

export type PlanImplementationOwnerEvent =
  | { readonly kind: "admission-completed" }
  | { readonly kind: "implementation-completed"; readonly step: number }
  | { readonly kind: "checks-completed"; readonly step: number }
  | {
      readonly kind: "commit-completed"
      readonly step: number
      readonly checkout: "clean"
    }
  | { readonly kind: "stop"; readonly reason: string }

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

export function createRunOwnerState(
  authorization: FrozenRunAuthorization,
): PlanImplementationRunState {
  return freezeState({ status: "admission", authorization })
}

export function reduceRunOwnerState(
  state: PlanImplementationRunState,
  event: PlanImplementationOwnerEvent,
): PlanImplementationRunState {
  if (event.kind === "stop") {
    if (event.reason.trim().length === 0) {
      throw new RunOwnerError("A stopped run requires a non-blank reason.")
    }
    if (
      state.status === "completed" ||
      state.status === "bound-reached" ||
      state.status === "stopped"
    ) {
      throw new RunOwnerError(`Run state ${state.status} is terminal.`)
    }
    return freezeState({
      status: "stopped",
      authorization: state.authorization,
      reason: event.reason,
    })
  }

  switch (state.status) {
    case "admission":
      if (event.kind !== "admission-completed") {
        return invalidTransition(state, event)
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
      })
    case "implementing":
      if (event.kind !== "implementation-completed") {
        return invalidTransition(state, event)
      }
      requireStep(event.step, state.step)
      return freezeState({
        status: "checking",
        authorization: state.authorization,
        step: state.step,
      })
    case "checking":
      if (event.kind !== "checks-completed") {
        return invalidTransition(state, event)
      }
      requireStep(event.step, state.step)
      return freezeState({
        status: "committing",
        authorization: state.authorization,
        step: state.step,
      })
    case "committing":
      if (event.kind !== "commit-completed") {
        return invalidTransition(state, event)
      }
      requireStep(event.step, state.step)
      if (event.checkout !== "clean") {
        return invalidTransition(state, event)
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
      })
    case "completed":
    case "bound-reached":
    case "stopped":
      throw new RunOwnerError(`Run state ${state.status} is terminal.`)
  }
}

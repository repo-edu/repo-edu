import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { PlanImplementationEvent } from "../contracts.js"
import type { FrozenRunAuthorization } from "../run-limits.js"
import {
  createRunOwnerState,
  type PlanImplementationOwnerEvent,
  type PlanImplementationRunState,
  RunOwnerError,
  reduceRunOwnerState,
} from "../run-owner.js"

function authorization(
  resolvedCeiling: number,
  totalSteps = 3,
  resumeStep = 1,
): FrozenRunAuthorization {
  return Object.freeze({
    request: Object.freeze({ mode: "through-step", throughStep: 2 }),
    resumeStep,
    resolvedCeiling,
    totalSteps,
  })
}

function apply(
  state: PlanImplementationRunState,
  ...events: readonly PlanImplementationOwnerEvent[]
): PlanImplementationRunState {
  return events.reduce(reduceRunOwnerState, state)
}

function completeActiveStep(
  state: PlanImplementationRunState,
  step: number,
): PlanImplementationRunState {
  return apply(
    state,
    { kind: "implementation-completed", step },
    { kind: "checks-completed", step },
    { kind: "commit-completed", step, checkout: "clean" },
  )
}

describe("reduceRunOwnerState", () => {
  it("owns the complete run phase sequence", () => {
    const frozenAuthorization = authorization(3)
    let state = reduceRunOwnerState(createRunOwnerState(frozenAuthorization), {
      kind: "admission-completed",
    })
    assert.deepEqual(
      [state.status, "step" in state ? state.step : null],
      ["implementing", 1],
    )

    state = completeActiveStep(state, 1)
    assert.deepEqual(
      [state.status, "step" in state ? state.step : null],
      ["implementing", 2],
    )
    state = completeActiveStep(state, 2)
    state = completeActiveStep(state, 3)

    assert.equal(state.status, "completed")
    assert.equal(
      "lastCommittedStep" in state ? state.lastCommittedStep : null,
      3,
    )
    assert.equal(state.authorization, frozenAuthorization)
    assert.ok(Object.isFrozen(state))
  })

  it("ends at a clean ceiling without starting later work", () => {
    let state = reduceRunOwnerState(createRunOwnerState(authorization(2)), {
      kind: "admission-completed",
    })
    state = completeActiveStep(state, 1)
    state = completeActiveStep(state, 2)

    assert.equal(state.status, "bound-reached")
    assert.throws(
      () =>
        reduceRunOwnerState(state, {
          kind: "admission-completed",
        }),
      /bound-reached is terminal/,
    )
  })

  it("completes without work when the cursor is already past the ceiling", () => {
    const state = reduceRunOwnerState(
      createRunOwnerState(authorization(3, 3, 4)),
      { kind: "admission-completed" },
    )

    assert.equal(state.status, "completed")
    assert.equal(
      "lastCommittedStep" in state ? state.lastCommittedStep : null,
      3,
    )
  })

  it("stops from an active phase and rejects invalid phase movement", () => {
    const admission = createRunOwnerState(authorization(2))
    assert.throws(
      () =>
        reduceRunOwnerState(admission, {
          kind: "checks-completed",
          step: 1,
        }),
      RunOwnerError,
    )

    const implementing = reduceRunOwnerState(admission, {
      kind: "admission-completed",
    })
    const stopped = reduceRunOwnerState(implementing, {
      kind: "stop",
      reason: "The coding result was blocked.",
    })
    assert.equal(stopped.status, "stopped")
    assert.equal(
      "reason" in stopped ? stopped.reason : null,
      "The coding result was blocked.",
    )
  })

  it("does not accept semantic display events as owner transitions", () => {
    const state = createRunOwnerState(authorization(2))
    const displayEvent: PlanImplementationEvent = {
      kind: "phase-changed",
      timestamp: "2026-08-13T00:00:00.000Z",
      phase: "implementing",
    }

    assert.throws(
      () =>
        reduceRunOwnerState(
          state,
          displayEvent as unknown as PlanImplementationOwnerEvent,
        ),
      /phase-changed cannot move run state admission/,
    )
    assert.equal(state.status, "admission")
  })
})

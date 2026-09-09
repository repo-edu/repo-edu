import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  exclusiveCommandDeclarations,
  HostAdmissionRefusedError,
  workflowCatalog,
} from "@repo-edu/application-contract"
import { HostAdmission } from "../host-admission"
import {
  acceptedHostCallCount,
  type HostAdmissionEffect,
  type HostAdmissionEvent,
  type HostAdmissionState,
  type HostRequest,
  initialHostAdmissionState,
} from "../host-admission-model"
import { hostAdmissionReducer } from "../host-admission-reducer"
import {
  desktopHostStarts,
  desktopShellActions,
  desktopTrpcWorkflowIds,
  desktopWorkflowStarts,
} from "../host-entry-inventory"

const request = (): HostRequest => ({ cancel() {} })
const current = request()
const command = {
  command: "repo.clone" as const,
  request: current,
  cancellationAccepted: false,
}
const phases: HostAdmissionState[] = [
  initialHostAdmissionState(),
  { phase: "interactive", calls: new Set() },
  { phase: "preparing", stage: "bundle-pending", ...command },
  { phase: "preparing", stage: "input-pending", ...command },
  { phase: "executing.running", ...command },
  { phase: "executing.settling", completion: null, ...command },
  {
    phase: "closing.draining",
    calls: new Set([request()]),
    reason: "close",
    request: current,
  },
  { phase: "closing.preparing", reason: "close", request: current },
  { phase: "closing.ready", reason: "close" },
  { phase: "closing.installing" },
  { phase: "closing.aborting" },
  { phase: "terminal", error: new Error("failed") },
]

function harness() {
  const effects: HostAdmissionEffect[] = []
  const owner = new HostAdmission((effect) => effects.push(effect))
  return {
    owner,
    effects,
    dispatch: (event: HostAdmissionEvent) => owner.dispatch(event),
  }
}

describe("desktop host admission", () => {
  it("has an exhaustive desktop classification independent of catalogue execution metadata", () => {
    assert.deepEqual(
      Object.keys(desktopWorkflowStarts).sort(),
      Object.keys(workflowCatalog).sort(),
    )
    assert.deepEqual(
      Object.entries(desktopWorkflowStarts)
        .filter(([, kind]) => kind === "exclusive")
        .map(([id]) => id)
        .sort(),
      Object.keys(exclusiveCommandDeclarations).sort(),
    )
    assert.equal(desktopWorkflowStarts["course.load"], "startup-or-ordinary")
  })

  it("keeps unsettled startup calls in starting and terminates premature acknowledgement", () => {
    const { owner, dispatch, effects } = harness()
    let cancellations = 0
    const settle = owner.startWorkflow("settings.loadApp", {
      cancel() {
        cancellations++
      },
    })
    assert.equal(acceptedHostCallCount(owner.getSnapshot()), 1)
    assert.throws(() => owner.startWorkflow("course.list", request()))
    assert.equal(dispatch({ type: "bootstrap-acknowledged" }), "terminal")
    assert.equal(owner.getSnapshot().phase, "terminal")
    assert.equal(cancellations, 1)
    settle()
    dispatch({ type: "bootstrap-acknowledged" })
    assert.equal(effects.filter((e) => e.type === "end-host").length, 1)
  })

  it("requires both startup loads to settle before readiness and counts course loads by phase", () => {
    const { owner, dispatch } = harness()
    const settings = owner.startWorkflow("settings.loadApp", request())
    const course = owner.startWorkflow("course.load", request())
    settings()
    settings()
    assert.equal(acceptedHostCallCount(owner.getSnapshot()), 1)
    course()
    assert.equal(dispatch({ type: "bootstrap-acknowledged" }), "accepted")
    assert.throws(() => owner.startWorkflow("settings.loadApp", request()))
    const nextCourse = owner.startWorkflow("course.load", request())
    assert.equal(acceptedHostCallCount(owner.getSnapshot()), 1)
    nextCourse()
  })

  it("ignores bootstrap acknowledgement after an aborting close without restarting shutdown", () => {
    const { owner, dispatch, effects } = harness()
    dispatch({ type: "host-start", source: "window-close", request: current })
    const closing = owner.getSnapshot()
    const closingEffects = [...effects]
    assert.equal(dispatch({ type: "bootstrap-acknowledged" }), "ignored")
    assert.equal(owner.getSnapshot(), closing)
    assert.deepEqual(effects, closingEffects)
  })

  it("refuses a later course load as ordinary work, never as a plain error", () => {
    const { owner, dispatch } = harness()
    dispatch({ type: "bootstrap-acknowledged" })
    dispatch({ type: "host-start", source: "window-close", request: current })
    assert.throws(
      () => owner.startWorkflow("course.load", request()),
      HostAdmissionRefusedError,
    )
    assert.throws(
      () => owner.startWorkflow("course.list", request()),
      HostAdmissionRefusedError,
    )
    assert.throws(
      () => owner.startWorkflow("settings.loadApp", request()),
      (error: unknown) => !(error instanceof HostAdmissionRefusedError),
    )
  })

  it("limits the tRPC wire to startup and ordinary starts", () => {
    assert.deepEqual(
      [...desktopTrpcWorkflowIds].sort(),
      Object.entries(desktopWorkflowStarts)
        .filter(([, kind]) => kind !== "exclusive")
        .map(([id]) => id)
        .sort(),
    )
    assert.equal(desktopTrpcWorkflowIds.length, 29)
  })

  it("admits only one of two concurrent command attempts and preserves its resource", () => {
    const { owner, dispatch, effects } = harness()
    dispatch({ type: "bootstrap-acknowledged" })
    const first = request()
    const second = request()
    assert.equal(
      dispatch({
        type: "exclusive-intent",
        command: "repo.clone",
        request: first,
      }),
      "accepted",
    )
    assert.equal(
      dispatch({
        type: "exclusive-intent",
        command: "repo.create",
        request: second,
      }),
      "busy",
    )
    assert.equal(
      (owner.getSnapshot() as { request: HostRequest }).request,
      first,
    )
    assert.deepEqual(effects, [{ type: "prepare-command", request: first }])
  })

  for (const state of phases.filter((s) => s.phase === "preparing")) {
    it(`refuses intervening semantic work during ${state.phase} ${"stage" in state ? state.stage : ""}`, () => {
      for (const workflow of desktopTrpcWorkflowIds) {
        assert.equal(
          hostAdmissionReducer(state, {
            type: "workflow-start",
            workflow,
            call: request(),
          }).decision,
          "busy",
          workflow,
        )
      }
      for (const action of Object.keys(
        desktopShellActions,
      ) as (keyof typeof desktopShellActions)[]) {
        const result = hostAdmissionReducer(state, {
          type: "shell-action",
          action,
        })
        assert.equal(
          result.decision,
          desktopShellActions[action] === "presentation-only"
            ? "accepted"
            : "busy",
          action,
        )
        assert.equal(result.state, state)
      }
      assert.equal(
        hostAdmissionReducer(state, {
          type: "exclusive-intent",
          command: "repo.clone",
          request: request(),
        }).decision,
        "busy",
      )
      assert.equal(
        hostAdmissionReducer(state, { type: "bootstrap-acknowledged" }).state
          .phase,
        "terminal",
      )
      const cancel = hostAdmissionReducer(state, {
        type: "cancel-request",
        request: current,
      })
      assert.equal(cancel.state.phase, "preparing")
      assert.equal(cancel.effects.length, 0)
    })
  }

  for (const state of phases) {
    for (const source of Object.keys(
      desktopHostStarts,
    ) as (keyof typeof desktopHostStarts)[]) {
      it(`handles ${source} from ${state.phase}${"stage" in state ? ` ${state.stage}` : ""}`, () => {
        const result = hostAdmissionReducer(state, {
          type: "host-start",
          source,
          request: request(),
        })
        if (state.phase === "terminal" || state.phase.startsWith("closing.")) {
          assert.equal(result.state, state)
          assert.deepEqual(result.effects, [])
        } else if (
          desktopHostStarts[source] === "update-restart" &&
          state.phase !== "interactive"
        ) {
          assert.equal(result.decision, "busy")
          assert.equal(result.state, state)
        } else {
          assert.equal(result.effects[0]?.type, "disable-input")
          assert.equal(
            result.effects.filter((effect) => effect.type === "disable-input")
              .length,
            1,
          )
          assert.equal(
            result.state.phase,
            state.phase === "interactive"
              ? "closing.preparing"
              : "closing.aborting",
          )
          assert.equal(
            result.effects.filter((e) => e.type === "end-host").length,
            state.phase === "interactive" ? 0 : 1,
          )
          assert.equal(
            result.effects.filter((e) => e.type === "cancel-effect").length,
            state.phase === "executing.running" ? 1 : 0,
          )
        }
      })
    }
    it(`handles renderer update restart from ${state.phase}`, () => {
      const result = hostAdmissionReducer(state, {
        type: "update-restart",
        request: request(),
      })
      assert.equal(
        result.decision,
        state.phase === "interactive"
          ? "accepted"
          : state.phase === "terminal"
            ? "ignored"
            : "busy",
      )
      assert.deepEqual(
        result.effects.filter((effect) => effect.type === "disable-input"),
        state.phase === "interactive" ? [{ type: "disable-input" }] : [],
      )
    })
    it(`disables input only on first terminal entry from ${state.phase}`, () => {
      const result = hostAdmissionReducer(state, {
        type: "terminal",
        error: new Error("failed"),
      })
      const alreadyClosing =
        state.phase === "terminal" || state.phase.startsWith("closing.")
      assert.deepEqual(
        result.effects.filter((effect) => effect.type === "disable-input"),
        alreadyClosing ? [] : [{ type: "disable-input" }],
      )
      if (!alreadyClosing)
        assert.equal(result.effects[0]?.type, "disable-input")
      assert.deepEqual(
        hostAdmissionReducer(result.state, {
          type: "terminal",
          error: new Error("later"),
        }).effects,
        [],
      )
    })
  }

  it("drains accepted ordinary calls once before exactly one close preparation", () => {
    const { owner, dispatch, effects } = harness()
    dispatch({ type: "bootstrap-acknowledged" })
    const first = owner.startWorkflow("course.list", request())
    const second = owner.startWorkflow("course.save", request())
    assert.equal(
      dispatch({
        type: "exclusive-intent",
        command: "repo.clone",
        request: request(),
      }),
      "busy",
    )
    dispatch({ type: "host-start", source: "window-close", request: current })
    assert.equal(owner.getSnapshot().phase, "closing.draining")
    assert.throws(() => owner.startWorkflow("course.save", request()))
    first()
    first()
    assert.equal(acceptedHostCallCount(owner.getSnapshot()), 1)
    assert.deepEqual(effects, [{ type: "disable-input" }])
    second()
    second()
    assert.deepEqual(effects, [
      { type: "disable-input" },
      { type: "prepare-close", request: current },
    ])
    dispatch({
      type: "host-start",
      source: "application-quit",
      request: request(),
    })
    dispatch({ type: "close-ready", request: current })
    assert.equal(owner.getSnapshot().phase, "closing.ready")
    assert.equal(effects.filter((e) => e.type === "end-host").length, 1)
    dispatch({ type: "host-start", source: "window-close", request: request() })
    assert.equal(effects.filter((e) => e.type === "end-host").length, 1)
  })

  it("keeps cancellation inside preparation until persistence commits", () => {
    const { owner, dispatch, effects } = harness()
    dispatch({ type: "bootstrap-acknowledged" })
    dispatch({
      type: "exclusive-intent",
      command: "repo.clone",
      request: current,
    })
    dispatch({ type: "cancel-request", request: current })
    dispatch({ type: "cancel-request", request: current })
    assert.equal(owner.getSnapshot().phase, "preparing")
    dispatch({ type: "preparation-committed", request: current })
    assert.equal(owner.getSnapshot().phase, "executing.settling")
    assert.equal(
      effects.some((e) => e.type === "execute-command"),
      false,
    )
    assert.equal(
      effects.filter((e) => e.type === "settle-cancelled-preparation").length,
      1,
    )
  })

  it("forwards running cancellation once and ignores it after the official outcome", () => {
    const { owner, dispatch, effects } = harness()
    let cancellations = 0
    const runningRequest = {
      cancel() {
        cancellations++
      },
    }
    dispatch({ type: "bootstrap-acknowledged" })
    dispatch({
      type: "exclusive-intent",
      command: "repo.clone",
      request: runningRequest,
    })
    dispatch({ type: "preparation-committed", request: runningRequest })
    dispatch({ type: "input-prepared", request: runningRequest })
    dispatch({ type: "cancel-request", request: runningRequest })
    dispatch({ type: "cancel-request", request: runningRequest })
    assert.equal(cancellations, 1)
    dispatch({
      type: "outcome-fixed",
      request: runningRequest,
      completion: { operation: {} as never, outcome: {} as never },
    })
    dispatch({ type: "cancel-request", request: runningRequest })
    assert.equal(cancellations, 1)
    assert.throws(() => owner.startWorkflow("course.list", request()))
    dispatch({ type: "settlement-acknowledged", request: runningRequest })
    assert.equal(owner.getSnapshot().phase, "interactive")
    assert.equal(effects.at(-1)?.type, "release-command")
  })

  it("does not cancel a running effect twice when close follows cancellation", () => {
    const state = {
      phase: "executing.running" as const,
      ...command,
      cancellationAccepted: true,
    }
    const result = hostAdmissionReducer(state, {
      type: "host-start",
      source: "window-close",
      request: request(),
    })
    assert.deepEqual(result.effects, [
      { type: "disable-input" },
      { type: "end-host", reason: "abort" },
    ])
  })

  it("fails closed on a foreign request or an out-of-stage follow-up", () => {
    for (const event of [
      { type: "cancel-request", request: request() },
      {
        type: "outcome-fixed",
        request: current,
        completion: { operation: {} as never, outcome: {} as never },
      },
      { type: "input-prepared", request: current },
    ] satisfies HostAdmissionEvent[]) {
      const result = hostAdmissionReducer(
        { phase: "preparing", stage: "bundle-pending", ...command },
        event,
      )
      assert.equal(result.state.phase, "terminal")
      assert.deepEqual(result.effects, [
        { type: "disable-input" },
        { type: "end-host", reason: "failure" },
      ])
    }
  })
})

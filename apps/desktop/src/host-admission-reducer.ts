import type {
  HostAdmissionEffect,
  HostAdmissionEvent,
  HostAdmissionState,
  HostAdmissionTransition,
  HostCloseReason,
  HostRequest,
} from "./host-admission-model"
import {
  desktopHostStarts,
  desktopShellActions,
  desktopWorkflowStarts,
} from "./host-entry-inventory"

function transition(
  state: HostAdmissionState,
  decision: HostAdmissionTransition["decision"] = "accepted",
  effects: readonly HostAdmissionEffect[] = [],
): HostAdmissionTransition {
  return { state, decision, effects }
}

function executionState(
  state: Extract<HostAdmissionState, { command: unknown }>,
  phase: "executing.running" | "executing.settling",
): HostAdmissionState {
  const command = {
    request: state.request,
    command: state.command,
    cancellationAccepted: state.cancellationAccepted,
  }
  return phase === "executing.running"
    ? { ...command, phase }
    : { ...command, phase, completion: null }
}

function cancellationEffects(state: HostAdmissionState): HostAdmissionEffect[] {
  if ("calls" in state) {
    return [...state.calls].map((call) => ({ type: "cancel-call", call }))
  }
  if (state.phase === "executing.running" && !state.cancellationAccepted) {
    return [{ type: "cancel-effect", request: state.request }]
  }
  return []
}

function fail(
  state: HostAdmissionState,
  error: unknown,
): HostAdmissionTransition {
  return transition({ phase: "terminal", error }, "terminal", [
    ...cancellationEffects(state),
    // An aborting/ready close already handed ending to the terminal owner.
    ...(state.phase === "closing.aborting" || state.phase === "closing.ready"
      ? []
      : [{ type: "end-host", reason: "failure" } as const]),
  ])
}

function close(
  state: HostAdmissionState,
  reason: HostCloseReason,
  request: HostRequest,
): HostAdmissionTransition {
  if (reason === "update-restart" && state.phase !== "interactive") {
    return transition(state, "busy")
  }
  switch (state.phase) {
    case "interactive":
      return state.calls.size === 0
        ? transition(
            { phase: "closing.preparing", reason, request },
            "accepted",
            [{ type: "prepare-close", request }],
          )
        : transition({
            phase: "closing.draining",
            calls: state.calls,
            reason,
            request,
          })
    case "starting":
    case "preparing":
    case "executing.running":
    case "executing.settling":
      return transition({ phase: "closing.aborting" }, "accepted", [
        ...cancellationEffects(state),
        { type: "end-host", reason: "abort" },
      ])
    default:
      return transition(state, "ignored")
  }
}

export function hostAdmissionReducer(
  state: HostAdmissionState,
  event: HostAdmissionEvent,
): HostAdmissionTransition {
  if (state.phase === "terminal") return transition(state, "ignored")
  switch (event.type) {
    case "terminal":
      return fail(state, event.error)
    case "workflow-start": {
      const start = desktopWorkflowStarts[event.workflow]
      const permitted =
        (state.phase === "starting" &&
          (start === "startup" || start === "startup-or-ordinary")) ||
        (state.phase === "interactive" &&
          (start === "ordinary" || start === "startup-or-ordinary"))
      if (!permitted || !("calls" in state)) return transition(state, "busy")
      if (state.calls.has(event.call))
        return fail(state, new Error("An accepted call was started twice."))
      return transition({
        ...state,
        calls: new Set([...state.calls, event.call]),
      })
    }
    case "call-settled": {
      if (!("calls" in state) || !state.calls.has(event.call))
        return transition(state, "ignored")
      const calls = new Set(state.calls)
      calls.delete(event.call)
      if (state.phase === "closing.draining" && calls.size === 0) {
        return transition(
          {
            phase: "closing.preparing",
            reason: state.reason,
            request: state.request,
          },
          "accepted",
          [{ type: "prepare-close", request: state.request }],
        )
      }
      return transition({ ...state, calls })
    }
    case "bootstrap-acknowledged":
      if (state.phase !== "starting" || state.calls.size !== 0)
        return fail(
          state,
          new Error(
            "Bootstrap acknowledgement arrived outside settled startup.",
          ),
        )
      return transition({ phase: "interactive", calls: new Set() })
    case "exclusive-intent":
      if (state.phase !== "interactive" || state.calls.size !== 0)
        return transition(state, "busy")
      if (desktopWorkflowStarts[event.command] !== "exclusive")
        return fail(state, new Error("Unknown exclusive command."))
      return transition(
        {
          phase: "preparing",
          stage: "bundle-pending",
          command: event.command,
          request: event.request,
          cancellationAccepted: false,
        },
        "accepted",
        [{ type: "prepare-command", request: event.request }],
      )
    case "shell-action": {
      const presentation =
        desktopShellActions[event.action] === "presentation-only"
      const allowed =
        state.phase === "interactive" ||
        (presentation &&
          (state.phase === "starting" ||
            state.phase === "preparing" ||
            state.phase === "executing.running" ||
            state.phase === "executing.settling"))
      return transition(state, allowed ? "accepted" : "busy")
    }
    case "host-start":
      return close(state, desktopHostStarts[event.source], event.request)
    case "update-restart":
      return close(state, "update-restart", event.request)
  }

  // Every request follow-up proves the live resource before its stage.
  if (!("request" in state) || state.request !== event.request)
    return fail(
      state,
      new Error("A follow-up does not belong to the current request."),
    )
  switch (event.type) {
    case "cancel-request":
      if (state.phase === "executing.settling")
        return transition(state, "ignored")
      if (state.phase !== "preparing" && state.phase !== "executing.running")
        break
      if (state.cancellationAccepted) return transition(state, "ignored")
      return transition(
        { ...state, cancellationAccepted: true },
        "accepted",
        state.phase === "executing.running"
          ? [{ type: "cancel-effect", request: state.request }]
          : [],
      )
    case "preparation-committed":
      if (state.phase !== "preparing" || state.stage !== "bundle-pending") break
      if (state.cancellationAccepted)
        return transition(
          executionState(state, "executing.settling"),
          "accepted",
          [{ type: "settle-cancelled-preparation", request: state.request }],
        )
      return transition({ ...state, stage: "input-pending" })
    case "input-prepared":
      if (state.phase !== "preparing" || state.stage !== "input-pending") break
      return state.cancellationAccepted
        ? transition(executionState(state, "executing.settling"), "accepted", [
            { type: "settle-cancelled-preparation", request: state.request },
          ])
        : transition(executionState(state, "executing.running"), "accepted", [
            { type: "execute-command", request: state.request },
          ])
    case "outcome-fixed":
      if (state.phase !== "executing.running") break
      return transition({
        ...state,
        phase: "executing.settling",
        completion: event.completion,
      })
    case "settlement-acknowledged":
      if (state.phase !== "executing.settling") break
      return transition(
        { phase: "interactive", calls: new Set() },
        "accepted",
        [{ type: "release-command", request: state.request }],
      )
    case "close-ready":
      if (state.phase !== "closing.preparing") break
      return transition(
        { phase: "closing.ready", reason: state.reason },
        "accepted",
        [{ type: "end-host", reason: state.reason }],
      )
  }
  return fail(
    state,
    new Error(`Request message ${event.type} is invalid in ${state.phase}.`),
  )
}

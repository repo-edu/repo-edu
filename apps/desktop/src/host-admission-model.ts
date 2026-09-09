import type {
  ExclusiveCommandId,
  ExclusiveCommandOutcome,
  ExclusiveRequestOperation,
  OrdinaryWorkflowId,
} from "@repo-edu/application-contract"
import type {
  DesktopHostStart,
  DesktopShellAction,
} from "./host-entry-inventory"

/** Live resources, never serialised identities or a second lifetime owner. */
export type AcceptedHostCall = { cancel(): void }
export type HostRequest = { cancel(): void }
export type HostCloseReason = "close" | "update-restart"
type Calls = ReadonlySet<AcceptedHostCall>
type Command = {
  request: HostRequest
  command: ExclusiveCommandId
  cancellationAccepted: boolean
}
export type HostCommandCompletion = {
  operation: ExclusiveRequestOperation
  outcome: ExclusiveCommandOutcome<ExclusiveCommandId>
}

export type HostAdmissionState =
  | { phase: "starting"; calls: Calls }
  | { phase: "interactive"; calls: Calls }
  | ({
      phase: "preparing"
      stage: "bundle-pending" | "input-pending"
    } & Command)
  | ({ phase: "executing.running" } & Command)
  | ({
      phase: "executing.settling"
      completion: HostCommandCompletion | null
    } & Command)
  | {
      phase: "closing.draining"
      calls: Calls
      reason: HostCloseReason
      request: HostRequest
    }
  | {
      phase: "closing.preparing"
      reason: HostCloseReason
      request: HostRequest
    }
  | { phase: "closing.ready"; reason: HostCloseReason }
  | { phase: "closing.installing" }
  | { phase: "closing.aborting" }
  | { phase: "terminal"; error: unknown }

export type HostAdmissionEvent =
  | {
      type: "workflow-start"
      workflow: OrdinaryWorkflowId
      call: AcceptedHostCall
    }
  | { type: "call-settled"; call: AcceptedHostCall }
  | { type: "bootstrap-acknowledged" }
  | {
      type: "exclusive-intent"
      command: ExclusiveCommandId
      request: HostRequest
    }
  | { type: "shell-action"; action: DesktopShellAction }
  | { type: "host-start"; source: DesktopHostStart; request: HostRequest }
  | { type: "update-restart"; request: HostRequest }
  | { type: "update-ending-confirmed" }
  | { type: "cancel-request"; request: HostRequest }
  | { type: "preparation-committed"; request: HostRequest }
  | { type: "input-prepared"; request: HostRequest }
  | {
      type: "outcome-fixed"
      request: HostRequest
      completion: HostCommandCompletion
    }
  | { type: "settlement-acknowledged"; request: HostRequest }
  | { type: "close-ready"; request: HostRequest }
  | { type: "terminal"; error: unknown }

/** The reducer emits cancellation against live resources; the owner performs it itself. */
export type HostAdmissionCancellation =
  | { type: "cancel-call"; call: AcceptedHostCall }
  | { type: "cancel-effect"; request: HostRequest }

/** Every other effect reaches the desktop composition. */
export type HostAdmissionHostEffect =
  | { type: "disable-input" }
  | { type: "prepare-command"; request: HostRequest }
  | { type: "execute-command"; request: HostRequest }
  | { type: "settle-cancelled-preparation"; request: HostRequest }
  | { type: "release-command"; request: HostRequest }
  | { type: "prepare-close"; request: HostRequest }
  | { type: "end-host"; reason: HostCloseReason | "abort" | "failure" }
  | { type: "install-update" }
  | { type: "exit-failed" }

export type HostAdmissionEffect =
  | HostAdmissionCancellation
  | HostAdmissionHostEffect

export type HostAdmissionTransition = {
  state: HostAdmissionState
  decision: "accepted" | "busy" | "ignored" | "terminal"
  effects: readonly HostAdmissionEffect[]
}

export function initialHostAdmissionState(): HostAdmissionState {
  return { phase: "starting", calls: new Set() }
}

/** The set is also the count: settlement cannot decrement the same call twice. */
export function acceptedHostCallCount(state: HostAdmissionState): number {
  return "calls" in state ? state.calls.size : 0
}

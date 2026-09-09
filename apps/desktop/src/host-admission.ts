import {
  HostAdmissionRefusedError,
  type WorkflowId,
} from "@repo-edu/application-contract"
import {
  type AcceptedHostCall,
  type HostAdmissionEvent,
  type HostAdmissionHostEffect,
  initialHostAdmissionState,
} from "./host-admission-model"
import { hostAdmissionReducer } from "./host-admission-reducer"
import {
  type DesktopShellAction,
  desktopWorkflowStarts,
} from "./host-entry-inventory"

export class HostAdmission {
  private state = initialHostAdmissionState()

  /** Cancellation reaches its live resource here; every other effect goes to the host. */
  constructor(
    private readonly perform: (effect: HostAdmissionHostEffect) => void,
  ) {}

  getSnapshot = () => this.state

  /** Source adapters report failure here; the reducer alone owns terminal entry. */
  terminal = (error: unknown): void => {
    if (this.state.phase === "terminal") return
    this.dispatch({ type: "terminal", error })
  }

  dispatch(event: HostAdmissionEvent) {
    const next = hostAdmissionReducer(this.state, event)
    this.state = next.state
    for (const effect of next.effects) {
      switch (effect.type) {
        case "cancel-call":
          effect.call.cancel()
          break
        case "cancel-effect":
          effect.request.cancel()
          break
        default:
          this.perform(effect)
      }
    }
    return next.decision
  }

  startWorkflow(workflow: WorkflowId, call: AcceptedHostCall): () => void {
    if (
      this.dispatch({ type: "workflow-start", workflow, call }) !== "accepted"
    ) {
      // A start the renderer may make in ordinary use is refused as ordinary
      // work, whichever phase refused it.
      const start = desktopWorkflowStarts[workflow]
      if (start === "ordinary" || start === "startup-or-ordinary")
        throw new HostAdmissionRefusedError()
      throw new Error(
        `The desktop is not accepting ${workflow} in ${this.state.phase}.`,
      )
    }
    return () => {
      this.dispatch({ type: "call-settled", call })
    }
  }

  admitShell(action: DesktopShellAction): void {
    if (this.dispatch({ type: "shell-action", action }) !== "accepted") {
      throw new Error(
        `The desktop is not accepting ${action} in ${this.state.phase}.`,
      )
    }
  }
}

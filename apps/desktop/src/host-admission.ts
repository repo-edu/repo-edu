import type { WorkflowId } from "@repo-edu/application-contract"
import {
  type AcceptedHostCall,
  type HostAdmissionEffect,
  type HostAdmissionEvent,
  initialHostAdmissionState,
} from "./host-admission-model"
import { hostAdmissionReducer } from "./host-admission-reducer"
import type { DesktopShellAction } from "./host-entry-inventory"

export class HostAdmission {
  private state = initialHostAdmissionState()

  constructor(
    private readonly perform: (effect: HostAdmissionEffect) => void,
  ) {}

  getSnapshot = () => this.state

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

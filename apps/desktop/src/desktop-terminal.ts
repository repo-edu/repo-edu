import {
  type ChildProcessLifetimeController,
  type ChildProcessLifetimeEnding,
  childProcessUnconfirmedTreeMessage,
} from "@repo-edu/host-node/child-process-lifetime"
import type {
  HostAdmissionState,
  HostCloseReason,
} from "./host-admission-model"

export function isDesktopEnding(state: HostAdmissionState): boolean {
  return state.phase === "terminal" || state.phase.startsWith("closing.")
}

/** The reducer issues this body once. It owns no competing phase or deadline. */
export async function endDesktopHost(options: {
  reason: HostCloseReason | "abort" | "failure"
  controller: Pick<ChildProcessLifetimeController, "stopAndConfirm">
  snapshot(): HostAdmissionState
  disableInput(): void
  closeStorage(): void
  warn(message: string): void
  report(error: unknown): void
  exit(code: number): void
  installUpdate(): void
}): Promise<void> {
  options.disableInput()
  let ending: ChildProcessLifetimeEnding
  try {
    ending = await options.controller.stopAndConfirm()
    options.closeStorage()
  } catch (error) {
    try {
      options.report(error)
    } finally {
      options.exit(1)
    }
    return
  }
  if (ending.outcome === "unconfirmed") {
    try {
      options.warn(childProcessUnconfirmedTreeMessage)
    } catch (error) {
      options.report(error)
    } finally {
      options.exit(1)
    }
    return
  }
  // A detected failure can supersede a close while its ending is pending.
  try {
    if (options.snapshot().phase === "terminal") options.exit(1)
    else if (options.reason === "update-restart") options.installUpdate()
    else options.exit(0)
  } catch (error) {
    try {
      options.report(error)
    } finally {
      options.exit(1)
    }
  }
}

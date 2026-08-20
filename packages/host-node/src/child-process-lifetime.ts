export type {
  ChildProcessLifetimeLaunch,
  ChildProcessLifetimePlatformAdapter,
  ChildProcessLifetimeProof,
  ChildProcessLifetimeResult,
  ChildProcessLifetimeStopPolicy,
  ChildProcessOutcome,
  ChildProcessSecondaryFailureDiagnostic,
  ChildProcessTargetResult,
  OwnedChildProcessTree,
  PlatformChildProcessStopResult,
  PlatformOwnedChildProcessTree,
} from "./child-process-lifetime-contract.js"
export {
  ChildProcessTreeUnconfirmedError,
  createChildProcessLaunchAbortError,
  isPendingLaunchStoppedError,
  PendingLaunchStoppedError,
} from "./child-process-lifetime-contract.js"
export type {
  ChildProcessLifetimeController,
  ChildProcessLifetimeControllerOptions,
} from "./child-process-lifetime-controller.js"
export {
  childProcessForcedStopConfirmationPeriodMs,
  childProcessLifetimeStopPolicy,
  childProcessStopGracePeriodMs,
  childProcessUnconfirmedTreeMessage,
  createChildProcessLifetimeController,
} from "./child-process-lifetime-controller.js"

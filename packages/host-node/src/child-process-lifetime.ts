export type {
  ChildProcessLifetimeLaunch,
  ChildProcessLifetimePlatformAdapter,
  ChildProcessLifetimeResult,
  ChildProcessLifetimeStopPolicy,
  OwnedChildProcessTree,
} from "./child-process-lifetime-contract.js"
export {
  ChildProcessOutcomeUnknownError,
  createChildProcessLaunchAbortError,
  isPendingLaunchStoppedError,
  PendingLaunchStoppedError,
} from "./child-process-lifetime-contract.js"
export type {
  ChildProcessLifetimeController,
  ChildProcessLifetimeControllerOptions,
} from "./child-process-lifetime-controller.js"
export {
  childProcessStopGracePeriodMs,
  createChildProcessLifetimeController,
} from "./child-process-lifetime-controller.js"

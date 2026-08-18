export type {
  ChildProcessLifetimeController,
  ChildProcessLifetimeControllerOptions,
  ChildProcessLifetimeLaunch,
  ChildProcessLifetimePlatformAdapter,
  ChildProcessLifetimeResult,
  OwnedChildProcessTree,
} from "./child-process-lifetime-controller.js"
export {
  ChildProcessOutcomeUnknownError,
  childProcessStopGracePeriodMs,
  createChildProcessLaunchAbortError,
  createChildProcessLifetimeController,
  isPendingLaunchStoppedError,
  PendingLaunchStoppedError,
} from "./child-process-lifetime-controller.js"

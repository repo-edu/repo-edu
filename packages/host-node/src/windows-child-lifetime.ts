export type {
  WindowsChildLifetimeEvidence,
  WindowsChildLifetimeRuntime,
  WindowsLauncherReadinessEvidence,
} from "./windows-child-lifetime-platform.js"
export {
  createWindowsChildProcessLifetimePlatform,
  proveWindowsLauncherReadiness,
} from "./windows-child-lifetime-platform.js"
export type { WindowsChildLifetimeRun } from "./windows-child-lifetime-proof.js"
export { runWindowsChildLifetimeTarget } from "./windows-child-lifetime-proof.js"
export type { WindowsChildLifetimeTarget } from "./windows-launcher-protocol.js"

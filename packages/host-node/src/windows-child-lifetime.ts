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

export function resolveWindowsChildLifetimeLauncherEntryUrl(): URL {
  return new URL(
    "../resources/host-child-lifetime/windows-launcher.cjs",
    import.meta.url,
  )
}

export type {
  WindowsChildLifetimeProofTarget,
  WindowsChildLifetimeRun,
} from "./windows-child-lifetime-proof.js"
export { runWindowsChildLifetimeTarget } from "./windows-child-lifetime-proof.js"
export type {
  WindowsChildLifetimeEvidence,
  WindowsChildLifetimeRuntime,
  WindowsLauncherReadinessEvidence,
} from "./windows-child-process-lifetime-adapter.js"
export {
  createWindowsChildProcessLifetimeAdapter,
  proveWindowsLauncherReadiness,
} from "./windows-child-process-lifetime-adapter.js"
export type { WindowsChildLifetimeTarget } from "./windows-launcher-protocol.js"

export function resolveWindowsChildProcessLifetimeLauncherEntryUrl(): URL {
  return new URL(
    "../resources/host-child-lifetime/windows-launcher.cjs",
    import.meta.url,
  )
}

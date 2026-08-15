import { fileURLToPath } from "node:url"
import {
  type ChildProcessLifetimeAdapter,
  type ChildProcessLifetimePlatform,
  createChildProcessLifetimeAdapter,
} from "@repo-edu/host-node/child-process-lifetime"

type WindowsChildLifetimeRuntime = {
  readonly executablePath: string
  readonly launcherEntryPath: string
  readonly runAsNode: boolean
}

type WindowsChildLifetimeModule = {
  createWindowsChildProcessLifetimePlatform(
    runtime: WindowsChildLifetimeRuntime,
  ): ChildProcessLifetimePlatform
  resolveWindowsChildLifetimeLauncherEntryUrl(): URL
}

type WindowsPlatformLoader = () => Promise<WindowsChildLifetimeModule>

export type CommandLineChildProcessLifetimeOptions = {
  readonly executablePath?: string
  readonly launcherEntryUrl?: URL
  readonly loadWindowsPlatform?: WindowsPlatformLoader
  readonly runtimePlatform?: NodeJS.Platform
}

async function loadWindowsPlatform(): Promise<WindowsChildLifetimeModule> {
  return await import("@repo-edu/host-node/windows-child-lifetime")
}

export async function createCommandLineChildProcessLifetimeAdapter(
  options: CommandLineChildProcessLifetimeOptions = {},
): Promise<ChildProcessLifetimeAdapter> {
  const runtimePlatform = options.runtimePlatform ?? process.platform
  if (runtimePlatform !== "win32") {
    return createChildProcessLifetimeAdapter()
  }

  const windowsModule = await (
    options.loadWindowsPlatform ?? loadWindowsPlatform
  )()
  const windows = windowsModule.createWindowsChildProcessLifetimePlatform({
    executablePath: options.executablePath ?? process.execPath,
    launcherEntryPath: fileURLToPath(
      options.launcherEntryUrl ??
        windowsModule.resolveWindowsChildLifetimeLauncherEntryUrl(),
    ),
    runAsNode: false,
  })
  return createChildProcessLifetimeAdapter({ windows })
}

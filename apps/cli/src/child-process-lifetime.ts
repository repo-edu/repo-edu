import { fileURLToPath } from "node:url"
import {
  type ChildProcessLifetimeController,
  type ChildProcessLifetimePlatformAdapter,
  createChildProcessLifetimeController,
} from "@repo-edu/host-node/child-process-lifetime"

type WindowsChildLifetimeRuntime = {
  readonly executablePath: string
  readonly launcherEntryPath: string
  readonly runAsNode: boolean
}

type WindowsChildProcessLifetimeModule = {
  createWindowsChildProcessLifetimeAdapter(
    runtime: WindowsChildLifetimeRuntime,
  ): ChildProcessLifetimePlatformAdapter
  resolveWindowsChildProcessLifetimeLauncherEntryUrl(): URL
}

type WindowsAdapterModuleLoader =
  () => Promise<WindowsChildProcessLifetimeModule>

export type CommandLineChildProcessLifetimeOptions = {
  readonly executablePath?: string
  readonly launcherEntryUrl?: URL
  readonly loadWindowsAdapterModule?: WindowsAdapterModuleLoader
  readonly runtimePlatform?: NodeJS.Platform
}

async function loadWindowsAdapterModule(): Promise<WindowsChildProcessLifetimeModule> {
  return await import("@repo-edu/host-node/windows-child-lifetime")
}

export async function createCommandLineChildProcessLifetimeController(
  options: CommandLineChildProcessLifetimeOptions = {},
): Promise<ChildProcessLifetimeController> {
  const runtimePlatform = options.runtimePlatform ?? process.platform
  if (runtimePlatform !== "win32") {
    return createChildProcessLifetimeController()
  }

  const windowsModule = await (
    options.loadWindowsAdapterModule ?? loadWindowsAdapterModule
  )()
  const windowsAdapter = windowsModule.createWindowsChildProcessLifetimeAdapter(
    {
      executablePath: options.executablePath ?? process.execPath,
      launcherEntryPath: fileURLToPath(
        options.launcherEntryUrl ??
          windowsModule.resolveWindowsChildProcessLifetimeLauncherEntryUrl(),
      ),
      runAsNode: false,
    },
  )
  return createChildProcessLifetimeController({ windowsAdapter })
}

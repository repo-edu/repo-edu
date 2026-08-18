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

type WindowsChildLifetimeModule = {
  createWindowsChildProcessLifetimeAdapter(
    runtime: WindowsChildLifetimeRuntime,
  ): ChildProcessLifetimePlatformAdapter
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

export async function createCommandLineChildProcessLifetimeController(
  options: CommandLineChildProcessLifetimeOptions = {},
): Promise<ChildProcessLifetimeController> {
  const runtimePlatform = options.runtimePlatform ?? process.platform
  if (runtimePlatform !== "win32") {
    return createChildProcessLifetimeController()
  }

  const windowsModule = await (
    options.loadWindowsPlatform ?? loadWindowsPlatform
  )()
  const windowsAdapter = windowsModule.createWindowsChildProcessLifetimeAdapter(
    {
      executablePath: options.executablePath ?? process.execPath,
      launcherEntryPath: fileURLToPath(
        options.launcherEntryUrl ??
          windowsModule.resolveWindowsChildLifetimeLauncherEntryUrl(),
      ),
      runAsNode: false,
    },
  )
  return createChildProcessLifetimeController({ windowsAdapter })
}

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

type WindowsPlatformLoader = (
  runtime: WindowsChildLifetimeRuntime,
) => Promise<ChildProcessLifetimePlatform>

export type CommandLineChildProcessLifetimeOptions = {
  readonly executablePath?: string
  readonly launcherEntryUrl?: URL
  readonly loadWindowsPlatform?: WindowsPlatformLoader
  readonly runtimePlatform?: NodeJS.Platform
}

const windowsLauncherEntryUrl = new URL(
  "../../desktop/resources/host-child-lifetime/windows-launcher.cjs",
  import.meta.url,
)

async function loadWindowsPlatform(
  runtime: WindowsChildLifetimeRuntime,
): Promise<ChildProcessLifetimePlatform> {
  const { createWindowsChildProcessLifetimePlatform } = await import(
    "@repo-edu/host-node/windows-child-lifetime"
  )
  return createWindowsChildProcessLifetimePlatform(runtime)
}

export async function createCommandLineChildProcessLifetimeAdapter(
  options: CommandLineChildProcessLifetimeOptions = {},
): Promise<ChildProcessLifetimeAdapter> {
  const runtimePlatform = options.runtimePlatform ?? process.platform
  if (runtimePlatform !== "win32") {
    return createChildProcessLifetimeAdapter()
  }

  const windows = await (options.loadWindowsPlatform ?? loadWindowsPlatform)({
    executablePath: options.executablePath ?? process.execPath,
    launcherEntryPath: fileURLToPath(
      options.launcherEntryUrl ?? windowsLauncherEntryUrl,
    ),
    runAsNode: false,
  })
  return createChildProcessLifetimeAdapter({ windows })
}

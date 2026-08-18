import { fileURLToPath } from "node:url"
import {
  type ChildProcessLifetimeController,
  type ChildProcessLifetimePlatformAdapter,
  childProcessUnconfirmedTreeMessage,
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
  readonly exit?: (code: number) => never
  readonly launcherEntryUrl?: URL
  readonly loadWindowsAdapterModule?: WindowsAdapterModuleLoader
  readonly runtimePlatform?: NodeJS.Platform
  readonly writeStderr?: (message: string) => void
}

async function loadWindowsAdapterModule(): Promise<WindowsChildProcessLifetimeModule> {
  return await import("@repo-edu/host-node/windows-child-lifetime")
}

export async function createCommandLineChildProcessLifetimeController(
  options: CommandLineChildProcessLifetimeOptions = {},
): Promise<ChildProcessLifetimeController> {
  const exit = options.exit ?? ((code: number): never => process.exit(code))
  const writeStderr =
    options.writeStderr ??
    ((message: string): void => {
      process.stderr.write(message)
    })
  const controllerOptions = {
    diagnosticSink(diagnostic: {
      readonly command: string
      readonly failure: unknown
    }) {
      const failure =
        diagnostic.failure instanceof Error
          ? diagnostic.failure.message
          : String(diagnostic.failure)
      writeStderr(
        `Child-process secondary failure for ${diagnostic.command}: ${failure}\n`,
      )
    },
    onUnconfirmedTree(): never {
      writeStderr(`${childProcessUnconfirmedTreeMessage}\n`)
      return exit(1)
    },
  }
  const runtimePlatform = options.runtimePlatform ?? process.platform
  if (runtimePlatform !== "win32") {
    return createChildProcessLifetimeController({
      ...controllerOptions,
      runtimePlatform,
    })
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
  return createChildProcessLifetimeController({
    ...controllerOptions,
    runtimePlatform,
    windowsAdapter,
  })
}

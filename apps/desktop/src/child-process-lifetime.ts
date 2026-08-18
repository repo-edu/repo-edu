import {
  type ChildProcessLifetimeController,
  type ChildProcessLifetimePlatformAdapter,
  childProcessUnconfirmedTreeMessage,
  createChildProcessLifetimeController,
} from "@repo-edu/host-node/child-process-lifetime"

export type DesktopChildProcessLifetimeOptions = {
  readonly appName: string
  readonly exit: (code: number) => never
  readonly runtimePlatform?: NodeJS.Platform
  readonly showErrorBox: (title: string, message: string) => void
  readonly windowsAdapter?: ChildProcessLifetimePlatformAdapter
  readonly writeStderr: (message: string) => void
}

function errorText(error: unknown): string {
  return error instanceof Error ? (error.stack ?? error.message) : String(error)
}

export function createDesktopChildProcessLifetimeController(
  options: DesktopChildProcessLifetimeOptions,
): ChildProcessLifetimeController {
  return createChildProcessLifetimeController({
    diagnosticSink(diagnostic) {
      options.writeStderr(
        `[desktop] child-process-secondary-failure ${diagnostic.command} ${errorText(diagnostic.failure)}\n`,
      )
    },
    onUnconfirmedTree(): never {
      options.showErrorBox(
        `${options.appName} must close`,
        childProcessUnconfirmedTreeMessage,
      )
      return options.exit(1)
    },
    runtimePlatform: options.runtimePlatform,
    windowsAdapter: options.windowsAdapter,
  })
}

import {
  type ChildProcessLifetimeController,
  type ChildProcessLifetimePlatformAdapter,
  childProcessUnconfirmedTreeMessage,
  createChildProcessLifetimeController,
} from "@repo-edu/host-node/child-process-lifetime"

export type DesktopChildProcessLifetimeOptions = {
  readonly appName: string
  readonly runtimePlatform?: NodeJS.Platform
  readonly showWarning: (title: string, message: string) => void
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
    warnUnconfirmedTree() {
      options.showWarning(
        `${options.appName} warning`,
        childProcessUnconfirmedTreeMessage,
      )
    },
    runtimePlatform: options.runtimePlatform,
    windowsAdapter: options.windowsAdapter,
  })
}

import {
  type ChildProcessLifetimeController,
  type ChildProcessLifetimePlatformAdapter,
  childProcessUnconfirmedTreeMessage,
  createChildProcessLifetimeController,
} from "@repo-edu/host-node/child-process-lifetime"

export type PlanImplementationChildProcessLifetimeOptions = {
  readonly runtimePlatform?: NodeJS.Platform
  readonly windowsAdapter?: ChildProcessLifetimePlatformAdapter
  readonly writeStderr?: (message: string) => void
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function createPlanImplementationChildProcessLifetimeController(
  options: PlanImplementationChildProcessLifetimeOptions = {},
): ChildProcessLifetimeController {
  const writeStderr =
    options.writeStderr ??
    ((message: string): void => {
      process.stderr.write(message)
    })

  return createChildProcessLifetimeController({
    diagnosticSink(diagnostic) {
      writeStderr(
        `implement-plan: child-process-secondary-failure ${diagnostic.command}: ${errorMessage(diagnostic.failure)}\n`,
      )
    },
    warnUnconfirmedTree() {
      writeStderr(`${childProcessUnconfirmedTreeMessage}\n`)
    },
    runtimePlatform: options.runtimePlatform,
    windowsAdapter: options.windowsAdapter,
  })
}

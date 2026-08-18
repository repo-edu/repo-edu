import {
  type ChildProcessLifetimeController,
  type ChildProcessLifetimePlatformAdapter,
  childProcessUnconfirmedTreeMessage,
  createChildProcessLifetimeController,
} from "@repo-edu/host-node/child-process-lifetime"

export type PlanImplementationChildProcessLifetimeOptions = {
  readonly exit?: (code: number) => never
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
  const exit = options.exit ?? ((code: number): never => process.exit(code))
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
    onUnconfirmedTree(): never {
      writeStderr(`${childProcessUnconfirmedTreeMessage}\n`)
      return exit(1)
    },
    runtimePlatform: options.runtimePlatform,
    windowsAdapter: options.windowsAdapter,
  })
}

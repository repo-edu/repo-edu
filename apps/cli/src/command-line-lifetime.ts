import type { ChildProcessLifetimeController } from "@repo-edu/host-node/child-process-lifetime"

export type CommandLineLifetimeProcess = Pick<
  NodeJS.Process,
  "exit" | "off" | "on"
> & {
  exitCode?: number
  stderr: Pick<NodeJS.WriteStream, "write">
}

export type CommandLineLifetimeOptions = {
  childProcessLifetimeController: Pick<
    ChildProcessLifetimeController,
    "stopAndConfirm"
  >
  releaseProgramGate: () => void
  runtimeProcess?: CommandLineLifetimeProcess
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function runWithCommandLineLifetime(
  options: CommandLineLifetimeOptions,
  run: (signal: AbortSignal) => Promise<void>,
): Promise<void> {
  const runtimeProcess = options.runtimeProcess ?? process
  const abortController = new AbortController()
  let shutdown: Promise<void> | undefined

  const stopAndRelease = (): Promise<void> => {
    shutdown ??= (async () => {
      await options.childProcessLifetimeController.stopAndConfirm()
      options.releaseProgramGate()
    })()
    return shutdown
  }

  const reportShutdownFailure = (error: unknown): void => {
    runtimeProcess.stderr.write(
      `Child-process shutdown failed: ${errorText(error)}\n`,
    )
    runtimeProcess.exitCode = 1
  }

  const stopAndExit = async (exitCode: number): Promise<never> => {
    await stopAndRelease()
    return runtimeProcess.exit(exitCode)
  }

  const onSigint = (): void => {
    if (!abortController.signal.aborted) {
      abortController.abort()
      runtimeProcess.stderr.write("\nAborting...\n")
      return
    }

    void stopAndExit(130).catch(reportShutdownFailure)
  }

  const onSigterm = (): void => {
    abortController.abort()
    void stopAndExit(143).catch(reportShutdownFailure)
  }

  runtimeProcess.on("SIGINT", onSigint)
  runtimeProcess.on("SIGTERM", onSigterm)

  try {
    await run(abortController.signal)
  } finally {
    try {
      await stopAndRelease()
    } finally {
      runtimeProcess.off("SIGINT", onSigint)
      runtimeProcess.off("SIGTERM", onSigterm)
    }
  }
}

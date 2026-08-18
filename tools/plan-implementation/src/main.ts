import { createPlanImplementationChildProcessLifetimeController } from "./child-process-lifetime.js"
import { createCodingAdapter } from "./coding-adapter.js"
import { createPlanImplementationCommand } from "./command.js"
import { runPlanImplementation } from "./plan-runner.js"
import { resetPlanCursor } from "./reset-cursor.js"
import { createStepCommandExecutor } from "./step-checks.js"
import { createTerminalDisplay } from "./terminal-output.js"
import { createTerminalView } from "./terminal-view.js"

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function main(): Promise<void> {
  const stop = new AbortController()
  const childProcessLifetimeController =
    createPlanImplementationChildProcessLifetimeController()
  const requestStop = (signal: "SIGINT" | "SIGTERM"): void => {
    if (!stop.signal.aborted) {
      stop.abort(`Stop requested by ${signal}.`)
    }
  }
  const onSigint = (): void => requestStop("SIGINT")
  const onSigterm = (): void => requestStop("SIGTERM")
  process.on("SIGINT", onSigint)
  process.on("SIGTERM", onSigterm)

  try {
    await createPlanImplementationCommand({
      async run(request) {
        const result = await runPlanImplementation(
          {
            repoEduRoot: process.cwd(),
            planPath: request.planPath,
            run: request.run,
            signal: stop.signal,
          },
          {
            coding: createCodingAdapter(childProcessLifetimeController),
            commands: createStepCommandExecutor(childProcessLifetimeController),
            ownedChildren: childProcessLifetimeController,
            presentation: createTerminalView(
              createTerminalDisplay(process.stdout),
            ),
          },
        )
        if (result.outcome === "stopped") {
          process.exitCode = 1
        }
      },
      async resetCursor(request) {
        const result = await resetPlanCursor({
          repoEduRoot: process.cwd(),
          planPath: request.planPath,
          nextStep: request.nextStep,
        })
        process.stdout.write(
          `Reset ${result.source.planName} to step ${result.nextStep}: ${result.commitOid}\n`,
        )
      },
    }).parseAsync(process.argv)
  } finally {
    process.off("SIGINT", onSigint)
    process.off("SIGTERM", onSigterm)
    await childProcessLifetimeController.stopAndConfirm()
  }
}

try {
  await main()
} catch (error) {
  process.stderr.write(`implement-plan: ${errorMessage(error)}\n`)
  process.exitCode = 1
}

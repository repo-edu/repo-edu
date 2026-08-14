import { Command, InvalidArgumentError, Option } from "commander"
import type { PlanImplementationRunRequest } from "./contracts.js"

export type RunCommandRequest = {
  readonly planPath: string
  readonly run: PlanImplementationRunRequest
}

export type ResetCursorCommandRequest = {
  readonly planPath: string
  readonly nextStep: number
}

export type PlanImplementationCommandHandlers = {
  readonly run: (request: RunCommandRequest) => Promise<void>
  readonly resetCursor: (request: ResetCursorCommandRequest) => Promise<void>
}

function canonicalPositiveInteger(value: string): number {
  if (!/^[1-9][0-9]*$/.test(value)) {
    throw new InvalidArgumentError(
      "Expected a canonical positive base-10 integer.",
    )
  }
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed)) {
    throw new InvalidArgumentError("The integer exceeds the safe range.")
  }
  return parsed
}

function runRequest(options: {
  readonly count?: number
  readonly throughStep?: number
}): PlanImplementationRunRequest {
  if (options.count !== undefined) {
    return { mode: "count", count: options.count }
  }
  if (options.throughStep !== undefined) {
    return { mode: "through-step", throughStep: options.throughStep }
  }
  return { mode: "complete" }
}

export function createPlanImplementationCommand(
  handlers: PlanImplementationCommandHandlers,
): Command {
  const program = new Command()
    .name("implement-plan")
    .description(
      "Implement a committed plan through one fixed, checked Git cursor bound.",
    )
    .argument("<plan-path>", "Path to the committed plan Markdown file.")
    .addOption(
      new Option(
        "--count <n>",
        "Implement at most the next N authorised steps.",
      )
        .argParser(canonicalPositiveInteger)
        .conflicts(["throughStep", "resetCursor"]),
    )
    .addOption(
      new Option(
        "--through-step <n>",
        "Implement through and including absolute step N.",
      )
        .argParser(canonicalPositiveInteger)
        .conflicts(["count", "resetCursor"]),
    )
    .addOption(
      new Option(
        "--reset-cursor <n>",
        "Write an empty cursor-reset commit so step N is next.",
      )
        .argParser(canonicalPositiveInteger)
        .conflicts(["count", "throughStep"]),
    )
    .showHelpAfterError("(See --help for usage.)")
    .action(
      async (
        planPath: string,
        options: {
          readonly count?: number
          readonly resetCursor?: number
          readonly throughStep?: number
        },
      ) => {
        if (options.resetCursor !== undefined) {
          await handlers.resetCursor({
            planPath,
            nextStep: options.resetCursor,
          })
          return
        }
        await handlers.run({ planPath, run: runRequest(options) })
      },
    )

  return program
}

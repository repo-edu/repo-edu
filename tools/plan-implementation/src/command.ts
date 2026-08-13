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
        .conflicts("throughStep"),
    )
    .addOption(
      new Option(
        "--through-step <n>",
        "Implement through and including absolute step N.",
      )
        .argParser(canonicalPositiveInteger)
        .conflicts("count"),
    )
    .showHelpAfterError("(See --help for usage.)")
    .action(
      async (
        planPath: string,
        options: { readonly count?: number; readonly throughStep?: number },
      ) => {
        await handlers.run({ planPath, run: runRequest(options) })
      },
    )

  program
    .command("reset-cursor")
    .description("Write one empty current-branch cursor-reset commit.")
    .argument("<plan-path>", "Path to the committed plan Markdown file.")
    .requiredOption(
      "--next-step <n>",
      "Set the next implementation step.",
      canonicalPositiveInteger,
    )
    .action(
      async (planPath: string, options: { readonly nextStep: number }) => {
        await handlers.resetCursor({
          planPath,
          nextStep: options.nextStep,
        })
      },
    )

  return program
}

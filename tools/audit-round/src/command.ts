import { readdir, realpath, stat } from "node:fs/promises"
import { resolve } from "node:path"
import {
  Argument,
  Command,
  CommanderError,
  InvalidArgumentError,
  Option,
} from "commander"
import { type AssistantRuntime, assistantDependencies } from "./assistant.js"
import { errorMessage } from "./feedback.js"
import { type OutputOptions, RoundOutput } from "./output.js"
import type { Assistant } from "./phase.js"
import { recoveryCommand } from "./requests.js"
import { type RoundInput, type RoundResult, runRound } from "./round.js"
import { prepareAssistants } from "./startup.js"

function stepScope(value: string): string {
  const match = /^([1-9]\d*)(?:-([1-9]\d*))?$/.exec(value)
  if (match === null)
    throw new InvalidArgumentError(
      "Use a positive step number or an increasing range, such as 2-4.",
    )
  const first = Number(match[1])
  const last = Number(match[2] ?? match[1])
  if (
    !Number.isSafeInteger(first) ||
    !Number.isSafeInteger(last) ||
    last < first
  )
    throw new InvalidArgumentError(
      "The step range must use safe positive integers in increasing order.",
    )
  return value
}

export async function checkRepoRoot(cwd: string): Promise<string> {
  const root = await realpath(cwd)
  const workflow = resolve(root, ".agents/skills/audit/references/workflow.md")
  try {
    if (
      (await stat(workflow)).isFile() &&
      (await stat(resolve(root, "pnpm-workspace.yaml"))).isFile() &&
      (await stat(resolve(root, "../plan"))).isDirectory()
    )
      return root
  } catch {
    // Report a command-level location error instead of a missing marker path.
  }
  throw new Error(
    "Run pnpm audit-round from the Repo Edu checkout root beside the plan repository.",
  )
}

export async function runCommand(
  argv: readonly string[],
  runtime: AssistantRuntime,
  options: OutputOptions & {
    readonly emergency: (text: string) => void
    readonly cacheRoot?: string
  },
): Promise<number> {
  const command = new Command("audit-round")
    .description(
      "Run one TypeScript implementation-audit round from the Repo Edu checkout root.",
    )
    .argument("<plan>", "plan filename or path in the sibling plan repository")
    .addArgument(
      new Argument("[scope]", "step number or inclusive step range").argParser(
        stepScope,
      ),
    )
    .addOption(
      new Option(
        "--auditor <assistant>",
        "assistant that audits; Codex always fixes",
      )
        .choices(["claude", "codex"])
        .default("codex"),
    )
    .option("-v, --verbose", "show tool calls as well as assistant text")
    .configureOutput({
      writeOut: (text) => options.terminal.write(text.trimEnd()),
      writeErr: (text) => options.emergency(text.trimEnd()),
    })
    .exitOverride()
  try {
    command.parse([...argv], { from: "user" })
  } catch (error) {
    if (error instanceof CommanderError) return error.exitCode === 0 ? 0 : 2
    throw error
  }

  let output: RoundOutput | undefined
  let result: RoundResult | undefined
  let code = 1
  try {
    const repoRoot = await checkRepoRoot(runtime.cwd)
    const flags = command.opts<{ auditor: Assistant; verbose?: boolean }>()
    const input: RoundInput = {
      repoRoot,
      plan: command.args[0],
      scope: command.args[1],
      auditor: flags.auditor,
    }
    output = new RoundOutput(input, { ...options, verbose: flags.verbose })
    runtime.signal?.throwIfAborted()
    const selections = await prepareAssistants(
      { ...runtime, cwd: repoRoot },
      output,
      { cacheRoot: options.cacheRoot },
    )
    output.models(selections)
    result = await runRound(
      input,
      assistantDependencies(
        { ...runtime, cwd: repoRoot },
        output.phase,
        output.prepareHandover,
      ),
    )
    output.finish(result)
    if (result.status === "failed") {
      const roots = await Promise.all(
        [repoRoot, resolve(repoRoot, "../plan")].map(async (root) => {
          try {
            return `${root}:\n${(await readdir(root)).sort().join("\n")}`
          } catch (error) {
            return `${root}: ${errorMessage(error)}`
          }
        }),
      )
      await output.message(`Files at repository roots:\n${roots.join("\n")}`)
    }
    code = result.status === "failed" ? 1 : 0
  } catch (error) {
    options.terminal.clear()
    options.emergency(`audit-round: ${errorMessage(error)}`)
    // Required recording failures cannot be reported through the failed writer.
    if (result?.status === "failed") {
      options.emergency(
        `[${result.phase}] failed: ${result.reason}\nSession: ${result.sessionId ?? "unavailable"}`,
      )
      if (result.sessionId !== null)
        options.emergency(
          `Resume: ${recoveryCommand({ ...result, sessionId: result.sessionId })}`,
        )
    }
  } finally {
    try {
      output?.close()
    } catch (error) {
      options.emergency(
        `audit-round: closing run files failed: ${errorMessage(error)}`,
      )
      code = 1
    }
  }
  return code
}

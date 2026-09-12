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
import {
  briefRun,
  type OutputOptions,
  RoundOutput,
  type Run,
  roundRun,
} from "./output.js"
import type { Assistant, RoundDependencies } from "./phase.js"
import { recoveryCommand } from "./requests.js"
import {
  type BriefResult,
  type RoundResult,
  runBrief,
  runRound,
} from "./round.js"
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

/** The transcript a brief retells: a round's Markdown pair member at the checkout root. */
async function checkTranscript(
  repoRoot: string,
  transcript: string,
): Promise<string> {
  const path = resolve(repoRoot, transcript)
  let file = false
  try {
    file = (await stat(path)).isFile()
  } catch {
    // The message below names the expected file.
  }
  if (!file || !path.endsWith(".md"))
    throw new Error(
      "Name a round's ROUND-TS-*.md transcript at the Repo Edu checkout root.",
    )
  return path
}

/** What the command line selected, captured by the subcommand actions. */
type Invocation =
  | {
      readonly kind: "round"
      readonly plan: string
      readonly scope?: string
      readonly auditor: Assistant
      readonly verbose?: boolean
    }
  | {
      readonly kind: "brief"
      readonly transcript: string
      readonly verbose?: boolean
    }

function parseInvocation(
  argv: readonly string[],
  options: OutputOptions & { readonly emergency: (text: string) => void },
): Invocation | number {
  let invocation: Invocation | undefined
  const command = new Command("audit-round")
    .description(
      "Run one TypeScript implementation-audit round from the Repo Edu checkout root.",
    )
    .configureOutput({
      writeOut: (text) => options.terminal.write(text.trimEnd()),
      writeErr: (text) => options.emergency(text.trimEnd()),
    })
    .exitOverride()
  command
    .command("round", { isDefault: true })
    .description(
      "Run the audit, vet, rebuttal, fix and brief phases of one round.",
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
        "assistant that audits; Codex always fixes and Claude always briefs",
      )
        .choices(["claude", "codex"])
        .default("codex"),
    )
    .option("-v, --verbose", "show tool calls as well as assistant text")
    .action(
      (
        plan: string,
        scope: string | undefined,
        flags: { auditor: Assistant; verbose?: boolean },
      ) => {
        invocation = { kind: "round", plan, scope, ...flags }
      },
    )
  command
    .command("brief")
    .description(
      "Write the plain-words brief of a finished round from its ROUND-TS-*.md transcript.",
    )
    .argument("<transcript>", "the round's Markdown transcript")
    .option("-v, --verbose", "show tool calls as well as assistant text")
    .action((transcript: string, flags: { verbose?: boolean }) => {
      invocation = { kind: "brief", transcript, ...flags }
    })
  try {
    command.parse([...argv], { from: "user" })
  } catch (error) {
    if (error instanceof CommanderError) return error.exitCode === 0 ? 0 : 2
    throw error
  }
  if (invocation === undefined) return 0
  return invocation
}

export async function runCommand(
  argv: readonly string[],
  runtime: AssistantRuntime,
  options: OutputOptions & {
    readonly emergency: (text: string) => void
    readonly cacheRoot?: string
  },
): Promise<number> {
  const invocation = parseInvocation(argv, options)
  if (typeof invocation === "number") return invocation

  let output: RoundOutput | undefined
  let result: RoundResult | BriefResult | undefined
  let code = 1
  try {
    const repoRoot = await checkRepoRoot(runtime.cwd)
    const started = (options.now ?? Date.now)()
    let run: Run
    let execute: (
      dependencies: RoundDependencies,
    ) => Promise<RoundResult | BriefResult>
    if (invocation.kind === "round") {
      const setup = {
        repoRoot,
        plan: invocation.plan,
        scope: invocation.scope,
        auditor: invocation.auditor,
      }
      const round = roundRun(setup, started)
      run = round
      execute = (dependencies) =>
        runRound({ ...setup, transcript: round.paths.markdown }, dependencies)
    } else {
      const transcript = await checkTranscript(repoRoot, invocation.transcript)
      run = briefRun(transcript, started)
      execute = (dependencies) =>
        runBrief({ repoRoot, transcript }, dependencies)
    }
    output = new RoundOutput(run, { ...options, verbose: invocation.verbose })
    runtime.signal?.throwIfAborted()
    const selections = await prepareAssistants(
      { ...runtime, cwd: repoRoot },
      output,
      { cacheRoot: options.cacheRoot },
    )
    output.models(selections)
    result = await execute(
      assistantDependencies(
        { ...runtime, cwd: repoRoot },
        output.phase,
        output.prepareHandover,
        output.interactive,
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

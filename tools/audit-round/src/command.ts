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
import { errorMessage, type ModelSelection } from "./feedback.js"
import {
  briefRun,
  type OutputOptions,
  RoundOutput,
  type Run,
  roundRun,
  verdictPath,
} from "./output.js"
import { chainText } from "./output-format.js"
import type { Assistant } from "./phase.js"
import { recoveryCommand } from "./requests.js"
import {
  type BriefResult,
  chainCap,
  chainDecision,
  type RoundResult,
  runBrief,
  runRound,
} from "./round.js"
import { prepareAssistants, resolveCacheRoot } from "./startup.js"

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
      readonly chain?: boolean
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
    .option(
      "--chain",
      `run up to ${chainCap} rounds on the same scope, repeating the auditor while an A or B finding lands and ending with one round by the other assistant`,
    )
    .option("-v, --verbose", "show tool calls as well as assistant text")
    .action(
      (
        plan: string,
        scope: string | undefined,
        flags: { auditor: Assistant; chain?: boolean; verbose?: boolean },
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
  const now = options.now ?? Date.now
  try {
    const repoRoot = await checkRepoRoot(runtime.cwd)
    let selections: Record<Assistant, ModelSelection> | undefined
    /**
     * Each round records its own file pair, so a chained run opens one output
     * per round and retires the previous one first. Updates and settings are
     * read once; later rounds reuse the selections rather than re-entering the
     * CLIs.
     */
    const open = async (run: Run): Promise<RoundOutput> => {
      const previous = output
      output = undefined
      previous?.close()
      const active = new RoundOutput(run, {
        ...options,
        verbose: invocation.verbose,
      })
      output = active
      runtime.signal?.throwIfAborted()
      selections ??= await prepareAssistants(
        { ...runtime, cwd: repoRoot },
        active,
        { cacheRoot: options.cacheRoot },
      )
      active.models(selections)
      return active
    }
    const dependenciesFor = (active: RoundOutput) =>
      assistantDependencies(
        { ...runtime, cwd: repoRoot },
        active.phase,
        active.prepareHandover,
        active.interactive,
      )

    if (invocation.kind === "brief") {
      const transcript = await checkTranscript(repoRoot, invocation.transcript)
      const active = await open(briefRun(transcript, now()))
      result = await runBrief({ repoRoot, transcript }, dependenciesFor(active))
      active.finish(result)
    } else {
      const setup = {
        repoRoot,
        plan: invocation.plan,
        scope: invocation.scope,
      }
      let auditor = invocation.auditor
      let completed = 0
      for (;;) {
        const run = roundRun(
          { ...setup, auditor },
          now(),
          invocation.chain === true ? completed + 1 : undefined,
        )
        const active = await open(run)
        const round = await runRound(
          {
            ...setup,
            auditor,
            transcript: run.paths.markdown,
            verdict: verdictPath(run.paths.markdown),
            cacheRoot: resolveCacheRoot(runtime, options.cacheRoot),
          },
          dependenciesFor(active),
        )
        result = round
        active.finish(round)
        completed += 1
        if (invocation.chain !== true) break
        const decision = chainDecision(
          round,
          auditor,
          invocation.auditor,
          completed,
        )
        await active.message(chainText(decision, completed, chainCap))
        if (decision.next === null) break
        auditor = decision.next
      }
    }

    // The last round's output is still open, so a failure reports through it.
    const reporting = output
    if (result.status === "failed" && reporting !== undefined) {
      const roots = await Promise.all(
        [repoRoot, resolve(repoRoot, "../plan")].map(async (root) => {
          try {
            return `${root}:\n${(await readdir(root)).sort().join("\n")}`
          } catch (error) {
            return `${root}: ${errorMessage(error)}`
          }
        }),
      )
      await reporting.message(`Files at repository roots:\n${roots.join("\n")}`)
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

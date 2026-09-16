import { readdir, realpath, stat } from "node:fs/promises"
import { resolve } from "node:path"
import {
  Command,
  CommanderError,
  InvalidArgumentError,
  Option,
} from "commander"
import { type AssistantRuntime, assistantDependencies } from "./assistant.js"
import type { CliRuntime } from "./cli-process.js"
import { errorMessage, type ModelSelection } from "./feedback.js"
import {
  briefRun,
  type OutputOptions,
  RoundOutput,
  type Run,
  roundRun,
  verdictPath,
} from "./output.js"
import { chainText, commitStamps } from "./output-format.js"
import {
  type Assistant,
  type Effort,
  efforts,
  type Strength,
  strengths,
} from "./phase.js"
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
import { type AuditTarget, auditTarget } from "./target.js"

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
      "Name a round's ROUND-*.md transcript at the Repo Edu checkout root.",
    )
  return path
}

/** What the command line selected, captured by the subcommand actions. */
type Invocation =
  | {
      readonly kind: "round"
      readonly target: AuditTarget
      readonly auditor: Assistant
      readonly strength?: Strength
      readonly effort?: Effort
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
      "Run the audit, vet, rebuttal, fix and brief phases of one implementation-audit round from the Repo Edu checkout root.",
    )
    // A round is the command itself, so the usage line offers no command slot.
    .usage("[options] <target> [scope-or-commits...]")
    .configureOutput({
      writeOut: (text) => options.terminal.write(text.trimEnd()),
      writeErr: (text) => options.emergency(text.trimEnd()),
    })
    .exitOverride()
    .argument(
      "<target>",
      ".md plan in ../plan, SHA, HEAD, HEAD-<n> or inclusive <from>..<to> range",
    )
    .argument(
      "[scope-or-commits...]",
      "plan step number or increasing step range; otherwise further commit references",
    )
    .addOption(
      new Option(
        "--auditor <assistant>",
        "assistant that audits; Codex always fixes and briefs",
      )
        .choices(["claude", "codex"])
        .default("codex"),
    )
    .addOption(
      new Option(
        "--strength <level>",
        "model the auditor and its rebuttal run on; otherwise the assistant's own",
      ).choices([...strengths]),
    )
    .addOption(
      new Option(
        "--effort <level>",
        "reasoning effort the auditor and its rebuttal run at; otherwise the assistant's own",
      ).choices([...efforts]),
    )
    .option(
      "--chain",
      `run up to ${chainCap} rounds on the same scope (plans only), repeating the auditor while an A or B finding lands and ending with one round by the other assistant`,
    )
    .option("-v, --verbose", "show tool calls as well as assistant text")
    .action(
      (
        first: string,
        rest: string[],
        flags: {
          auditor: Assistant
          strength?: Strength
          effort?: Effort
          chain?: boolean
          verbose?: boolean
        },
      ) => {
        try {
          const target = auditTarget(first, rest)
          if ("commits" in target && flags.chain)
            throw new InvalidArgumentError(
              "Commit audits run once. --chain requires a plan target.",
            )
          invocation = { kind: "round", target, ...flags }
        } catch (error) {
          if (error instanceof InvalidArgumentError)
            command.error(error.message)
          throw error
        }
      },
    )
  // The program owns the round, so Commander adds no `help` command of its own.
  command
    .command("brief")
    .description(
      "Write the plain-words brief of a finished round from its ROUND-*.md transcript.",
    )
    .argument("<transcript>", "the round's Markdown transcript")
    .option("-v, --verbose", "show tool calls as well as assistant text")
    .action((transcript: string, flags: { verbose?: boolean }) => {
      invocation = { kind: "brief", transcript, ...flags }
    })
  try {
    // A bare command line asks for help rather than reporting a missing plan.
    command.parse(argv.length === 0 ? ["--help"] : [...argv], { from: "user" })
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
    const open = async (
      run: Run,
    ): Promise<{
      readonly active: RoundOutput
      readonly chosen: Record<Assistant, ModelSelection>
    }> => {
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
      const chosen = selections
      active.models(chosen)
      return { active, chosen }
    }
    const dependenciesFor = (
      active: RoundOutput,
      commit?: CliRuntime["commit"],
    ) =>
      assistantDependencies(
        { ...runtime, cwd: repoRoot, commit },
        active.phase,
        active.prepareHandover,
        active.interactive,
      )

    if (invocation.kind === "brief") {
      const transcript = await checkTranscript(repoRoot, invocation.transcript)
      const { active } = await open(briefRun(transcript, now()))
      result = await runBrief({ repoRoot, transcript }, dependenciesFor(active))
      active.finish(result)
    } else {
      const setup = {
        repoRoot,
        ...invocation.target,
        override: {
          strength: invocation.strength ?? null,
          effort: invocation.effort ?? null,
        },
      }
      let auditor = invocation.auditor
      let completed = 0
      for (;;) {
        const run = roundRun(
          { ...setup, auditor },
          now(),
          invocation.chain === true ? completed + 1 : undefined,
        )
        const { active, chosen } = await open(run)
        const round = await runRound(
          {
            ...setup,
            auditor,
            transcript: run.paths.markdown,
            verdict: verdictPath(run.paths.markdown),
            cacheRoot: resolveCacheRoot(runtime, options.cacheRoot),
          },
          dependenciesFor(active, commitStamps(run.phases, chosen)),
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

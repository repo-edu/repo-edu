import { readdir, realpath, stat } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import {
  Command,
  CommanderError,
  InvalidArgumentError,
  Option,
} from "commander"
import { type AssistantRuntime, assistantDependencies } from "./assistant.js"
import type { CliRuntime } from "./cli-process.js"
import { type ExecutionContext, executionContext } from "./context.js"
import { errorMessage } from "./feedback.js"
import {
  briefRun,
  type OutputOptions,
  RoundOutput,
  type Run,
  roundRun,
  transcriptNameStart,
} from "./output.js"
import { chainText, commitStamps } from "./output-format.js"
import { type AuditorSeat, noOverride, parseAuditorTag } from "./phase.js"
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
import { auditTarget } from "./target.js"

/** The transcript a brief retells: a round's Markdown pair member at the checkout root. */
async function checkTranscript(
  context: ExecutionContext,
  transcript: string,
): Promise<string> {
  let path = resolve(context.cwd, transcript)
  let file = false
  try {
    path = await realpath(path)
    file = (await stat(path)).isFile()
  } catch {
    // The message below names the expected file.
  }
  if (!file || ![context.repoEduRoot, context.planRoot].includes(dirname(path)))
    throw new Error(
      "Name a round's *-round.md transcript at the Repo Edu or plan checkout root.",
    )
  transcriptNameStart(path)
  return path
}

/** What the command line selected, captured by the subcommand actions. */
type Invocation =
  | {
      readonly kind: "round"
      readonly first: string
      readonly rest: readonly string[]
      readonly auditor: AuditorSeat
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
      "Run the audit, vet, rebuttal, fix and brief phases of one planning or implementation-audit round from the Repo Edu or plan checkout root.",
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
      "from the plan root: .md artifact alone; from Repo Edu: .md plan in ../plan, SHA, HEAD, HEAD-<n> or inclusive <from>..<to> range",
    )
    .argument(
      "[scope-or-commits...]",
      "Repo Edu only: plan step number or increasing step range; otherwise further commit references",
    )
    .addOption(
      new Option(
        "--auditor <tag>",
        "capability tag of the assistant that audits, as a commit subject spells it: a or o, then an optional b or t for the tier and an optional l, m, h or x for the effort. A named field binds the audit and its rebuttal; an unnamed one follows that assistant's own settings. Codex always fixes and briefs.",
      )
        .argParser((value) => {
          const seat = parseAuditorTag(value)
          if (seat === null)
            throw new InvalidArgumentError(
              "Expected a capability tag, as o, at or otx.",
            )
          return seat
        })
        .default({ assistant: "codex", ...noOverride } as AuditorSeat, "o"),
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
          auditor: AuditorSeat
          chain?: boolean
          verbose?: boolean
        },
      ) => {
        invocation = { kind: "round", first, rest, ...flags }
      },
    )
  // The program owns the round, so Commander adds no `help` command of its own.
  command
    .command("brief")
    .description(
      "Write the plain-words brief of a finished round from its *-round.md transcript.",
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
    readonly repoEduRoot?: string
  },
): Promise<number> {
  const invocation = parseInvocation(argv, options)
  if (typeof invocation === "number") return invocation

  let output: RoundOutput | undefined
  let result: RoundResult | BriefResult | undefined
  let code = 1
  const now = options.now ?? Date.now
  try {
    const context = await executionContext(runtime.cwd, options.repoEduRoot)
    const prepared =
      invocation.kind === "brief"
        ? {
            ...invocation,
            transcript: await checkTranscript(context, invocation.transcript),
          }
        : {
            ...invocation,
            target: auditTarget(
              invocation.first,
              invocation.rest,
              context.roundKind,
            ),
          }
    if (
      prepared.kind === "round" &&
      "commits" in prepared.target &&
      prepared.chain
    )
      throw new InvalidArgumentError(
        "Commit audits run once. --chain requires a plan target.",
      )
    runtime.signal?.throwIfAborted()
    const selections = await prepareAssistants(
      { ...runtime, cwd: context.cwd },
      {
        message: async (text) => options.terminal.write(text),
        warning: async (text) => options.terminal.write(`Warning: ${text}`),
      },
      { cacheRoot: options.cacheRoot },
    )
    runtime.signal?.throwIfAborted()
    /**
     * Each round records its own file pair, so a chained run opens one output
     * per round and retires the previous one first. Updates and settings are
     * read once; later rounds reuse the selections rather than re-entering the
     * CLIs.
     */
    const open = (run: Run): RoundOutput => {
      const previous = output
      output = undefined
      previous?.close()
      runtime.signal?.throwIfAborted()
      const active = new RoundOutput(run, {
        ...options,
        verbose: invocation.verbose,
      })
      output = active
      return active
    }
    const dependenciesFor = (
      active: RoundOutput,
      commit?: CliRuntime["commit"],
    ) =>
      assistantDependencies(
        { ...runtime, cwd: context.cwd, commit },
        active.phase,
        active.prepareHandover,
        active.interactive,
      )

    if (prepared.kind === "brief") {
      const { transcript } = prepared
      const active = open(briefRun(transcript, now(), selections))
      result = await runBrief(
        {
          ...context,
          roundKind:
            dirname(transcript) === context.planRoot
              ? "planning"
              : "implementation",
          transcript,
        },
        dependenciesFor(active),
      )
      active.finish(result)
    } else {
      const setup = {
        ...context,
        ...prepared.target,
        override: {
          strength: prepared.auditor.strength,
          effort: prepared.auditor.effort,
        },
      }
      let auditor = prepared.auditor.assistant
      let completed = 0
      for (;;) {
        const run = await roundRun(
          { ...setup, auditor },
          now(),
          selections,
          prepared.chain === true ? completed + 1 : undefined,
        )
        const active = open(run)
        const round = await runRound(
          {
            ...setup,
            auditor,
            nameStart: run.nameStart,
            transcript: run.paths.markdown,
            verdict: run.verdict,
            cacheRoot: resolveCacheRoot(runtime, options.cacheRoot),
          },
          dependenciesFor(active, commitStamps(run.phases, selections)),
        )
        result = round
        active.finish(round)
        completed += 1
        if (prepared.chain !== true) break
        const decision = chainDecision(
          round,
          auditor,
          prepared.auditor.assistant,
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
        [context.repoEduRoot, context.planRoot].map(async (root) => {
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
    if (error instanceof InvalidArgumentError) code = 2
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

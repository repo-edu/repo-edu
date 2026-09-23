import { readdir, readFile, realpath, stat } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import {
  Command,
  CommanderError,
  InvalidArgumentError,
  Option,
} from "commander"
import { execa } from "execa"
import { type AssistantRuntime, assistantDependencies } from "./assistant.js"
import { completeClean } from "./clean.js"
import { type ExecutionContext, executionContext } from "./context.js"
import { errorMessage } from "./feedback.js"
import { runGlance } from "./glance.js"
import {
  briefRun,
  closeRound,
  type OutputOptions,
  RoundOutput,
  type Run,
  roundRun,
  transcriptNameStart,
} from "./output.js"
import { chainText } from "./output-format.js"
import {
  type AuditorSeat,
  noOverride,
  parseAuditorTag,
  type RoundDependencies,
} from "./phase.js"
import { readReport } from "./report.js"
import { recoveryCommand } from "./requests.js"
import {
  type BriefResult,
  chainCap,
  chainDecision,
  type RoundResult,
  runBrief,
  runRound,
} from "./round.js"
import { claimRound } from "./run-files.js"
import { type RoundSettings, readSettings } from "./settings.js"
import { prepareAssistants, resolveCacheRoot } from "./startup.js"
import { auditTarget } from "./target.js"
import { readVet } from "./vet.js"

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
      "Name a round's *-0-round.<tag>.md transcript at the Repo Edu or plan checkout root.",
    )
  transcriptNameStart(path)
  return path
}

/** The plan a round audits, resolved where its phases open it. */
async function checkPlan(
  context: ExecutionContext,
  plan: string,
): Promise<void> {
  const path = resolve(context.cwd, plan)
  let file = false
  try {
    file = (await stat(path)).isFile()
  } catch {
    // The message below names the resolved file.
  }
  if (!file) throw new Error(`No plan file at ${path}.`)
}

/** What the command line selected, captured by the subcommand actions. */
type Invocation =
  | {
      readonly kind: "name"
      readonly first: string
      readonly rest: readonly string[]
      readonly auditor: string
    }
  | { readonly kind: "close"; readonly nameStart: string }
  | {
      readonly kind: "round"
      readonly first: string
      readonly rest: readonly string[]
      readonly auditor?: AuditorSeat
      readonly chain?: boolean
      /** False when `--no-watch` was given; Commander defaults it to true. */
      readonly watch: boolean
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
    .enablePositionalOptions()
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
      "from the plan root: plan artifact alone; from Repo Edu: plan in ../plan, SHA, HEAD, HEAD-<n> or inclusive <from>..<to> range. A plan named without .md gets the extension",
    )
    .argument(
      "[scope-or-commits...]",
      "Repo Edu only: plan step number or increasing step range; otherwise further commit references",
    )
    .addOption(
      new Option(
        "--auditor <tag>",
        "capability tag of the assistant that audits, as a commit subject spells it: a or o, then an optional b or t for the tier and an optional l, m, h or x for the effort. A named field binds the audit and its rebuttal; an unnamed one follows settings.json, then that assistant's own settings. The default auditor comes from settings.json. Codex always fixes.",
      ).argParser((value) => {
        const seat = parseAuditorTag(value)
        if (seat === null)
          throw new InvalidArgumentError(
            "Expected a capability tag, as o, at or otx.",
          )
        return seat
      }),
    )
    .option(
      "--chain",
      `run up to ${chainCap} rounds on the same scope (plans only), repeating the auditor while an A or B finding lands and ending with one round by the other assistant`,
    )
    .option(
      "--no-watch",
      "skip the trajectory watch and its glance after every round, whatever the commit record says",
    )
    .option("-v, --verbose", "show tool calls as well as assistant text")
    .action(
      (
        first: string,
        rest: string[],
        flags: {
          auditor?: AuditorSeat
          chain?: boolean
          watch: boolean
          verbose?: boolean
        },
      ) => {
        invocation = { kind: "round", first, rest, ...flags }
      },
    )
  // The program owns the round, so Commander adds no `help` command of its own.
  command
    .command("name")
    .description(
      "Claim a hand-run round and print its absolute file paths, one per line.",
    )
    .argument("<target>", "the same plan or commit target accepted by a round")
    .argument(
      "[scope-or-commits...]",
      "plan step scope or further commit references",
    )
    .requiredOption(
      "--auditor <tag>",
      "the auditing session's full three-letter tag, including u for an unlisted model",
      (value: string) => {
        if (!/^[ao][btu][lmhx]$/.test(value))
          throw new InvalidArgumentError(
            "Expected a full session tag, such as oth or oux.",
          )
        return value
      },
    )
    .action((first: string, rest: string[], flags: { auditor: string }) => {
      invocation = { kind: "name", first, rest, auditor: flags.auditor }
    })
  command
    .command("close")
    .description(
      "Delete one round's audit, vet and rebuttal reports at the invoking root.",
    )
    .argument(
      "<target-round>",
      "exact target and round, such as example-step-2-01",
      (value: string) => {
        if (!/^[^/]+-\d{2,}$/.test(value))
          throw new InvalidArgumentError(
            "Expected a target and round, such as example-step-2-01.",
          )
        return value
      },
    )
    .action((nameStart: string) => {
      invocation = { kind: "close", nameStart }
    })
  command
    .command("brief")
    .description(
      "Write the plain-words brief of a finished round from its *-0-round.<tag>.md transcript.",
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
    readonly settings?: RoundSettings
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
    if (invocation.kind === "close") {
      await closeRound(context.cwd, invocation.nameStart)
      return 0
    }
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
              invocation.kind === "name" && invocation.rest.length > 0
                ? "implementation"
                : context.roundKind,
            ),
          }
    if (
      prepared.kind === "name" &&
      context.roundKind === "planning" &&
      "commits" in prepared.target
    )
      throw new InvalidArgumentError("Commit audits run from Repo Edu.")
    if (
      prepared.kind === "round" &&
      "commits" in prepared.target &&
      prepared.chain
    )
      throw new InvalidArgumentError(
        "Commit audits run once. --chain requires a plan target.",
      )
    if (prepared.kind !== "brief" && "plan" in prepared.target)
      await checkPlan(context, prepared.target.plan)
    const settings = options.settings ?? (await readSettings())
    runtime.signal?.throwIfAborted()
    const selections = await prepareAssistants(
      { ...runtime, cwd: context.cwd },
      {
        message: async (text) =>
          prepared.kind === "name"
            ? options.emergency(text)
            : options.terminal.write(text),
        warning: async (text) =>
          prepared.kind === "name"
            ? options.emergency(`Warning: ${text}`)
            : options.terminal.write(`Warning: ${text}`),
      },
      { cacheRoot: options.cacheRoot },
    )
    runtime.signal?.throwIfAborted()
    if (prepared.kind === "name") {
      const run = await roundRun(
        {
          ...context,
          ...prepared.target,
          // The hand-run planning launcher also routes named implementation steps.
          roundKind:
            "plan" in prepared.target && prepared.target.scope !== undefined
              ? "implementation"
              : context.roundKind,
          auditor: prepared.auditor[0] === "a" ? "claude" : "codex",
        },
        now(),
        selections,
        settings,
        undefined,
        prepared.auditor,
      )
      claimRound(run.paths.claim)
      for (const path of [
        run.paths.claim,
        run.paths.markdown,
        run.paths.log,
        ...Object.values(run.documents),
        run.watch,
      ])
        options.terminal.write(path)
      return 0
    }
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
        verbose: prepared.verbose,
      })
      output = active
      return active
    }
    // The commit stamps are the output's, because the output records which
    // phases ran and a child reads them only when it starts.
    const dependenciesFor = (active: RoundOutput): RoundDependencies => ({
      closeRound,
      checkFile: async (file) => {
        if (!(await readFile(file, "utf8")).trim())
          throw new Error(`Phase output is empty: ${file}`)
      },
      completeClean: async (input) => {
        const stamps = active.commitStamps()
        if (stamps === undefined) throw new Error("Missing audit model record")
        active.cleanCompletion(await completeClean(input, stamps))
      },
      readReport: async (file, kind) =>
        readReport(await readFile(file, "utf8"), kind),
      readVet: async (file, findings) =>
        readVet(await readFile(file, "utf8"), findings),
      readHead: async (cwd) =>
        (await execa("git", ["rev-parse", "HEAD"], { cwd })).stdout,
      readSubjects: async (cwd, before) => {
        const { stdout } = await execa(
          "git",
          ["log", `${before}..HEAD`, "--format=%s"],
          { cwd },
        )
        return stdout.length === 0 ? [] : stdout.split("\n")
      },
      ...assistantDependencies(
        { ...runtime, cwd: context.cwd, commit: active.commitStamps },
        active.phase,
        active.prepareHandover,
        active.interactive,
      ),
      // The glance decides in the runner; its sentence opens the watch's section
      // of the log and terminal, whether or not a watch follows.
      glance: async (input) => {
        const decision = await runGlance(input)
        await active.section(
          `[glance] ${decision.due ? "due" : "not due"}: ${decision.text}`,
        )
        return decision
      },
    })

    if (prepared.kind === "brief") {
      const { transcript } = prepared
      const run = briefRun(transcript, now(), selections, settings)
      const active = open(run)
      result = await runBrief(
        {
          ...context,
          roundKind:
            dirname(transcript) === context.planRoot
              ? "planning"
              : "implementation",
          transcript,
          brief: run.brief,
        },
        dependenciesFor(active),
        settings,
      )
      active.finish(result)
    } else {
      const seat = prepared.auditor ?? {
        assistant: settings.defaultAuditor,
        ...noOverride,
      }
      const setup = {
        ...context,
        ...prepared.target,
        override: {
          strength: seat.strength,
          effort: seat.effort,
        },
      }
      let auditor = seat.assistant
      let completed = 0
      for (;;) {
        const run = await roundRun(
          { ...setup, auditor },
          now(),
          selections,
          settings,
          prepared.chain === true ? completed + 1 : undefined,
        )
        const active = open(run)
        const round = await runRound(
          {
            ...setup,
            auditor,
            documents: run.documents,
            transcript: run.paths.markdown,
            watch: prepared.watch
              ? {
                  file: run.watch,
                  cacheRoot: resolveCacheRoot(runtime, options.cacheRoot),
                }
              : null,
          },
          dependenciesFor(active),
          settings,
        )
        result = round
        active.finish(round)
        completed += 1
        if (prepared.chain !== true) break
        const decision = chainDecision(
          round,
          auditor,
          seat.assistant,
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

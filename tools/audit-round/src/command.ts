import { readFile, realpath, stat } from "node:fs/promises"
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
import { readWatchEvidence } from "./episode.js"
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
import {
  type AuditorSeat,
  noOverride,
  parseAuditor,
  type RoundDependencies,
} from "./phase.js"
import { readReport } from "./report.js"
import { recoveryCommand } from "./requests.js"
import {
  type BriefResult,
  type RoundResult,
  runBrief,
  runRound,
} from "./round.js"
import { readRulingReply } from "./ruling-input.js"
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
  | { readonly kind: "episode"; readonly target?: string }
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
      readonly auditor?: readonly AuditorSeat[]
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
      "Audit a plan or its implementation, review the findings and apply agreed fixes.\nRun from the Repo Edu or plan checkout root.",
    )
    .configureHelp({
      helpWidth: 88,
      subcommandTerm: (subcommand) => subcommand.name(),
    })
    // A round is the command itself, so the usage line offers no command slot.
    .usage("[options] <target> [scope-or-commits...]")
    .configureOutput({
      writeOut: (text) => options.terminal.write(text.trimEnd()),
      writeErr: (text) => options.emergency(text.trimEnd()),
    })
    .exitOverride()
    .argument("<target>", "plan file, commit reference or commit range")
    .argument(
      "[scope-or-commits...]",
      "plan step scope or more commit references (Repo Edu only)",
    )
    .addOption(
      new Option(
        "--auditor <selections>",
        "comma-separated auditors in round order (see below)",
      ).argParser((value) => {
        return value.split(",").map((entry, index) => {
          const seat = parseAuditor(entry.trim())
          if (seat === null)
            throw new InvalidArgumentError(
              `Auditor entry ${index + 1}: expected claude, codex or a capability tag, such as o, at or otx.`,
            )
          return seat
        })
      }),
    )
    .option(
      "--no-watch",
      "skip the trajectory glance and watch after every round",
    )
    .option("-v, --verbose", "show tool calls as well as assistant text")
    .addHelpText(
      "after",
      `
Targets and scope:
  From Repo Edu: audit a plan's implementation or named commits.
    Plan     Path to the plan in ../plan; .md may be omitted.
    Scope    One step (3) or an increasing range (1-3). Omit for all steps.
    Commits  SHA, HEAD, HEAD-<n>, a space-separated list or <from>..<to>.
             HEAD-1 is the previous first-parent commit. Ranges include both ends.

  From the plan root: audit the plan document itself.
    Name only the plan file; .md may be omitted. No steps or commit references.

Auditor selection (--auditor <selections>):
  <selections> accepts one or more comma-separated names or tags:

    claude | codex
      Use that CLI's current model and effort instead of the runner's audit settings.

    <assistant>[<tier>][<effort>]
      A capability tag, written without spaces. Brackets mark optional fields.
      <assistant>  a = Claude, o = Codex
      <tier>       b = base model, t = top model
      <effort>     l = low, m = medium, h = high, x = xhigh
      Omitted fields use settings.json, then the CLI's settings.

  Quote the whole --auditor value if it contains spaces.
  Each selection applies to both audit and rebuttal. Other phases keep their settings.
  The default auditor comes from settings.json.
  Without --auditor, one round runs with that default.
  Settings file: tools/audit-round/settings.json in the Repo Edu checkout.

Round sequence:

  Round order (--auditor):
    - Each name or tag after --auditor selects the auditor for one round.
    - Rounds run from left to right, all on the same target and step scope.
    - Repeat a name or tag to run another round with that auditor.
    - Multiple rounds require a plan target. Commit audits run once.

  Phases within a round:
    1. Audit     The selected auditor reports findings.
    2. Vet       The other assistant reviews those findings.
    3. Rebuttal  The auditor answers the vet's objections or conditions.
                 Skipped if the vet accepts every finding unconditionally.
    4. Fix       Codex always fixes the accepted findings.
    5. Brief     A plain-words summary follows the fix.

  Skipping rounds and stopping:
    - If the audit finds nothing, the round ends before vet or any later phase.
      All remaining --auditor selections for that assistant are skipped,
      even if they specify a different model tier or effort.
    - A fix that records a clean result does not skip later rounds.
    - A failure stops the sequence. A decision requiring your ruling also
      stops the sequence and asks for your reply in the runner.

  Trajectory watch:
    - After a completed plan round with findings, the glance decides if a watch is due.
    - --no-watch skips both the glance and the watch.
    - Commit audits never run a glance or watch.

Examples (from Repo Edu):

  1. Audit steps 1-3, first with Codex and then with Claude.

     $ pnpm audit-round ../plan/example.md 1-3 --auditor codex,claude

  2. Audit step 3 with Claude's top model at xhigh effort (atx),
     then Codex's base model at medium effort (obm).

     $ pnpm audit-round ../plan/example.md 3 --auditor atx,obm

  3. Audit an inclusive commit range.

     $ pnpm audit-round HEAD-2..HEAD

Use pnpm audit-round <command> --help for a helper command's arguments and options.`,
    )
    .action(
      (
        first: string,
        rest: string[],
        flags: {
          auditor?: readonly AuditorSeat[]
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
    .command("episode")
    .description(
      "Print joined Git evidence for a hand-run watch without writing files.",
    )
    .argument(
      "[stem-or-commit]",
      "topic or explicit anchor commit; defaults to HEAD's topic",
    )
    .action((target?: string) => {
      invocation = { kind: "episode", target }
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
    readonly readReply?: () => Promise<string | null>
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
    if (invocation.kind === "episode") {
      options.terminal.write(
        await readWatchEvidence({ ...context, target: invocation.target }),
      )
      return 0
    }
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
      (prepared.auditor?.length ?? 1) > 1
    )
      throw new InvalidArgumentError(
        "Commit audits run once. Multiple auditors require a plan target.",
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
      watchEvidence: readWatchEvidence,
      closeRound,
      checkFile: async (file) => {
        if (!(await readFile(file, "utf8")).trim())
          throw new Error(`Phase output is empty: ${file}`)
      },
      showBrief: async (document) => {
        active.showBrief(await readFile(document, "utf8"))
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
      ),
      requestRuling: async (document) => {
        active.beginRuling(document, await readFile(document, "utf8"))
        let reply: string | null = null
        try {
          reply = await (
            options.readReply ??
            (() =>
              readRulingReply(process.stdin, process.stdout, runtime.signal))
          )()
          return reply
        } finally {
          active.endRuling(reply)
        }
      },
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
      const seats = prepared.auditor ?? [
        {
          assistant: settings.defaultAuditor,
          override: noOverride,
        },
      ]
      let pending = seats
      let completed = 0
      do {
        const seat = pending[0]
        const setup = {
          ...context,
          ...prepared.target,
          auditor: seat.assistant,
          override: seat.override,
        }
        const run = await roundRun(
          setup,
          now(),
          selections,
          settings,
          seats.length > 1 ? completed + 1 : undefined,
        )
        const active = open(run)
        const round = await runRound(
          {
            ...setup,
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
        if (seats.length === 1) break
        if (round.status !== "finished" || round.ruled) {
          await active.message(
            round.status === "failed"
              ? "Auditor sequence stopped: this round failed."
              : "Auditor sequence stopped: this round required your ruling.",
          )
          break
        }
        pending = pending.slice(1)
        if (round.cleanAudit) {
          const remaining = pending.filter(
            (entry) => entry.assistant !== seat.assistant,
          )
          if (remaining.length < pending.length)
            await active.message(
              `Clean audit by ${seat.assistant}; skipping all remaining entries for ${seat.assistant}.`,
            )
          pending = remaining
        }
        await active.message(
          pending.length === 0
            ? `Auditor sequence finished after ${completed} round${completed === 1 ? "" : "s"}.`
            : `Next round: ${pending[0].assistant}; ${pending.length} auditor entries remain.`,
        )
      } while (pending.length > 0)
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

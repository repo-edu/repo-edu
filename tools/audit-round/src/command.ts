import { readFile } from "node:fs/promises"
import { join } from "node:path"
import {
  Command,
  CommanderError,
  InvalidArgumentError,
  Option,
} from "commander"
import { execa } from "execa"
import { type AssistantRuntime, assistantDependencies } from "./assistant.js"
import { completeClean } from "./clean.js"
import { executionContext } from "./context.js"
import { defaultPlan, defaultTarget } from "./default-target.js"
import { readWatchEvidence } from "./episode.js"
import { errorMessage } from "./feedback.js"
import { readWatchGrade, runGlance } from "./glance.js"
import {
  briefRun,
  type OutputOptions,
  RoundOutput,
  type Run,
  roundRun,
} from "./output.js"
import {
  type AuditorSeat,
  noOverride,
  phaseWorkflow,
  type RoundDependencies,
} from "./phase.js"
import {
  type AuditorEntry,
  parseAuditors,
  removeQueue,
  takeNext,
  writeQueue,
} from "./queue.js"
import { readReport, reportKind } from "./report.js"
import { recoveryCommand } from "./requests.js"
import {
  type BriefResult,
  type RoundResult,
  runBrief,
  runRound,
} from "./round.js"
import {
  closeRound,
  type ManualPhase,
  manualPhasePaths,
  newestTranscript,
  phaseFilename,
  queueFile,
  roundDocument,
  roundIdentity,
  transcriptKind,
} from "./round-paths.js"
import { readRulingReply } from "./ruling-input.js"
import { claimRound } from "./run-files.js"
import { type RoundSettings, readSettings } from "./settings.js"
import { prepareAssistants, resolveCacheRoot } from "./startup.js"
import { auditTarget, resolvePlan, roundContext } from "./target.js"
import { readVet } from "./vet.js"

/** What the command line selected, captured by the subcommand actions. */
type Invocation =
  | { readonly kind: "episode"; readonly target?: string }
  | { readonly kind: "plan" }
  | {
      readonly kind: "name"
      /** Absent when the runner repeats the newest unfinished audit. */
      readonly first?: string
      readonly rest: readonly string[]
      readonly auditor: string
    }
  | {
      readonly kind: "paths"
      readonly phase: ManualPhase
      readonly input?: string
      readonly writer?: string
      readonly vet?: string
      readonly rebut?: string
    }
  | { readonly kind: "close"; readonly nameStart: string }
  | {
      readonly kind: "round"
      /** Absent when the runner repeats the newest unfinished audit. */
      readonly first?: string
      readonly rest: readonly string[]
      readonly auditor?: readonly AuditorEntry[]
      /** False when `--no-watch` was given; Commander defaults it to true. */
      readonly watch: boolean
      /** True when `--brief` was given; rounds run no brief otherwise. */
      readonly brief?: boolean
      readonly verbose?: boolean
    }
  | {
      readonly kind: "brief"
      /** Absent when the brief retells the newest round at the plan root. */
      readonly transcript?: string
      readonly verbose?: boolean
    }

function sessionTag(value: string): string {
  if (!/^[ao][btu][lmhx]$/.test(value))
    throw new InvalidArgumentError(
      "Expected a full session tag, such as oth or oux.",
    )
  return value
}

function parseInvocation(
  argv: readonly string[],
  options: OutputOptions & { readonly emergency: (text: string) => void },
): Invocation | number {
  let invocation: Invocation | undefined
  const command = new Command("audit-round")
    .enablePositionalOptions()
    .description(
      "Audit a plan or its implementation, review the findings and apply agreed fixes.\nArguments have the same meaning from either checkout.",
    )
    .configureHelp({
      helpWidth: 88,
      subcommandTerm: (subcommand) => subcommand.name(),
    })
    .usage(
      "[options] [target] [scope-or-commits...]\n       audit-round brief [options] [transcript]",
    )
    .configureOutput({
      writeOut: (text) => options.terminal.write(text.trimEnd()),
      writeErr: (text) => options.emergency(text.trimEnd()),
    })
    .exitOverride()
    .argument(
      "[target]",
      "plan stem, commit reference or commit range; see Omitted below",
    )
    .argument(
      "[scope-or-commits...]",
      "plan step scope, all or more commit references",
    )
    .addOption(
      new Option(
        "--auditor <selections>",
        "auditors in round order (see below)",
      ).argParser((value) => {
        let entries: AuditorEntry[]
        try {
          entries = parseAuditors(value)
        } catch (error) {
          throw new InvalidArgumentError(errorMessage(error))
        }
        if (entries.length === 0)
          throw new InvalidArgumentError("Expected at least one auditor.")
        return entries
      }),
    )
    .option(
      "--no-watch",
      "skip the trajectory glance and watch after every round",
    )
    .option("--brief", "write the final brief after every round")
    .option("-v, --verbose", "show tool calls as well as assistant text")
    .addHelpText(
      "after",
      `
Targets and scope:
  Plan     A stem alone audits the plan document in the sibling plan repo.
           .md and -widen are ignored. Paths are refused. Active plans precede archives.
           A stem shaped like a commit reference keeps .md to identify it as a plan.
  Scope    One step (3), an increasing range (1-3) or all audits implementation.
  Commits  SHA, HEAD, HEAD-<n>, a space-separated list or <from>..<to> in Repo Edu.
           HEAD-1 is the previous first-parent commit. Ranges include both ends.
  Omitted  Options without a target repeat the newest unfinished audit. The plan is
           the active one with the newest stem commit in either repo. A planning
           commit repeats the planning audit; an implementation audit that was not
           clean repeats its scope. Anything else stops: name the next scope.

Auditor selection (--auditor <selections>):
  <selections> is a list of names or tags, separated by commas or spaces.
  Each entry runs one round, from left to right: --auditor a,o runs a round
  audited by Claude, then a round audited by Codex. Each entry is one of:

    claude | codex
      Use that CLI's current model and effort instead of the runner's audit settings.

    <assistant>[<tier>][<effort>]
      A capability tag, written without spaces. Brackets mark optional fields.
      <assistant>  a = Claude, o = Codex
      <tier>       b = base model, t = top model
      <effort>     l = low, m = medium, h = high, x = xhigh
      Omitted fields use settings.json, then the CLI default.

  Quote the whole --auditor value if it contains spaces.
  Each selection applies to both audit and rebuttal. Other phases keep their settings.
  The default auditor comes from settings.json.
  Without --auditor, the first round uses that default.
  Settings file: tools/audit-round/settings.json in the Repo Edu checkout.

Round sequence:

  Round order (--auditor):
    - Every round runs on the same target and step scope.
    - Repeat a name or tag to run another round with that auditor.
    - Multiple rounds require a plan target. Commit audits run once.

  Queue file (plan targets):
    - The entries after the current round wait in <target>-queue.md at the
      plan root. Each round prints its path and what it holds.
    - Edit it at any time to add, remove or reorder rounds. It takes the same
      names and tags, separated by commas, spaces or line breaks. The runner
      reads it between rounds, so an edit applies from the next round on.
    - An empty or deleted file ends the sequence after the current round.
    - The runner deletes the file when the sequence ends.

  Phases within a round:
    1. Audit     The selected auditor reports findings.
    2. Vet       The other assistant reviews those findings.
    3. Rebuttal  The auditor answers the vet's objections or conditions.
                 Skipped if the vet accepts every finding unconditionally.
    4. Fix       The assistant set in settings.json fixes the accepted findings.
    5. Brief     A plain-words summary follows the fix.
                 Runs only with --brief.

  Skipping rounds and stopping:
    - If the audit finds nothing, the round ends before vet or any later phase.
      All queued entries for that assistant are skipped,
      even if they specify a different model tier or effort.
    - A fix that records a clean result does not skip later rounds.
    - A failure stops the sequence. A decision asks for your reply in the runner.
      A submitted reply resumes the fix and sequence. Leaving without a reply
      stops both.

  Trajectory watch:
    - After a completed plan round with findings, the glance decides if a watch is due.
    - A red watch stops the sequence, so you act on it before more rounds run.
    - --no-watch skips both the glance and the watch.
    - Commit audits never run a glance or watch.

Examples (from either checkout):

  1. Audit steps 1-3, first with Codex and then with Claude.

     $ pnpm audit-round example 1-3 --auditor codex,claude

  2. Audit step 3 with Claude's top model at xhigh effort (atx),
     then Codex's base model at medium effort (obm).

     $ pnpm audit-round example 3 --auditor atx,obm

  3. Audit an inclusive commit range.

     $ pnpm audit-round HEAD-2..HEAD

  4. Repeat the newest unfinished audit with Codex.

     $ pnpm audit-round --auditor codex

Use pnpm audit-round brief --help for the brief's arguments and options.`,
    )
    .action(
      (
        first: string | undefined,
        rest: string[],
        flags: {
          auditor?: readonly AuditorEntry[]
          watch: boolean
          brief?: boolean
          verbose?: boolean
        },
      ) => {
        invocation = { kind: "round", first, rest, ...flags }
      },
    )
  // The program owns the round, so Commander adds no `help` command of its own.
  command
    .command("name", { hidden: true })
    .description(
      "Claim a hand-run round and print its workflow, working checkout and arguments.",
    )
    .argument(
      "[target]",
      "the same plan or commit target accepted by a round, or none to repeat the newest unfinished audit",
    )
    .argument(
      "[scope-or-commits...]",
      "plan step scope or further commit references",
    )
    .requiredOption(
      "--auditor <tag>",
      "the auditing session's full three-letter tag, including u for an unlisted model",
      sessionTag,
    )
    .action(
      (
        first: string | undefined,
        rest: string[],
        flags: { auditor: string },
      ) => {
        invocation = { kind: "name", first, rest, auditor: flags.auditor }
      },
    )
  command
    .command("paths", { hidden: true })
    .description(
      "Resolve a manual phase's workflow, working checkout and arguments without starting an assistant.",
    )
    .argument("<phase>", "vet, rebut or fix", (value: string): ManualPhase => {
      if (!["vet", "rebut", "fix"].includes(value))
        throw new InvalidArgumentError("Expected vet, rebut or fix.")
      return value as ManualPhase
    })
    .argument(
      "[input]",
      "bare audit report name; defaults to the newest eligible file at the plan root",
    )
    .option(
      "--writer <tag>",
      "current session's full tag; required except for fix",
      sessionTag,
    )
    .option("--vet <file>", "select a vet instead of the round's newest")
    .option("--rebut <file>", "select a rebuttal instead of the round's newest")
    .action(
      (
        phase: ManualPhase,
        input: string | undefined,
        flags: { writer?: string; vet?: string; rebut?: string },
      ) => {
        if (
          (flags.vet !== undefined && phase !== "rebut" && phase !== "fix") ||
          (flags.rebut !== undefined && phase !== "fix")
        )
          throw new InvalidArgumentError(
            "Review file selections apply only to phases that read them.",
          )
        invocation = { kind: "paths", phase, input, ...flags }
      },
    )
  command
    .command("episode", { hidden: true })
    .description(
      "Print joined Git evidence for a hand-run watch without writing files.",
    )
    .argument(
      "[stem-or-commit]",
      "topic or anchor commit; defaults to the newest topic across both repos; HEAD means Repo Edu",
    )
    .action((target?: string) => {
      invocation = { kind: "episode", target }
    })
  command
    .command("plan", { hidden: true })
    .description(
      "Print the plan an omitted stem names, as a round given no target selects it.",
    )
    .action(() => {
      invocation = { kind: "plan" }
    })
  command
    .command("close", { hidden: true })
    .description(
      "Delete one round's audit, vet and rebuttal reports at the plan root.",
    )
    .argument(
      "<target-round>",
      "exact target and round, such as example-step-02..02-01",
      (value: string) => {
        if (!/^[^/]+-\d{2,}$/.test(value))
          throw new InvalidArgumentError(
            "Expected a target and round, such as example-step-02..02-01.",
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
      "Write the plain-words brief of a finished round from its *-1-round.<tag>.md transcript.",
    )
    .argument(
      "[transcript]",
      "the round's Markdown transcript; defaults to the newest at the plan root",
    )
    .option("-v, --verbose", "show tool calls as well as assistant text")
    .action((transcript: string | undefined, flags: { verbose?: boolean }) => {
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
    const context = await executionContext(options.repoEduRoot)
    if (invocation.kind === "episode") {
      options.terminal.write(
        await readWatchEvidence({ ...context, target: invocation.target }),
      )
      return 0
    }
    if (invocation.kind === "plan") {
      options.terminal.write(
        JSON.stringify({ plan: await defaultPlan(context) }),
      )
      return 0
    }
    if (invocation.kind === "close") {
      await closeRound(context.planRoot, invocation.nameStart)
      return 0
    }
    if (invocation.kind === "paths") {
      const args = await manualPhasePaths(
        context,
        invocation.phase,
        invocation.input,
        invocation,
      )
      const session = roundContext(
        context,
        reportKind(await readFile(args[0], "utf8")),
      )
      options.terminal.write(
        JSON.stringify({
          cwd: session.cwd,
          workflow: phaseWorkflow({ ...session, phase: invocation.phase }),
          arguments: args,
        }),
      )
      return 0
    }
    const prepared =
      invocation.kind === "brief"
        ? {
            ...invocation,
            transcript:
              invocation.transcript === undefined
                ? await newestTranscript(context)
                : (await roundDocument(context, invocation.transcript, "round"))
                    .path,
          }
        : {
            ...invocation,
            target:
              invocation.first === undefined
                ? await defaultTarget(context)
                : auditTarget(invocation.first, invocation.rest),
          }
    if (
      prepared.kind === "round" &&
      "commits" in prepared.target &&
      (prepared.auditor?.length ?? 1) > 1
    )
      throw new InvalidArgumentError(
        "Commit audits run once. Multiple auditors require a plan target.",
      )
    if (prepared.kind !== "brief" && "plan" in prepared.target)
      prepared.target = {
        ...prepared.target,
        plan: await resolvePlan(context.planRoot, prepared.target.plan),
      }
    if (prepared.kind === "name") {
      const { nameStart } = await roundIdentity({
        ...context,
        ...prepared.target,
      })
      const claim = join(context.planRoot, `${nameStart}-0-claim.md`)
      claimRound(claim)
      const report = join(
        context.planRoot,
        `${phaseFilename(nameStart, "audit", prepared.auditor)}.md`,
      )
      const session = roundContext(context, prepared.target.roundKind)
      options.terminal.write(
        JSON.stringify({
          cwd: session.cwd,
          workflow: phaseWorkflow({ ...session, phase: "audit" }),
          claim,
          arguments: [
            report,
            ...("plan" in prepared.target
              ? [
                  prepared.target.plan,
                  ...(prepared.target.roundKind === "planning"
                    ? []
                    : [prepared.target.scope]),
                ]
              : prepared.target.commits),
          ],
        }),
      )
      return 0
    }
    const session = roundContext(
      context,
      prepared.kind === "brief"
        ? await transcriptKind(prepared.transcript)
        : prepared.target.roundKind,
    )
    const settings = options.settings ?? (await readSettings())
    runtime.signal?.throwIfAborted()
    const selections = await prepareAssistants(
      { ...runtime, cwd: session.cwd },
      {
        message: async (text) => options.terminal.write(text),
        warning: async (text) => options.terminal.write(`Warning: ${text}`),
      },
      settings,
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
        verbose: prepared.verbose,
      })
      output = active
      return active
    }
    // The commit stamps are the output's, because the output records which
    // phases ran and a child reads them only when it starts.
    const dependenciesFor = (active: RoundOutput): RoundDependencies => ({
      watchEvidence: readWatchEvidence,
      watchGrade: readWatchGrade,
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
        { ...runtime, cwd: session.cwd, commit: active.commitStamps },
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
          ...session,
          transcript,
          brief: run.brief,
        },
        dependenciesFor(active),
        settings,
      )
      active.finish(result)
    } else {
      const [first, ...queued] = prepared.auditor ?? []
      // A plan target keeps the auditors after the current round in a file the
      // user may edit while rounds run; a commit target runs once.
      const queue =
        "plan" in prepared.target
          ? await queueFile({ ...session, ...prepared.target })
          : null
      let rest: readonly AuditorEntry[] = queued
      if (queue !== null) await writeQueue(queue, rest)
      let seat: AuditorSeat | null = first ?? {
        assistant: settings.defaultAuditor,
        override: noOverride,
      }
      let completed = 0
      try {
        do {
          const setup = {
            ...session,
            ...prepared.target,
            auditor: seat.assistant,
            override: seat.override,
            brief: prepared.brief,
          }
          const run = await roundRun(
            setup,
            now(),
            selections,
            settings,
            completed > 0 || rest.length > 0 ? completed + 1 : undefined,
          )
          const active = open(run)
          if (queue !== null)
            await active.message(
              `Queued after this round: ${rest.map((entry) => entry.text).join(", ") || "none"}. Edit ${queue} to add or remove rounds.`,
            )
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
          if (queue === null) break
          if (round.status !== "finished") {
            await active.message(
              round.status === "failed"
                ? "Auditor sequence stopped: this round failed."
                : "Auditor sequence stopped: this round required your ruling.",
            )
            break
          }
          // A red watch asks the user to act now, so no queued round starts first.
          if (round.watch === "red") {
            await active.message(
              `Auditor sequence stopped: the watch graded red. Read ${run.watch} before running more rounds.`,
            )
            break
          }
          const taken = await takeNext(
            queue,
            round.cleanAudit ? seat.assistant : null,
          )
          if (taken.skipped > 0)
            await active.message(
              `Clean audit by ${seat.assistant}; skipping all remaining entries for ${seat.assistant}.`,
            )
          seat = taken.next
          rest = taken.rest
          await active.message(
            seat === null
              ? `Auditor sequence finished after ${completed} round${completed === 1 ? "" : "s"}.`
              : `Next round: ${seat.assistant}; ${rest.length + 1} auditor entries remain.`,
          )
        } while (seat !== null)
      } finally {
        if (queue !== null) await removeQueue(queue)
      }
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

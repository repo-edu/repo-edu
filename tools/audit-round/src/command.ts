import { readFile, stat } from "node:fs/promises"
import { basename, join } from "node:path"
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
import { defaultPlan, resolveTarget } from "./default-target.js"
import { readWatchEvidence } from "./episode.js"
import { errorMessage } from "./feedback.js"
import { readWatchGrade, runGlance } from "./glance.js"
import {
  briefRun,
  closeRun,
  type OutputOptions,
  RoundOutput,
  type Run,
  roundRun,
} from "./output.js"
import {
  type Assistant,
  type AuditorOption,
  type AuditorSeat,
  type AuditSlot,
  auditPair,
  noOverride,
  phaseWorkflow,
  type RoundDependencies,
} from "./phase.js"
import {
  type AuditorEntry,
  auditorSetting,
  parseAuditors,
  removeQueue,
  takeNext,
  validateAuditorEntries,
  writeQueue,
} from "./queue.js"
import { formatRecommendation, readReport, reportKind } from "./report.js"
import { recoveryCommand } from "./requests.js"
import {
  type BriefResult,
  type CloseResult,
  type RoundResult,
  runBrief,
  runClose,
  runRound,
} from "./round.js"
import {
  deleteRoundReports,
  type ManualPhase,
  type MarkerKind,
  manualPhasePaths,
  markerKinds,
  markerPath,
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
import {
  activePlan,
  closingPlan,
  planStem,
  resolvePlan,
  roundContext,
  targetRequest,
} from "./target.js"
import { readVet } from "./vet.js"

/** What the command line selected, captured by the subcommand actions. */
type Invocation =
  | { readonly kind: "episode"; readonly target?: string }
  | { readonly kind: "plan" }
  | {
      readonly kind: "name"
      /** Absent when the runner takes the newest plan. */
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
  | { readonly kind: "delete-reports"; readonly nameStart: string }
  | {
      readonly kind: "mark"
      readonly marker: MarkerKind
      /** Absent when the marker takes the plan `plan` prints. */
      readonly stem?: string
    }
  | {
      readonly kind: "round"
      /** Absent when the runner takes the newest plan. */
      readonly first?: string
      readonly rest: readonly string[]
      readonly auditor?: readonly AuditorEntry[]
      /** The `--first` selection, which replaces the default auditor's first round. */
      readonly firstAuditor?: AuditorEntry
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
  | {
      readonly kind: "close"
      /** Absent when the close takes the plan `plan` prints. */
      readonly stem?: string
      /** Present when the episode never shipped, carrying why. */
      readonly aborted?: string
      readonly verbose?: boolean
    }

function sessionTag(value: string): string {
  if (!/^[ao][btu][lmhx]$/.test(value))
    throw new InvalidArgumentError(
      "Expected a full session tag, such as oth or oux.",
    )
  return value
}

/** One option's entries in the queue's grammar; an empty list is refused. */
function auditorEntries(value: string, option: AuditorOption): AuditorEntry[] {
  let entries: AuditorEntry[]
  try {
    entries = parseAuditors(value, option)
  } catch (error) {
    throw new InvalidArgumentError(errorMessage(error))
  }
  if (entries.length === 0)
    throw new InvalidArgumentError("Expected at least one auditor.")
  return entries
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
      "[options] [target] [scope-or-commits...]\n       audit-round brief [options] [transcript]\n       audit-round close [options] [stem]\n       audit-round plan",
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
      ).argParser((value) => auditorEntries(value, "--auditor")),
    )
    .addOption(
      new Option(
        "--first <selection>",
        "first auditor of an automatic series (see below)",
      )
        .argParser((value) => {
          const [entry, ...more] = auditorEntries(value, "--first")
          if (more.length > 0)
            throw new InvalidArgumentError(
              "Expected one auditor. Use --auditor for a list.",
            )
          return entry
        })
        .conflicts("auditor"),
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
  Plan     A stem names a plan in the sibling plan repo. .md and -widen are ignored.
           Paths are refused. Active plans precede archives. A stem shaped like a
           commit reference keeps .md to identify it as a plan.
           Alone, the stem runs the audit the plan's history calls for:
             - no step has landed: a plan audit of the plan document
             - its newest audit was not clean: that audit's scope again
             - every repo with a landed step has its implemented marker: all steps
           Anything else stops and names the landed steps.
  Scope    One step (3), an increasing range (1-3) or all audits implementation.
           A scope is refused until a step has landed.
  Commits  SHA, HEAD, HEAD-<n>, a space-separated list or <from>..<to> in Repo Edu.
           HEAD-1 is the previous first-parent commit. Ranges include both ends.
  Omitted  Options without a target take the active plan with the newest stem
           commit in either repo, which audit-round plan prints, as if named alone.
  The first line of every run names the round it resolved.

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
      When that assistant's audit setting is a pair, supply both fields. A
      partial tag is refused because it does not name one member of the pair.

  Quote the whole --auditor value if it contains spaces.
  Each selection applies to both audit and rebuttal. Other phases keep their settings.
  The default auditor comes from settings.json.
  Without --auditor, a settled plan starts an automatic series with that default.
  --first <selection> takes one entry in the same form and runs it instead of the
  default for the first round. It cannot be combined with --auditor.
  Settings file: tools/audit-round/settings.json in the Repo Edu checkout.

Round sequence:

  Automatic series (settled plan without --auditor):
    - The configured default auditor runs first, or the --first selection.
    - A continue recommendation names the next assistant. A stop recommendation
      ends the series. No queue file is written.
    - A configured audit pair takes turns within this command. A coin flip picks
      its first member. --first and other command-line choices take no turn.
    - settings.json sets the maximum round count, including the first round.
    - Widening plans and commit targets still run once.

  Manual order (--auditor):
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
    5. Final recommendation
                 In an automatic round whose rebuttal ran, the auditor resumes
                 after the fix and replaces the report's recommendation.
    6. Brief     A plain-words summary follows the fix.
                 Runs only with --brief.

  Skipping rounds and stopping:
    - If the audit finds nothing, the round ends before vet or any later phase.
    - Every completed detailing or implementation round prints its recommendation
      and reason, including the named assistant for a continuation.
    - In a manual queue, a clean audit or stop recommendation skips entries that
      resolve to the same assistant, model and effort. Other settings still run.
    - A continue recommendation leaves a manual queue unchanged.
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

  4. Run the audit the newest plan calls for with Codex.

     $ pnpm audit-round --auditor codex

  5. Start an automatic series on all steps with Codex instead of the default.

     $ pnpm audit-round example all --first codex

Use pnpm audit-round brief --help or close --help for their arguments and options.`,
    )
    .action(
      (
        first: string | undefined,
        rest: string[],
        flags: {
          auditor?: readonly AuditorEntry[]
          first?: AuditorEntry
          watch: boolean
          brief?: boolean
          verbose?: boolean
        },
      ) => {
        // The target's first argument already holds the name `first`.
        const { first: firstAuditor, ...rounds } = flags
        invocation = { kind: "round", first, rest, firstAuditor, ...rounds }
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
      "the same plan or commit target accepted by a round, or none for the newest plan",
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
    .command("plan")
    .description(
      "Print the plan a round or close given no stem takes: the active plan with the newest stem commit.",
    )
    .action(() => {
      invocation = { kind: "plan" }
    })
  command
    .command("delete-reports", { hidden: true })
    .description(
      "Delete one round's audit, vet and rebuttal reports at the plan root and list them.",
    )
    .argument(
      "<target-round>",
      "exact target and round, such as example-impl-02..02-01",
      (value: string) => {
        if (!/^[^/]+-\d{2,}$/.test(value))
          throw new InvalidArgumentError(
            "Expected a target and round, such as example-impl-02..02-01.",
          )
        return value
      },
    )
    .action((nameStart: string) => {
      invocation = { kind: "delete-reports", nameStart }
    })
  command
    .command("mark", { hidden: true })
    .description(
      "Claim the plan's next round number for an empty settle or reopen marker and print its path.",
    )
    .argument(
      "<marker>",
      "settle or reopen, the phase change the marker records",
      (value: string) => {
        if (!(markerKinds as readonly string[]).includes(value))
          throw new InvalidArgumentError("Expected settle or reopen.")
        return value as MarkerKind
      },
    )
    .argument("[stem]", "an active plan, or none for the newest plan")
    .action((marker: MarkerKind, stem: string | undefined) => {
      invocation = { kind: "mark", marker, stem }
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
  command
    .command("close")
    .description(
      "Close a plan's loop: archive the plan, write each repo's closed commit and delete its sidecars.",
    )
    .argument(
      "[stem]",
      "the active plan to close; defaults to the plan audit-round plan prints",
    )
    .option(
      "--aborted <reason>",
      "archive an episode that never shipped under archive/aborted/, recording why",
      (value: string) => {
        if (value.trim().length === 0)
          throw new InvalidArgumentError("Expected the reason for the abort.")
        return value
      },
    )
    .option("-v, --verbose", "show tool calls as well as assistant text")
    .action(
      (
        stem: string | undefined,
        flags: { aborted?: string; verbose?: boolean },
      ) => {
        invocation = { kind: "close", stem, ...flags }
      },
    )
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
    /** Supplies the first member of each configured pair in deterministic tests. */
    readonly coin?: () => AuditSlot
  },
): Promise<number> {
  const invocation = parseInvocation(argv, options)
  if (typeof invocation === "number") return invocation
  let output: RoundOutput | undefined
  let result: RoundResult | BriefResult | CloseResult | undefined
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
      options.terminal.write(await defaultPlan(context))
      return 0
    }
    if (invocation.kind === "delete-reports") {
      const deleted = await deleteRoundReports(
        context.planRoot,
        invocation.nameStart,
      )
      if (deleted.length === 0)
        throw new Error(
          `No audit, vet or rebuttal report of ${invocation.nameStart} at ${context.planRoot}.`,
        )
      options.terminal.write(
        deleted.map((name) => `Deleted ${name}`).join("\n"),
      )
      return 0
    }
    if (invocation.kind === "mark") {
      let plan: string
      if (invocation.stem === undefined) plan = await defaultPlan(context)
      else {
        const stem = planStem(invocation.stem)
        const active = await activePlan(context.planRoot, stem)
        if (active === null)
          throw new Error(
            `No active plan named ${stem} at ${context.planRoot}. A marker records a phase change of an active plan.`,
          )
        plan = active
      }
      const marker = await markerPath(context, plan, invocation.marker)
      claimRound(marker)
      options.terminal.write(marker)
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
        : invocation.kind === "close"
          ? {
              ...invocation,
              plan:
                invocation.stem === undefined
                  ? await defaultPlan(context)
                  : await closingPlan(context.planRoot, invocation.stem),
            }
          : {
              ...invocation,
              target: await resolveTarget(
                context,
                invocation.first === undefined
                  ? null
                  : targetRequest(invocation.first, invocation.rest),
              ),
            }
    if (
      prepared.kind === "round" &&
      "commits" in prepared.target &&
      (prepared.auditor?.length ?? 1) > 1
    )
      throw new InvalidArgumentError(
        "Commit audits run once. Multiple auditors require a plan target.",
      )
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
    // The close moves the plan and commits in the plan checkout first.
    const session = roundContext(
      context,
      prepared.kind === "brief"
        ? await transcriptKind(prepared.transcript)
        : prepared.kind === "close"
          ? "planning"
          : prepared.target.roundKind,
    )
    const settings = options.settings ?? (await readSettings())
    if (prepared.kind === "round") {
      try {
        if (prepared.auditor !== undefined)
          validateAuditorEntries(prepared.auditor, settings)
        if (prepared.firstAuditor !== undefined)
          validateAuditorEntries([prepared.firstAuditor], settings)
      } catch (error) {
        throw new InvalidArgumentError(errorMessage(error))
      }
    }
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
      deleteRoundReports,
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
        const completion = await completeClean(input, stamps)
        active.cleanCompletion(completion.message)
        return completion
      },
      readReport: async (file, kind) =>
        readReport(await readFile(file, "utf8"), kind),
      readVet: async (file, findings) =>
        readVet(await readFile(file, "utf8"), findings),
      readDocument: (file) => readFile(file, "utf8"),
      readHead: async (cwd) =>
        (await execa("git", ["rev-parse", "HEAD"], { cwd })).stdout,
      fileExists: async (file) => {
        try {
          await stat(file)
          return true
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") return false
          throw error
        }
      },
      readRecords: async (cwd, before, repository) => {
        const { stdout } = await execa(
          "git",
          ["rev-list", "--reverse", `${before}..HEAD`],
          { cwd },
        )
        const shas = stdout.length === 0 ? [] : stdout.split("\n")
        return Promise.all(
          shas.map(async (sha) => {
            const [subject, message] = await Promise.all([
              execa("git", ["show", "-s", "--format=%s", sha], { cwd }),
              execa("git", ["show", "-s", "--format=%B", sha], { cwd }),
            ])
            return {
              repository,
              sha,
              subject: subject.stdout,
              message: message.stdout,
            }
          }),
        )
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
    } else if (prepared.kind === "close") {
      const run = closeRun(
        prepared.plan,
        context.planRoot,
        now(),
        selections,
        settings,
      )
      const active = open(run)
      result = await runClose(
        {
          ...session,
          plan: prepared.plan,
          tag: run.tag,
          record: run.record,
          reason: prepared.aborted ?? null,
        },
        dependenciesFor(active),
        settings,
      )
      active.finish(result)
    } else {
      const [first, ...queued] = prepared.auditor ?? []
      const automatic =
        prepared.auditor === undefined &&
        "plan" in prepared.target &&
        !basename(prepared.target.plan).endsWith("-widen.md")
      // Only an explicit auditor list owns an editable queue. Automatic series
      // keep their next seat in this invocation, and other targets run once.
      const queue =
        prepared.auditor !== undefined && "plan" in prepared.target
          ? await queueFile({ ...session, ...prepared.target })
          : null
      let rest: readonly AuditorEntry[] = queued
      if (queue !== null) await writeQueue(queue, rest)
      let seat: AuditorSeat | null = first ??
        prepared.firstAuditor ?? {
          assistant: settings.defaultAuditor,
          override: noOverride,
        }
      const nextPairSlots: Partial<Record<Assistant, AuditSlot>> = {}
      const coin = options.coin ?? (() => (Math.random() < 0.5 ? 0 : 1))
      const takeAuditSlot = (current: AuditorSeat): AuditSlot => {
        if (
          current.override !== noOverride ||
          auditPair(current.assistant, settings) === null
        )
          return 0
        const slot = nextPairSlots[current.assistant] ?? coin()
        nextPairSlots[current.assistant] = slot === 0 ? 1 : 0
        return slot
      }
      let target = prepared.target
      let completed = 0
      try {
        do {
          if (completed > 0 && "plan" in target) {
            const stem = planStem(target.plan)
            const plan = await resolvePlan(context.planRoot, stem)
            target = { ...target, plan }
            if (automatic && basename(plan).endsWith("-widen.md")) {
              await output?.message(
                `Automatic auditor series stopped after ${completed} round${completed === 1 ? "" : "s"}: ${plan} is now widening.`,
              )
              if (result === undefined)
                throw new Error(
                  "Automatic auditor series changed phase before completing a round",
                )
              code = result.status === "failed" ? 1 : 0
              return code
            }
            if (automatic)
              await output?.message(
                `Next round: ${seat.assistant}, as recommended; ${settings.maximumAutomaticRounds - completed} rounds remain before the maximum.`,
              )
          }
          const setup = {
            ...session,
            ...target,
            auditor: seat.assistant,
            override: seat.override,
            auditSlot: takeAuditSlot(seat),
            brief: prepared.brief,
            automatic,
          }
          const run = await roundRun(
            setup,
            now(),
            selections,
            settings,
            automatic || completed > 0 || rest.length > 0
              ? completed + 1
              : undefined,
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
          if (round.status === "finished" && round.recommendation !== null)
            await active.message(formatRecommendation(round.recommendation))
          if (!automatic && queue === null) break
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
          if (automatic) {
            const recommendation = round.recommendation
            if (recommendation === null)
              throw new Error(
                "Automatic settled round finished without a recommendation",
              )
            if (recommendation.decision === "stop") {
              await active.message(
                `Automatic auditor series stopped on the round recommendation after ${completed} round${completed === 1 ? "" : "s"}.`,
              )
              break
            }
            if (completed >= settings.maximumAutomaticRounds) {
              await active.message(
                `Automatic auditor series reached its maximum of ${settings.maximumAutomaticRounds} rounds.`,
              )
              break
            }
            seat = {
              assistant: recommendation.assistant,
              override: noOverride,
            }
            continue
          }
          const ending = round.cleanAudit
            ? "Clean audit"
            : round.recommendation?.decision === "stop"
              ? "Stop recommendation"
              : null
          const ended =
            ending === null ? null : auditorSetting(seat, selections, settings)
          if (queue === null) break
          const taken = await takeNext(queue, ended, selections, settings)
          if (taken.skipped > 0)
            await active.message(
              `${ending} by ${ended?.assistant} on ${ended?.model} ${ended?.effort ?? "effort unavailable"}; skipped ${taken.skipped} queued ${taken.skipped === 1 ? "entry" : "entries"} with the same setting.`,
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

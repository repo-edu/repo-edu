import { readFile, stat, writeFile } from "node:fs/promises"
import { dirname, join, relative, resolve } from "node:path"
import {
  Command,
  CommanderError,
  InvalidArgumentError,
  Option,
} from "commander"
import { format, isValid, parse } from "date-fns"
import { execa } from "execa"
import { join as shellJoin } from "shellwords"
import {
  type AssistantRuntime,
  assistantDependencies,
  runAssistantPhase,
} from "./assistant.js"
import { completeClean } from "./clean.js"
import { type ExecutionContext, executionContext } from "./context.js"
import {
  type AuditTargets,
  defaultPlan,
  type LifecycleStage,
  lifecycleStage,
  resolveTargets,
} from "./default-target.js"
import { readWatchEvidence } from "./episode.js"
import { readLog } from "./episode-log.js"
import {
  archiveSeries,
  closedRoundFilesText,
  commitEvidence,
  evidenceFailureText,
  moveClosedRoundFiles,
  movedSeriesText,
  planRoundFiles,
  restoreSeries,
} from "./evidence.js"
import { errorMessage, observedOutput } from "./feedback.js"
import { runGlance, writeWatchRecord } from "./glance.js"
import {
  type ImplementationResult,
  type PreparedImplementation,
  prepareImplementation,
  readImplementationProgress,
  runImplementation,
  type WorkerResume,
} from "./implement.js"
import {
  implementationIdentity,
  implementationRun,
} from "./implement-output.js"
import { auditorText, openingAuditor, readSeriesEvidence } from "./judge.js"
import {
  activeRoundData,
  archiveRoundData,
  commitOnly,
  markImplemented,
  readReadyCoder,
  readyPlan,
  requirePlanAtHead,
  requireReadyMarker,
  type SettleCommit,
  settlePlan,
} from "./lifecycle.js"
import { type ModelsReportOptions, modelsReport } from "./models.js"
import { type OpenDeferral, openDeferrals } from "./open-deferrals.js"
import {
  closeRun,
  closeStamps,
  type OutputOptions,
  RoundOutput,
  type Run,
  roundRun,
} from "./output.js"
import { elapsedText } from "./output-format.js"
import type { Pager } from "./pager.js"
import {
  type AuditorOption,
  type AuditorSeat,
  type AuditorSelectionSource,
  auditLevels,
  auditRoles,
  type DeferralChainOutcome,
  type LandedRecord,
  listedSeat,
  noOverride,
  type RoundDependencies,
  roundFixer,
  targetWorkClass,
} from "./phase.js"
import { readPlanSteps } from "./plan-steps.js"
import {
  type AuditorEntry,
  auditorSetting,
  parseAuditors,
  takeNext,
  writeQueue,
} from "./queue.js"
import { replayReport } from "./replay.js"
import { recoveryCommand } from "./requests.js"
import {
  type CloseResult,
  type RoundResult,
  runClose,
  runRound,
} from "./round.js"
import {
  type DisprovedFinding,
  findingRevision,
  type LandedCommit,
  readSeriesRoundData,
  readStoredRound,
  roundDataFilename,
  writeDisprovedFinding,
} from "./round-data.js"
import {
  commitTargetLabel,
  type MarkerKind,
  markerPath,
  planTargetKind,
  queueFile,
  roundSubject,
  targetLabel,
} from "./round-paths.js"
import {
  answerFormText,
  listenForRuling,
  type RulingDialog,
  type RulingInput,
  rulingDialogText,
  sendRulingAnswer,
  type WaitingRuling,
  waitingRulingText,
  waitingRun,
} from "./ruling-wait.js"
import { RunClock } from "./run-clock.js"
import { claimRound } from "./run-files.js"
import { type Auditor, type RoundSettings, readSettings } from "./settings.js"
import { namedAnswer } from "./split-answers.js"
import { splitStage } from "./split-output.js"
import { prepareAssistants, resolveCacheRoot } from "./startup.js"
import { parseSubject } from "./subject.js"
import {
  type AuditTarget,
  activePlan,
  archivedPlans,
  type CommitGroup,
  type CommitTarget,
  commitTargetRequest,
  isActivePlanPath,
  planPhase,
  planRepositoryPrefix,
  planStem,
  planTargetRequest,
  type RoundContext,
  type RoundKind,
  refusePath,
  requiredActivePlan,
  resolvePlan,
  roundContext,
  splitSource,
  type TargetRequest,
} from "./target.js"

/** What the command line selected, captured by the subcommand actions. */
type Invocation =
  | {
      readonly kind: "episode"
      readonly target?: string
      readonly lines: LineRange
    }
  | (ModelsReportOptions & { readonly kind: "models" })
  | { readonly kind: "replay" }
  | {
      readonly kind: "disprove"
      readonly stem: string
      readonly target: string
      readonly reason: string
      readonly finding:
        | {
            readonly round: number
            readonly number: number
            readonly statement:
              | { side: "finding" | "vet" }
              | { revision: string }
          }
        | {
            readonly auditor: {
              readonly model: string
              readonly effort: "low" | "medium" | "high" | "xhigh"
            }
          }
    }
  | { readonly kind: "plan" }
  | {
      readonly kind: "ruling"
      /** Absent when the command takes the one run that waits. */
      readonly target?: string
    }
  | {
      readonly kind: "answer"
      /** Absent when the command takes the one run that waits. */
      readonly target?: string
      readonly file: string
    }
  | {
      readonly kind: "settle"
      /** Absent when the lifecycle command takes the plan `plan` prints. */
      readonly stem?: string
    }
  | {
      readonly kind: "ready"
      /** Absent when the lifecycle command takes the plan `plan` prints. */
      readonly stem?: string
    }
  | {
      readonly kind: "implement"
      readonly stem: string
      readonly scope?: string
      readonly verbose?: boolean
      /** A failed worker's step and session, which this entry resumes. */
      readonly resume?: WorkerResume
    }
  | {
      readonly kind: "mark"
      readonly marker: MarkerKind
      /** Absent when the marker takes the plan `plan` prints. */
      readonly stem?: string
    }
  | (SeriesOptions & {
      readonly kind: "round"
      readonly stem?: string
      readonly scopes: readonly string[]
    })
  | (SeriesOptions & {
      readonly kind: "round-commits"
      readonly commits: readonly string[]
    })
  | {
      readonly kind: "close"
      /** Absent when the close takes the plan `plan` prints. */
      readonly stem?: string
      /** Present when the episode never shipped, carrying why. */
      readonly aborted?: string
      readonly verbose?: boolean
    }
  | {
      readonly kind: "run"
      readonly stem: string
      readonly verbose?: boolean
      /** A failed worker's step and session, which this entry resumes. */
      readonly resume?: WorkerResume
    }
  | {
      readonly kind: "split"
      readonly mode: "both" | "run" | "design"
      readonly path: string
      readonly verbose?: boolean
    }

/**
 * The commands that may write a round file. Each ends with an evidence commit;
 * the others write nothing there and leave a hand-run session's files for the
 * next of these.
 */
const roundFileWriters: ReadonlySet<Invocation["kind"]> = new Set([
  "run",
  "round",
  "round-commits",
  "implement",
  "close",
  "mark",
  "settle",
  "disprove",
  "split",
])

/** Both round commands use these options. The full plan run supplies the defaults. */
type SeriesOptions = {
  readonly auditor?: readonly AuditorEntry[]
  readonly first?: AuditorEntry
  readonly watch: boolean
  readonly verbose?: boolean
}

function requestedTarget(
  invocation: Extract<Invocation, { kind: "round" | "round-commits" }>,
): TargetRequest | null {
  if (invocation.kind === "round-commits")
    return commitTargetRequest(invocation.commits)
  return invocation.stem === undefined
    ? null
    : planTargetRequest(invocation.stem, invocation.scopes)
}

/**
 * A resolved target list runs one automatic series per target. It joins no
 * `--auditor` list, whose editable queue belongs to one target and whose
 * pairing with several targets would need a second reading.
 */
function requireSingleTarget(
  invocation: Extract<Invocation, { kind: "round" }>,
  targets: AuditTargets,
): void {
  if (targets.length === 1) return
  if (invocation.auditor !== undefined)
    throw new InvalidArgumentError(
      "A scope list runs one automatic series per scope. Use --auditor with one scope.",
    )
}

type LineRange = {
  readonly first: number
  readonly last: number
}

type DisprovedAuditor = Extract<
  Extract<Invocation, { kind: "disprove" }>["finding"],
  { readonly auditor: unknown }
>["auditor"]

function disprovedAuditor(value: string): DisprovedAuditor {
  const match = /^(\S+) (low|medium|high|xhigh)$/.exec(value)
  if (match === null)
    throw new InvalidArgumentError(
      'Expected "<model> <effort>", with effort low, medium, high or xhigh.',
    )
  return {
    model: match[1],
    effort: match[2] as DisprovedAuditor["effort"],
  }
}

function positiveInteger(value: string, name: string): number {
  if (!/^[1-9]\d*$/.test(value))
    throw new InvalidArgumentError(`Expected a positive ${name} number.`)
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed))
    throw new InvalidArgumentError(`Expected a safe positive ${name} number.`)
  return parsed
}

type DisproveOptions = {
  by?: DisprovedAuditor
  vet?: boolean
  revision?: string
}

function disproveInvocation(
  value: string,
  target: string,
  details: readonly string[],
  { by: auditor, vet, revision }: DisproveOptions,
): Extract<Invocation, { kind: "disprove" }> {
  if (/[\\/]/.test(value))
    throw new InvalidArgumentError("Name the plan by its stem, without a path.")
  const stem = planStem(value)
  if (!target.startsWith(`${stem}-`) || /[\\/\s]/.test(target))
    throw new InvalidArgumentError(
      `Expected the stored round target to start with ${stem}-.`,
    )
  const reasonAt = auditor === undefined ? 2 : 0
  const reason = details.slice(reasonAt).join(" ").trim()
  if (reason.length === 0)
    throw new InvalidArgumentError("Expected the full reason for the ruling.")
  if (auditor !== undefined)
    return {
      kind: "disprove",
      stem,
      target,
      reason,
      finding: { auditor },
    }
  if (details.length < 3)
    throw new InvalidArgumentError(
      'Expected <round> <finding> <reason>, or --by "<model> <effort>" <reason>.',
    )
  return {
    kind: "disprove",
    stem,
    target,
    reason,
    finding: {
      round: positiveInteger(details[0], "round"),
      number: positiveInteger(details[1], "finding"),
      statement:
        revision === undefined
          ? { side: vet ? "vet" : "finding" }
          : { revision },
    },
  }
}

type DisproveFile = {
  readonly path: string
  readonly archived: boolean
}

async function disproveFile(
  context: ExecutionContext,
  invocation: Extract<Invocation, { kind: "disprove" }>,
): Promise<DisproveFile> {
  const active = await activePlan(context.activeRoot, invocation.stem)
  let directory = context.roundRoot
  let archived = false
  if (active === null) {
    const plans = await archivedPlans(context.planRoot, invocation.stem)
    if (plans.length === 0)
      throw new Error(
        `No active or archived plan named ${invocation.stem} in plan checkout ${context.planRoot}.`,
      )
    if (plans.length > 1)
      throw new Error(
        `More than one archived plan is named ${invocation.stem}: ${plans.map((plan) => relative(context.planRoot, plan)).join(", ")}`,
      )
    directory = dirname(plans[0])
    archived = true
  }
  return {
    path: await disprovePath(directory, invocation),
    archived,
  }
}

async function disprovePath(
  directory: string,
  { stem, target, finding }: Extract<Invocation, { kind: "disprove" }>,
): Promise<string> {
  if ("auditor" in finding) {
    const kind = planTargetKind(stem, target)
    if (kind === null)
      throw new InvalidArgumentError(
        `The target must be ${stem}-plan-audit or a ${stem}-impl-audit-<scope> target.`,
      )
    return join(directory, roundDataFilename(stem, kind))
  }

  for (const kind of ["planning", "implementation"] as const) {
    const path = join(directory, roundDataFilename(stem, kind))
    const round = await readStoredRound(path, target, finding.round)
    if (round === null) continue
    const retained = round.findings.find(
      (entry) => entry.number === finding.number,
    )
    if (retained === undefined)
      throw new Error(
        `No finding ${finding.number} exists in ${target} round ${finding.round}.`,
      )
    if ("revision" in finding.statement)
      findingRevision(retained, finding.statement.revision)
    return path
  }
  throw new Error(`No ${target} round ${finding.round} exists for ${stem}.`)
}

function lineRange(value: string): LineRange {
  const match = /^([1-9]\d*)-([1-9]\d*)$/.exec(value)
  const first = Number(match?.[1])
  const last = Number(match?.[2])
  if (
    match === null ||
    !Number.isSafeInteger(first) ||
    !Number.isSafeInteger(last) ||
    first > last
  )
    throw new InvalidArgumentError(
      "Expected an increasing one-based line range, such as 1-200.",
    )
  return { first, last }
}

/** One value keeps a session with the step it served; a session ID holds no colon. */
function workerResume(value: string): WorkerResume {
  const match = /^([1-9]\d*):([^:\s]+)$/.exec(value)
  const step = Number(match?.[1])
  if (match === null || !Number.isSafeInteger(step))
    throw new InvalidArgumentError(
      "Expected <step>:<session-id>, as a failed implementation worker prints it.",
    )
  return { step, sessionId: match[2] }
}

const resumeOption = () =>
  new Option(
    "--resume <step:session-id>",
    "resume a failed implementation worker's session on its step",
  ).argParser(workerResume)

function watchEvidencePage(evidence: string, range: LineRange): string {
  const lines = evidence.split("\n")
  const page = lines.slice(range.first - 1, range.last)
  const returned =
    page.length === 0
      ? "none"
      : `${range.first}-${range.first + page.length - 1}`
  return [`Evidence lines ${returned} of ${lines.length}.`, ...page].join("\n")
}

/**
 * How one auditor series ended. `settle` and `ready` carry the runner's
 * lifecycle answer and `complete` says every requested round ran: a stop
 * answer, an exhausted manual queue or the one round a target without a
 * series asked for.
 * `limit` is the round maximum reached with another auditor due, and `stopped`
 * an ending that needs the user: a failure, an unanswered ruling, a red watch,
 * a phase change or a chained deferral round that ended the series.
 */
type SeriesEnding = "settle" | "ready" | "complete" | "limit" | "stopped"

type DeferralState = {
  readonly deferrals: readonly OpenDeferral[]
}

async function deferralState(
  context: ExecutionContext,
  stem: string,
): Promise<DeferralState> {
  const [repoEdu, plan] = await Promise.all([
    readLog(context.repoEduRoot),
    readLog(context.planRoot),
  ])
  const logs = { "repo-edu": repoEdu, plan }
  return { deferrals: openDeferrals(stem, logs) }
}

function openDeferralText(stem: string, deferrals: readonly OpenDeferral[]) {
  if (deferrals.length === 0) return `No deferrals are open for ${stem}.`
  return [
    `Open deferrals for ${stem}:`,
    ...deferrals.map(
      (deferral) =>
        `- ${deferral.deferringRepository}@${deferral.sha}/${deferral.position} [${deferral.tier.toUpperCase()}] -> ${deferral.destination}: ${deferral.title}`,
    ),
  ].join("\n")
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

const roundUsage = `[options]
       audit-round round [options] <stem>
       audit-round round [options] <stem> plan
       audit-round round [options] <stem> <step-scope>...`

const commitRoundUsage = `[options] <commits>
       audit-round round-commits [options] [<commits>] ${planRepositoryPrefix}<commits>`

function withAuditorOptions(command: Command): Command {
  return command
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
    .option("-v, --verbose", "show tool calls as well as assistant text")
}

const auditorSelectionHelp = `Auditor selection (--auditor <selections>):
  <selections> is a list of names or tags, separated by commas or spaces.
  Each entry runs one round, from left to right: --auditor a,o runs a round
  audited by Claude, then a round audited by Codex. Each entry is one of:

    claude | codex
      Use that assistant's default selection in settings.json.

    <assistant>[<tier>][<effort>]
      A capability tag, written without spaces. Brackets mark optional fields.
      <assistant>  a = Claude, o = Codex
      <tier>       b = base model, t = top model
      <effort>     l = low, m = medium, h = high, x = xhigh
      Omitted fields use the assistant's default selection in settings.json.

  Quote the whole --auditor value if it contains spaces.
  Each selection applies to both audit and rebuttal. Other phases keep their settings.
  The default auditor is a listed auditor of the target work class's auditor
  list in settings.json.
  Without --auditor, the runner starts an automatic series.
  A --first <selection> opens it when supplied and must resolve to a listed
  auditor. Otherwise, a listed auditor without a current read opens when another
  has one. Otherwise, the configured default opens. --first cannot be combined
  with --auditor.
  Settings file: tools/audit-round/settings.json in the Repo Edu checkout.`

/** Resolve a yearless local date backwards, including 29 February across non-leap years. */
function modelsFromDate(value: string, now: number): Date {
  const inYear = (year: number) => parse(value, "dd-MM", new Date(year, 0, 1))
  const leapYearDate = inYear(2000)
  if (!isValid(leapYearDate) || format(leapYearDate, "dd-MM") !== value)
    throw new InvalidArgumentError("Expected a calendar date in DD-MM format.")
  for (let year = new Date(now).getFullYear(); ; year--) {
    const date = inYear(year)
    if (date.getTime() <= now) return date
  }
}

function parseInvocation(
  argv: readonly string[],
  started: number,
  options: Pick<OutputOptions, "terminal"> & {
    readonly emergency: (text: string) => void
  },
): Invocation | number {
  let invocation: Invocation | undefined
  const command = new Command("audit-round")
    .enablePositionalOptions()
    .helpCommand(false)
    .description(
      "Run a plan through its close, run one of its stages or audit Git commits.\nArguments have the same meaning from either checkout.",
    )
    .configureHelp({
      helpWidth: 88,
      subcommandTerm: (subcommand) => subcommand.name(),
    })
    .usage(
      `run [options] <stem>
       audit-round round ${roundUsage}
       audit-round round-commits ${commitRoundUsage}
       audit-round models [options]
       audit-round replay
       audit-round disprove [options] <stem> <target> <round> <finding> <reason>
       audit-round settle [stem]
       audit-round ready [stem]
       audit-round implement [options] <stem> [scope]
       audit-round close [options] [stem]
       audit-round split [options] [design | run] <path>
       audit-round plan`,
    )
    .configureOutput({
      writeOut: (text) => options.terminal.write(text.trimEnd()),
      writeErr: (text) => options.emergency(text.trimEnd()),
    })
    .exitOverride()
  command
    .command("run")
    .description("Run an active plan from its current stage through its close.")
    .argument("<stem>", "the active plan to run")
    .option("-v, --verbose", "show tool calls as well as assistant text")
    .addOption(resumeOption())
    .addHelpText(
      "after",
      `
The run takes the named active plan from the stage its state calls for through
its close: the widening series, settle, the detailing series, ready, the
implementation, the audit range series and the close. Invoking it is your settle,
ready and close call. Any other ending stops the run with the stage's own lines,
and the same command continues from where the plan stands. Once the full step
range's newest series has ended on stop and no plan commit has changed a
file since, the run goes straight to the close. Each series opens with a listed
auditor without a current read when another has one, or the configured default.
It runs the glance and the watch.
A failed implementation worker prints this command with --resume, which resumes
that worker's session on its step before the run continues.`,
    )
    .action(
      (stem: string, flags: { verbose?: boolean; resume?: WorkerResume }) => {
        invocation = { kind: "run", stem, ...flags }
      },
    )
  withAuditorOptions(command.command("round"))
    .description("Audit a plan document or the implementation of its steps.")
    .usage(roundUsage)
    .argument("[stem]")
    .argument("[scope...]")
    .option(
      "--no-watch",
      "skip the trajectory glance and watch after every round",
    )
    .addHelpText(
      "after",
      `
Notation:
  <name>      Supply a value.
  [item]      The item is optional.
  <item>...   Supply one or more items.
  Type round and plan exactly as shown.

Arguments:
  <stem>
    The name of an active plan in the sibling plan repo. Supply the name
    without a directory path. You may omit the -widen and .md suffixes.

  <step-scope>
    One positive step number or an inclusive range in ascending order,
    such as 2 or 3-5. Separate multiple scopes with spaces or commas.
    The runner audits each scope separately, in the order given. At least
    one step of the plan must have landed. With --auditor, supply one scope.

Choosing the audit:
  With no positional arguments
    Select the active plan whose latest plan commit is the newest across
    both repos. The command audit-round plan prints the selected path.
    Continue as if that plan's <stem> had been supplied alone.

  <stem> alone
    Before any step has landed, audit the plan document.

    Once every listed step has landed in every repo that hosts it, and each
    such repo has an implemented marker newer than its last step for this
    plan, audit the ranges listed under "Audit ranges:" in order. Then
    audit all steps together. If the plan lists only the full range,
    audit it once.

    Otherwise, stop and report the pending steps and missing or stale
    markers by repo.

  <stem> plan
    Audit the plan document regardless of which steps have landed.

  <stem> <step-scope>...
    Audit the implementation of the specified steps.

${auditorSelectionHelp}

Round sequence:

  Automatic series (without --auditor):
    - A --first selection opens the series when supplied. Otherwise, a listed
      auditor without a current read opens when another has one. Otherwise,
      the configured default opens. A random default picks that opener from the
      target work class's auditor list in each scope's series.
    - After each non-red round, the runner applies fixed rules. A read is current
      when it started after the latest real-bug audit, lifecycle change, plan
      step or outside plan edit. When every listed auditor has a current read,
      widening settles or stops from its settling line, detailing answers
      ready before its marker and every other case stops. Otherwise the runner
      chooses the listed auditor without a current read that read least
      recently.
    - No queue file is written.
    - settings.json sets the maximum round count, including the first round.
    - A plan phase change ends the series.

  Scope list (2,3-5,6-7):
    - Each scope runs its own series on its own target and files, in list order.
      The opener is chosen again for each scope, and --first opens every scope.
    - A stop answer or the maximum ends only that scope.
    - A failure, an unanswered ruling, a red watch or a plan phase change
      ends the whole list and names the scopes that did not run.
    - A scope list is refused beside --auditor, whose queue belongs to one scope.

  Manual order (--auditor):
    - Every round runs on the same plan scope.
    - Repeat a name or tag to run another round with that auditor.

  Queue file (manual series):
    - The entries after the current round wait in <target>-queue.md at the
      active folder. Each round prints its path and what it holds.
    - Edit it at any time to add, remove or reorder rounds. It takes the same
      names and tags, separated by commas, spaces or line breaks. The runner
      reads it between rounds, so an edit applies from the next round on.
    - An empty or deleted file ends the sequence after the current round.
    - The file stays in the active folder until the close moves it.

  Phases within a round:
    1. Audit     The selected auditor reports findings.
    2. Vet       Every vetter listed for the work class reviews those findings,
                 side by side, whoever audited.
    3. Rebuttal  A new session on the auditor's model answers each vetter's
                 revisions, drops or ruling items. Skipped if every vetter
                 accepts every finding.
    4. Fix       The assistant set in settings.json fixes the accepted findings.
    5. Watch     The trajectory watch runs when its glance says it is due.

  Skipping rounds and stopping:
    - If the audit finds nothing, it skips vet, rebuttal, fix and watch. The
      automatic series still applies the runner rules.
    - The runner's answer and reason print after the round, stay in its retained
      data and repeat in the line that stops the series or opens the next round.
      A settle or ready answer ends the series with that command to run.
    - In a manual queue, a clean audit skips entries that resolve to the same
      assistant, model and effort. Other settings still run.
    - A fix that records a clean result does not skip later rounds.
    - A failure stops the sequence. A decision asks for your reply in the runner.
      A submitted reply resumes the fix and sequence. Leaving without a reply
      stops both.

  Trajectory watch:
    - After a completed plan round with findings, the glance decides if a watch is due.
    - A red watch stops the sequence, so you act on it before more rounds run.
    - --no-watch skips both the glance and the watch.

Examples (from either checkout):

  1. Audit steps 1-3, first with Codex and then with Claude.

     $ pnpm audit-round round example 1-3 --auditor codex,claude

  2. Audit step 3 with Claude's top model at xhigh effort (atx),
     then Codex's base model at medium effort (obm).

     $ pnpm audit-round round example 3 --auditor atx,obm

  3. Run the audit the newest plan calls for with Codex.

     $ pnpm audit-round round --auditor codex

  4. Start an automatic series on steps 1-4 with Codex instead of the default.

     $ pnpm audit-round round example 1-4 --first codex

  5. Run an automatic series on step 2, then on steps 3-5, then on steps 6-7.

     $ pnpm audit-round round example 2,3-5,6-7

Use pnpm audit-round run <stem> to take a plan from its current stage through its close.`,
    )
    .action(
      (stem: string | undefined, scopes: string[], flags: SeriesOptions) => {
        invocation = { kind: "round", stem, scopes, ...flags }
      },
    )
  withAuditorOptions(command.command("round-commits"))
    .description(
      "Audit a set of Git commits from Repo Edu, the plan repo or both.",
    )
    .usage(commitRoundUsage)
    .argument("<commits...>")
    .option(
      "--no-watch",
      "commit audits always skip the trajectory glance and watch",
    )
    .addHelpText(
      "after",
      `
Notation:
  <name>      Supply a value.
  [item]      The item is optional.
  Type round-commits and the prefix ${planRepositoryPrefix} exactly as shown.

Arguments:
  <commits>
    Supply a single commit reference, a list of references separated by
    spaces or commas, or one inclusive range written <from>..<to>.
    Both endpoints are commit references in the same repo. The first must
    be an ancestor of the last or the same commit.

    A commit reference is a 4- to 40-digit hexadecimal commit ID, HEAD or
    HEAD-<n>, where <n> is a non-negative first-parent distance from HEAD.

    References before ${planRepositoryPrefix} belong to Repo Edu. Put ${planRepositoryPrefix} directly before
    the first reference in the plan repo. All following references belong
    to that repo. The runner audits the selected commits together.

${auditorSelectionHelp}

Round sequence:
  Each round audits the selected commits together. Later rounds in the same series
  also audit fixes landed by earlier rounds. With --auditor, the entries run in
  the given order. Without it, the automatic series ends when every listed auditor
  has a current read or the configured round limit is reached.

Examples (from either checkout):

  1. Audit both repo shares of one change as one round.

     $ pnpm audit-round round-commits HEAD ${planRepositoryPrefix}HEAD

  2. Audit one Repo Edu commit and one plan repo commit by ID as one round.

     $ pnpm audit-round round-commits 3f2a1c9 ${planRepositoryPrefix}5c71e0a

  3. Audit an inclusive commit range in the plan repo.

     $ pnpm audit-round round-commits ${planRepositoryPrefix}HEAD-2..HEAD`,
    )
    .action((commits: string[], flags: SeriesOptions) => {
      invocation = { kind: "round-commits", commits, ...flags }
    })
  command
    .command("episode", { hidden: true })
    .description(
      "Print a line range of joined Git and round data evidence for a hand-run watch without writing files.",
    )
    .argument(
      "[stem-or-commit]",
      "topic or anchor commit; defaults to the newest topic across both repos; HEAD means Repo Edu",
    )
    .requiredOption(
      "--lines <start-end>",
      "one-based inclusive evidence lines, such as 1-200",
      lineRange,
    )
    .action((target: string | undefined, flags: { lines: LineRange }) => {
      invocation = { kind: "episode", target, lines: flags.lines }
    })
  command
    .command("ruling", { hidden: true })
    .description(
      "Print what the run that waits for a ruling asks, for the ruling chat.",
    )
    .argument(
      "[target]",
      "the plan stem or commit label of the waiting run; defaults to the one run that waits",
    )
    .action((target: string | undefined) => {
      invocation = { kind: "ruling", target }
    })
  command
    .command("answer", { hidden: true })
    .description(
      "Send one answer document to the run that waits for a ruling and print the waiting run's response.",
    )
    .argument(
      "<target-and-file...>",
      "an optional plan stem or commit label, then the answer file",
    )
    .action((parts: string[]) => {
      if (parts.length > 2)
        throw new InvalidArgumentError(
          "Expected an optional target and one answer file.",
        )
      const file = parts.at(-1) as string
      invocation =
        parts.length === 2
          ? { kind: "answer", target: parts[0], file }
          : { kind: "answer", file }
    })
  command
    .command("implement")
    .description(
      "Implement a ready plan's remaining shares, one fresh assigned-coder worker per step.",
    )
    .argument("<stem>", "the active ready plan to implement")
    .argument("[scope]", "one step or an inclusive increasing step range")
    .option("-v, --verbose", "show tool calls as well as assistant text")
    .addOption(resumeOption())
    .action(
      (
        stem: string,
        scope: string | undefined,
        flags: { verbose?: boolean; resume?: WorkerResume },
      ) => {
        invocation = { kind: "implement", stem, scope, ...flags }
      },
    )
  command
    .command("models")
    .description(
      "Read auditor, vetter and coder results and later rulings from retained records without starting assistants.",
    )
    .option(
      "--from <DD-MM>",
      "include runs starting at local midnight on the most recent matching date or later",
      (value) => modelsFromDate(value, started),
    )
    .option("--winners", "include the ruling and ruler winner tables")
    .option(
      "--all",
      "include the winner tables, C vetters by auditor and judge, per-plan round data and excluded plans",
    )
    .action((flags: ModelsReportOptions) => {
      invocation = { kind: "models", ...flags }
    })
  command
    .command("replay")
    .description(
      "Replay retained automatic-series answers through the fixed runner rules.",
    )
    .action(() => {
      invocation = { kind: "replay" }
    })
  command
    .command("disprove")
    .description("Record a later ruling on an audit finding.")
    .argument("<stem>", "the active or archived plan")
    .argument("<target>", "the round-data target exactly as stored")
    .argument(
      "<details...>",
      "<round> <finding> <reason>, or the reason when --by names the auditor",
    )
    .option(
      "--by <model-effort>",
      "record a finding absent from retained round data",
      disprovedAuditor,
    )
    .addOption(
      new Option("--vet", "record that the finding stood as written").conflicts(
        "by",
      ),
    )
    .addOption(
      new Option(
        "--revision <tag>",
        "credit this vetter's revision of the finding",
      ).conflicts(["by", "vet"]),
    )
    .action(
      (
        stem: string,
        target: string,
        details: string[],
        flags: DisproveOptions,
      ) => {
        invocation = disproveInvocation(stem, target, details, flags)
      },
    )
  command
    .command("split")
    .description(
      "Design and carry out a file split, design only or run a saved answer.",
    )
    .argument("<path-or-mode>", "source path, design or run")
    .argument(
      "[path]",
      "source for design, or numbered move list or designer's answer for run",
    )
    .option("-v, --verbose", "show tool calls as well as assistant text")
    .addHelpText(
      "after",
      "\n  split <source>\n  split design <source>\n  split run <move list>",
    )
    .action(
      (
        first: string,
        path: string | undefined,
        flags: { verbose?: boolean },
      ) => {
        if (first === "design" || first === "run") {
          if (!path)
            throw new InvalidArgumentError(`split ${first} needs a path`)
          invocation = { kind: "split", mode: first, path, ...flags }
        } else {
          if (path)
            throw new InvalidArgumentError(
              "Use split <source>, split design <source> or split run <move list>",
            )
          invocation = { kind: "split", mode: "both", path: first, ...flags }
        }
      },
    )
  command
    .command("plan")
    .description(
      "Print the plan a round or close given no stem takes: the active plan with the newest stem commit.",
    )
    .action(() => {
      invocation = { kind: "plan" }
    })
  command
    .command("mark", { hidden: true })
    .description(
      "Claim the plan's next round number for an empty reopen marker and print its path.",
    )
    .argument(
      "<marker>",
      "reopen, the phase change the marker records",
      (value: string) => {
        if (value !== "reopen")
          throw new InvalidArgumentError("Expected reopen.")
        return value as MarkerKind
      },
    )
    .argument("[stem]", "an active plan, or none for the newest plan")
    .action((marker: MarkerKind, stem: string | undefined) => {
      invocation = { kind: "mark", marker, stem }
    })
  for (const kind of ["settle", "ready"] as const) {
    command
      .command(kind)
      .description(
        kind === "settle"
          ? "Rename a widening plan onto its settled name, commit the rename and leave its marker."
          : "Record that a settled plan is ready for implementation with an empty commit.",
      )
      .argument(
        "[stem]",
        `the active plan to ${kind}; defaults to the plan audit-round plan prints`,
      )
      .action((stem: string | undefined) => {
        invocation = { kind, stem }
      })
  }
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
    // A bare command line prints help and exits successfully.
    command.parse(argv.length === 0 ? ["--help"] : [...argv], { from: "user" })
  } catch (error) {
    // Commander reports its own refusals before its exit override throws a
    // plain CommanderError. A refusal thrown from an action reaches here
    // unreported, so it takes the runner's prefix like a later refusal.
    if (error instanceof InvalidArgumentError) {
      options.emergency(`audit-round: ${error.message}`)
      return 2
    }
    if (error instanceof CommanderError) return error.exitCode === 0 ? 0 : 2
    throw error
  }
  if (invocation === undefined) return 0
  return invocation
}

/**
 * The plan a close archives, resolved before any assistant starts. A close
 * without an abort reason archives shipped work, so it refuses a plan whose
 * stem scan holds no `ready` marker.
 */
async function closePlan(
  context: ExecutionContext,
  invocation: Extract<Invocation, { kind: "close" }>,
): Promise<string> {
  const plan =
    invocation.stem === undefined
      ? await defaultPlan(context)
      : await requiredActivePlan(context.activeRoot, invocation.stem, "close")
  if (invocation.aborted === undefined)
    await requireReadyMarker(context.planRoot, plan)
  return plan
}

/**
 * A close of an active plan runs the close session. A close of a plan already
 * under `archive/` whose round data or round files still sit in the round
 * folder has one thing left to do: a resumed close session moved the plan
 * without the runner there to move them, so the rerun finishes those moves
 * and starts no session.
 */
async function preparedClose(
  context: ExecutionContext,
  invocation: Extract<Invocation, { kind: "close" }>,
) {
  if (invocation.stem !== undefined) {
    refusePath(invocation.stem)
    const stem = planStem(invocation.stem)
    if (
      (await activePlan(context.activeRoot, stem)) === null &&
      ((await activeRoundData(context, stem)).length > 0 ||
        (await planRoundFiles(context.roundRoot, stem)).length > 0) &&
      (await archivedPlans(context.planRoot, stem)).length > 0
    )
      return { ...invocation, leftover: stem }
  }
  const plan = await closePlan(context, invocation)
  const { deferrals } = await deferralState(context, planStem(plan))
  return { ...invocation, plan, deferrals }
}

type PreparedClose = Awaited<ReturnType<typeof preparedClose>>

/**
 * The plan a run takes and the stage its state calls for, resolved before any
 * assistant starts, so a refused plan starts nothing.
 */
async function preparedRun(
  context: ExecutionContext,
  invocation: Extract<Invocation, { kind: "run" }>,
) {
  const plan = await requiredActivePlan(
    context.activeRoot,
    invocation.stem,
    "run",
  )
  const stage = await lifecycleStage(context, plan)
  if (stage === "widening" || stage === "detailing")
    await requirePlanAtHead(context.planRoot, plan)
  return { ...invocation, stem: planStem(plan), stage }
}

type PreparedRun = Awaited<ReturnType<typeof preparedRun>>

function planRunCommand(run: Extract<Invocation, { kind: "run" }>): string[] {
  return [
    "pnpm",
    "audit-round",
    run.kind,
    run.stem,
    ...(run.verbose ? ["-v"] : []),
  ]
}

/** One landed commit with the subject and message its round's records are read from. */
async function readLandedRecord(
  cwd: string,
  sha: string,
  repository: LandedCommit["repository"],
): Promise<LandedRecord> {
  const [subject, message] = await Promise.all([
    execa("git", ["show", "-s", "--format=%s", sha], { cwd }),
    execa("git", ["show", "-s", "--format=%B", sha], { cwd }),
  ])
  return { repository, sha, subject: subject.stdout, message: message.stdout }
}

const runStageNames: Readonly<Record<LifecycleStage, string>> = {
  widening: "widening series",
  detailing: "detailing series",
  implement: "implementation",
  ranges: "audit range series",
  close: "close",
}

/** The close works in the plan checkout, as the planning stages do. */
function stageRoundKind(stage: LifecycleStage): RoundKind {
  return stage === "widening" || stage === "detailing" || stage === "close"
    ? "planning"
    : "implementation"
}

/** What a settle reports, from the settle command and from the run. */
function settleReport(result: SettleCommit): string {
  return [
    `Committed ${result.sha}: ${result.subject}`,
    `Marker: ${result.marker}`,
    ...(result.uncommitted.length === 0
      ? []
      : [
          `Links rewritten but left uncommitted beside other changes: ${result.uncommitted.join(", ")}`,
        ]),
  ].join("\n")
}

export async function runCommand(
  argv: readonly string[],
  runtime: AssistantRuntime,
  options: Omit<OutputOptions, "clock"> & {
    /** The invocation's time source; its clock and every dated record read it. */
    readonly now?: () => number
    readonly emergency: (text: string) => void
    readonly cacheRoot?: string
    readonly repoEduRoot?: string
    readonly settings?: RoundSettings
    /** Answers a waiting ruling in place of the socket, in tests. */
    readonly awaitAnswer?: (
      ruling: WaitingRuling,
    ) => Promise<RulingInput | null>
    /** Shows each ruling wait in a window that needs a click; none where the platform has none. */
    readonly dialog?: RulingDialog
    /** Supplies a random default's opener index below the count in deterministic tests. */
    readonly coin?: (count: number) => number
    /** Shows the model read-out in the full-screen view before it is printed. */
    readonly pager?: Pager
  },
): Promise<number> {
  const now = options.now ?? Date.now
  // One clock per invocation, so the run reading spans every output it opens.
  const clock = new RunClock(now)
  const invocation = parseInvocation(argv, clock.invocation.instant, options)
  if (typeof invocation === "number") return invocation
  let output: RoundOutput | undefined
  let result: RoundResult | CloseResult | undefined
  let code = 1
  /** Set once the context resolves, so the command's evidence commit knows its checkout. */
  let evidenceRoot: string | undefined
  const commandText = shellJoin(["audit-round", ...argv])
  /** A finished or interrupted outcome exits clean; only a failure exits 1. */
  const exitCode = (outcome: { readonly status: string }): number =>
    outcome.status === "failed" ? 1 : 0
  try {
    const context = await executionContext(options.repoEduRoot)
    evidenceRoot = context.evidenceRoot
    if (invocation.kind === "episode") {
      const { evidence } = await readWatchEvidence({
        ...context,
        target: invocation.target,
      })
      options.terminal.write(watchEvidencePage(evidence, invocation.lines))
      return 0
    }
    if (invocation.kind === "models") {
      const modelSettings = options.settings ?? (await readSettings())
      const readOut = await modelsReport(context, modelSettings, invocation)
      await options.pager?.(readOut)
      options.terminal.write(readOut, "markdown")
      return 0
    }
    if (invocation.kind === "replay") {
      options.terminal.write(await replayReport(context), "markdown")
      return 0
    }
    if (invocation.kind === "disprove") {
      const file = await disproveFile(context, invocation)
      const date = format(new Date(now()), "yyyy-MM-dd")
      let entry: DisprovedFinding
      let subject: string
      if ("round" in invocation.finding) {
        const statement = invocation.finding.statement
        entry = {
          date,
          reason: invocation.reason,
          target: invocation.target,
          round: invocation.finding.round,
          finding: invocation.finding.number,
          ...statement,
        }
        const side =
          "side" in statement && statement.side === "vet"
            ? "vet finding"
            : "finding"
        subject = `${invocation.stem}/disprove: ${invocation.target} round ${invocation.finding.round} ${side} ${invocation.finding.number}`
      } else {
        entry = {
          date,
          reason: invocation.reason,
          auditor: invocation.finding.auditor,
        }
        subject = `${invocation.stem}/disprove: ${invocation.target} by ${invocation.finding.auditor.model} ${invocation.finding.auditor.effort}`
      }
      writeDisprovedFinding(file.path, entry)
      if (file.archived) {
        const commit = await commitOnly({
          cwd: context.planRoot,
          subject,
          body: invocation.reason,
          paths: [relative(context.planRoot, file.path)],
        })
        options.terminal.write(`Committed ${commit.sha}: ${commit.subject}`)
      } else {
        options.terminal.write(
          `Recorded the later ruling in ${file.path}. Loop-close will commit it with the archive move.`,
        )
      }
      return 0
    }
    if (invocation.kind === "plan") {
      options.terminal.write(await defaultPlan(context))
      return 0
    }
    if (invocation.kind === "ruling") {
      const { ruling } = await waitingRun(
        resolveCacheRoot(runtime, options.cacheRoot),
        invocation.target,
      )
      options.terminal.write(
        `${waitingRulingText(ruling)}\n${answerFormText(ruling)}`,
      )
      return 0
    }
    if (invocation.kind === "answer") {
      const document = await readFile(
        resolve(runtime.cwd, invocation.file),
        "utf8",
      )
      const { socket, ruling } = await waitingRun(
        resolveCacheRoot(runtime, options.cacheRoot),
        invocation.target,
      )
      const sent = await sendRulingAnswer(socket, ruling.target, document)
      options.terminal.write(sent.text)
      return sent.accepted ? 0 : 1
    }
    if (invocation.kind === "mark") {
      let plan: string
      if (invocation.stem === undefined) plan = await defaultPlan(context)
      else {
        const stem = planStem(invocation.stem)
        const active = await activePlan(context.activeRoot, stem)
        if (active === null)
          throw new Error(
            `No active plan named ${stem} at ${context.activeRoot}. A marker records a phase change of an active plan.`,
          )
        plan = active
      }
      const marker = await markerPath(context, plan, invocation.marker)
      claimRound(marker)
      options.terminal.write(marker)
      return 0
    }
    if (invocation.kind === "settle" || invocation.kind === "ready") {
      const plan =
        invocation.stem === undefined
          ? await defaultPlan(context)
          : await requiredActivePlan(
              context.activeRoot,
              invocation.stem,
              invocation.kind,
            )
      if (invocation.kind === "settle") {
        options.terminal.write(settleReport(await settlePlan(context, plan)))
      } else {
        const lifecycleSettings = options.settings ?? (await readSettings())
        const result = await readyPlan(context, plan, lifecycleSettings.coders)
        options.terminal.write(`Committed ${result.sha}: ${result.subject}`)
      }
      return 0
    }
    const prepare = (cwd: string, settings: RoundSettings) =>
      prepareAssistants(
        { ...runtime, cwd },
        {
          message: async (text) => options.terminal.write(text),
          warning: async (text) => options.terminal.write(`Warning: ${text}`),
        },
        settings,
        { cacheRoot: options.cacheRoot },
      )
    if (invocation.kind === "split") {
      const call =
        invocation.mode === "run"
          ? {
              mode: invocation.mode,
              named: await namedAnswer(context, runtime.cwd, invocation.path),
            }
          : {
              mode: invocation.mode,
              source: await splitSource(context.repoEduRoot, invocation.path),
            }
      const settings = options.settings ?? (await readSettings())
      const releases =
        call.mode === "run"
          ? {
              claude: new Map<string, string>(),
              codex: new Map<string, string>(),
            }
          : await prepare(context.repoEduRoot, settings)
      runtime.signal?.throwIfAborted()
      return await splitStage(
        context,
        call,
        runtime,
        { ...options, clock, verbose: invocation.verbose },
        settings,
        releases,
        now(),
        `pnpm ${commandText}`,
      )
    }
    const prepared =
      invocation.kind === "implement"
        ? {
            ...invocation,
            ...(await prepareImplementation(
              context,
              invocation.stem,
              invocation.scope,
            )),
          }
        : invocation.kind === "close"
          ? await preparedClose(context, invocation)
          : invocation.kind === "run"
            ? await preparedRun(context, invocation)
            : {
                ...invocation,
                targets: await resolveTargets(
                  context,
                  requestedTarget(invocation),
                ),
              }
    if (prepared.kind === "round")
      requireSingleTarget(prepared, prepared.targets)
    // The close moves the plan and commits in the plan checkout first.
    const session = roundContext(
      context,
      prepared.kind === "implement"
        ? "implementation"
        : prepared.kind === "close"
          ? "planning"
          : prepared.kind === "run"
            ? stageRoundKind(prepared.stage)
            : prepared.targets[0].roundKind,
    )
    const settings = options.settings ?? (await readSettings())
    runtime.signal?.throwIfAborted()
    const releases = await prepare(session.cwd, settings)
    runtime.signal?.throwIfAborted()
    /**
     * Each round records its own file pair, so a chained run opens one output
     * per round and retires the previous one first. Updates and releases are
     * read once; later rounds reuse them rather than re-entering the CLI.
     */
    const { verbose } = prepared
    const open = (run: Run): RoundOutput => {
      const previous = output
      output = undefined
      previous?.close()
      runtime.signal?.throwIfAborted()
      const active = new RoundOutput(run, { ...options, verbose, clock })
      output = active
      return active
    }
    /**
     * Wait for the chat's answer to one ruling. The run listens before it
     * prints the notice and shows the dialog, so the chat finds it as soon as
     * the user acts on either. The dialog lives as long as the wait: ending
     * the wait closes it, so no stale dialog outlives its ruling.
     */
    const awaitRuling = async (
      active: RoundOutput,
      request: Pick<
        WaitingRuling,
        "ruling" | "reports" | "fixerSide" | "questions" | "panel"
      >,
    ): Promise<RulingInput | null> => {
      const ruling: WaitingRuling = {
        target: active.target,
        title: active.title,
        ...request,
      }
      const seam = options.awaitAnswer
      const answered: () => Promise<RulingInput | null> =
        seam === undefined
          ? await listenForRuling({
              cacheRoot: resolveCacheRoot(runtime, options.cacheRoot),
              ruling,
              signal: runtime.signal,
            }).then((wait) => () => wait.answer)
          : () => seam(ruling)
      // A later ruling of the same session replaces its file, so Git keeps
      // each version before the user is asked.
      const evidence = await commitEvidence(
        context.evidenceRoot,
        `${commandText}: before the ruling wait of ${active.title}`,
      )
      if (evidence.status === "failed")
        await active.message(evidenceFailureText(evidence))
      let answer: RulingInput | null = null
      active.beginRuling(ruling)
      const dialog = new AbortController()
      const shown = options
        .dialog?.(rulingDialogText(ruling), dialog.signal)
        .then((failure) => {
          if (failure !== null) active.dialogFailed(failure)
        })
      try {
        answer = await answered()
        return answer
      } finally {
        dialog.abort()
        await shown
        active.endRuling(answer)
      }
    }
    // The commit stamps are the output's, because the output records which
    // phases ran and a child reads them only when it starts.
    const dependenciesFor = (
      active: RoundOutput,
      phaseContext: RoundContext,
      chainDeferrals: RoundDependencies["chainDeferrals"] = async () => "none",
    ): RoundDependencies => ({
      watchEvidence: readWatchEvidence,
      writeWatchDocument: async (file, document) => {
        await writeFile(file, `${document}\n`, "utf8")
        active.watchDocument(document)
      },
      writeWatchRecord,
      checkFile: async (file) => {
        if (!(await readFile(file, "utf8")).trim())
          throw new Error(`Phase output is empty: ${file}`)
      },
      completeClean: async (input) => {
        const stamps = active.commitStamps()
        if (stamps === undefined) throw new Error("Missing audit model record")
        const completion = await completeClean(input, stamps)
        active.cleanCompletion(completion.message)
        return completion
      },
      seriesEvidence: readSeriesEvidence,
      chainDeferrals,
      readHead: async (cwd) =>
        (await execa("git", ["rev-parse", "HEAD"], { cwd })).stdout,
      readSteps: async (plan) => readPlanSteps(await readFile(plan, "utf8")),
      resolvePlan,
      fileExists: async (file) => {
        try {
          await stat(file)
          return true
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") return false
          throw error
        }
      },
      archiveRoundData: (stem, tag, record) =>
        archiveRoundData(context, stem, tag, record),
      moveRoundFiles: (stem) =>
        moveClosedRoundFiles(context.evidenceRoot, context.roundRoot, stem),
      readRecords: async (cwd, before, repository) => {
        const { stdout } = await execa(
          "git",
          ["rev-list", "--reverse", `${before}..HEAD`],
          { cwd },
        )
        const shas = stdout.length === 0 ? [] : stdout.split("\n")
        return Promise.all(
          shas.map((sha) => readLandedRecord(cwd, sha, repository)),
        )
      },
      readRecord: readLandedRecord,
      ...assistantDependencies(
        { ...runtime, cwd: phaseContext.cwd, commit: active.commitStamps },
        active.phase,
      ),
      writeSettledRound: (commits, account) =>
        active.writeSettledRound(commits, account),
      requestRuling: (request) =>
        awaitRuling(active, {
          ruling: request.document,
          reports: request.reports,
          fixerSide: request.fixerSide,
          questions: request.questions,
          panel: request.panel,
        }),
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

    /**
     * One implementation stage: a worker per pending step, then the markers
     * due. The entry is the typed runner command that owns the stage, so a
     * failed worker's recovery re-enters it with the same authority.
     */
    const implementStage = async (
      implementation: PreparedImplementation,
      entry: {
        readonly command: readonly string[]
        readonly resume: WorkerResume | null
      },
    ): Promise<ImplementationResult["status"]> => {
      const implementationSession = roundContext(context, "implementation")
      const identity = implementationIdentity(
        implementation.coder,
        releases,
        settings,
      )
      const outcome = await runImplementation(
        {
          ...context,
          plan: implementation.plan,
          stem: implementation.stem,
          steps: implementation.steps,
          selectedSteps: implementation.selectedSteps,
          coder: implementation.coder,
          phaseRun: identity.phaseRun,
          release: identity.release,
          effort: identity.effort,
          resume: entry.resume,
        },
        {
          readProgress: () =>
            readImplementationProgress(
              context,
              implementation.stem,
              implementation.steps,
            ),
          openStep: async (step, _shares, resumedSession) => {
            const run = implementationRun(
              implementation.plan,
              context.roundRoot,
              step.number,
              now(),
              releases,
              settings,
              identity,
              resumedSession,
            )
            open(run)
            return { rulingFile: run.ruling }
          },
          runWorker: async (input) => {
            const active = output
            if (active === undefined)
              throw new Error("Implementation worker has no active output")
            const expected = {
              model: input.arguments[3],
              effort: input.arguments[4],
            }
            let reported = false
            const phaseOutput = observedOutput(active.phase, (feedback) => {
              if (feedback.type !== "model") return
              reported = true
              if (
                feedback.selection.model !== expected.model ||
                feedback.selection.effort !== expected.effort
              )
                throw new Error(
                  `Implement worker reported ${feedback.selection.model} ${feedback.selection.effort ?? "effort unavailable"}; the runner launched ${input.assistant} on ${expected.model} ${expected.effort}.`,
                )
            })
            const worker = await runAssistantPhase(input, phaseOutput, {
              ...runtime,
              cwd: implementationSession.cwd,
              env: {
                ...runtime.env,
                COMMIT_AUDITOR: "",
                COMMIT_PHASES: "",
                COMMIT_SERIES: "",
              },
            })
            if (worker.status !== "failed" && !reported)
              return {
                status: "failed" as const,
                sessionId: worker.sessionId,
                reason:
                  "Implement worker finished without reporting its model and effort.",
              }
            return worker
          },
          checkFile: async (file) => {
            if (!(await readFile(file, "utf8")).trim())
              throw new Error(`Phase output is empty: ${file}`)
          },
          requestRuling: async (request) => {
            const active = output
            if (active === undefined)
              throw new Error("Implementation ruling has no active output")
            const answer = await awaitRuling(active, {
              ruling: request.document,
              reports: [],
              fixerSide: null,
              questions: [],
              panel: [],
            })
            return answer?.reply ?? null
          },
          markImplemented: (repository) =>
            markImplemented(
              context,
              implementation.stem,
              repository,
              identity.tag,
              identity.record,
            ),
          message: async (text) => {
            if (output === undefined) options.terminal.write(text)
            else await output.message(text)
          },
        },
      )
      if (outcome.status === "finished") {
        await output?.message(
          outcome.markers.length === 0
            ? "Implementation finished; no completion marker was due."
            : "Implementation finished.",
        )
        if (output === undefined && outcome.markers.length === 0)
          options.terminal.write(
            "Implementation finished; no completion marker was due.",
          )
        code = 0
      } else {
        const line =
          outcome.status === "failed"
            ? `Step ${outcome.step} failed: ${outcome.reason}`
            : `Step ${outcome.step} stopped without a ruling reply.`
        if (output === undefined) options.terminal.write(line)
        else await output.message(line)
        // A failed worker returns through its runner entry; an unanswered
        // ruling is answered in the worker's own session.
        if (outcome.session !== null) {
          const resume = `Resume: ${
            outcome.status === "failed"
              ? shellJoin([
                  ...entry.command,
                  "--resume",
                  `${outcome.step}:${outcome.session.sessionId}`,
                ])
              : recoveryCommand(outcome.session)
          }`
          if (output === undefined) options.terminal.write(resume)
          else await output.message(resume)
        }
        code = outcome.status === "failed" ? 1 : 0
      }
      return outcome.status
    }
    /** One loop-close session on its plan and the open deferrals resolved before it. */
    const closeStage = async (
      close: PreparedClose,
    ): Promise<CloseResult["status"]> => {
      if ("leftover" in close) {
        const { tag, record } = closeStamps(releases, settings)
        const commit = await archiveRoundData(
          context,
          close.leftover,
          tag,
          record,
        )
        const moved = await moveClosedRoundFiles(
          context.evidenceRoot,
          context.roundRoot,
          close.leftover,
        )
        options.terminal.write(
          [
            commit === null
              ? `No round data of ${close.leftover} is left in ${context.roundRoot}.`
              : `Committed ${commit.sha}: ${commit.subject}`,
            closedRoundFilesText(close.leftover, moved),
          ].join("\n"),
        )
        code = 0
        return "finished"
      }
      const closeSession = roundContext(context, "planning")
      const run = await closeRun(close.plan, context, now(), releases, settings)
      const active = open(run)
      const closed = await runClose(
        {
          ...closeSession,
          plan: close.plan,
          tag: run.tag,
          record: run.record,
          reason: close.aborted ?? null,
          deferrals: close.deferrals,
        },
        dependenciesFor(active, closeSession),
        settings,
      )
      result = closed
      if (closed.status === "finished") {
        if (closed.archived !== null)
          await active.message(
            `Committed ${closed.archived.sha}: ${closed.archived.subject}`,
          )
        await active.message(
          closedRoundFilesText(planStem(close.plan), closed.moved),
        )
      }
      active.finish(closed, runtime.signal)
      code = exitCode(closed)
      return closed.status
    }
    /**
     * The command a stopped round prints to continue it: the command the user
     * typed. A commit target is spelled by its original commits, each by its
     * six-character ID, because a `HEAD` form typed again names other commits
     * once `HEAD` has moved and the stopped round would not be found. An
     * omitted plan is named explicitly because another plan may have gained
     * the newest stem commit since the series started.
     */
    const rerunCommand = (target: AuditTarget): string => {
      if (invocation.kind === "run")
        return shellJoin(planRunCommand(invocation))
      if (invocation.kind !== "round" && invocation.kind !== "round-commits")
        throw new Error(`The ${invocation.kind} command opens no round`)
      const words =
        "groups" in target
          ? target.originalGroups.flatMap((group) =>
              group.commits.map(
                (commit, index) =>
                  `${group.repository === "plan" && index === 0 ? planRepositoryPrefix : ""}${commit.slice(0, 6)}`,
              ),
            )
          : invocation.kind === "round" && invocation.stem !== undefined
            ? [invocation.stem, ...invocation.scopes]
            : [planStem(target.plan)]
      return shellJoin([
        "pnpm",
        "audit-round",
        invocation.kind,
        ...words,
        ...(invocation.auditor === undefined
          ? []
          : [
              "--auditor",
              invocation.auditor.map((entry) => entry.text).join(","),
            ]),
        ...(invocation.first === undefined
          ? []
          : ["--first", invocation.first.text]),
        ...(invocation.watch ? [] : ["--no-watch"]),
        ...(invocation.verbose === true ? ["-v"] : []),
      ])
    }
    /**
     * The audit series a resolved target list asks for, one per target in
     * order. The ending is the last series' own, or `stopped` when a series
     * needed the user and the rest of the list did not run.
     */
    const seriesStage = async (
      targets: AuditTargets,
      series: SeriesOptions,
    ): Promise<SeriesEnding> => {
      const seriesSession = roundContext(context, targets[0].roundKind)
      const [first, ...queued] = series.auditor ?? []
      const automatic =
        series.auditor === undefined &&
        ("groups" in targets[0] ||
          isActivePlanPath(context.activeRoot, targets[0].plan))
      const coin =
        options.coin ?? ((count: number) => Math.floor(Math.random() * count))
      const cacheRoot = resolveCacheRoot(runtime, options.cacheRoot)
      const workClass = targetWorkClass(targets[0])
      const classAuditors = auditRoles(workClass, settings).auditors
      // A random default spreads first looks over every listed auditor without
      // binding any entry to the first position on every target.
      const settingsOpener = (auditors: readonly Auditor[]): AuditorSeat =>
        listedSeat(
          auditors[
            settings.defaultAuditor === "random" ? coin(auditors.length) : 0
          ],
        )
      const opened = first ?? series.first
      // The series routes among the listed auditors only.
      const pool: readonly AuditorSeat[] = classAuditors.map(listedSeat)
      // The rules read each round's auditor as the release its CLI resolved,
      // so the auditor list keeps every listed auditor under that same name.
      const poolAuditors = pool.map((seat) =>
        auditorSetting(seat, releases, settings),
      )
      // The series ends on one current read per listed auditor, so a
      // `--first` auditor outside the list would read without counting.
      if (series.first !== undefined) {
        const firstText = auditorText(
          auditorSetting(series.first, releases, settings),
        )
        if (!poolAuditors.some((auditor) => auditorText(auditor) === firstText))
          throw new InvalidArgumentError(
            `--first ${series.first.text} resolves to ${firstText}, which the auditor list ${auditLevels[workClass]}.auditors in settings.json does not hold. Name a listed auditor: ${poolAuditors.map(auditorText).join(", ")}.`,
          )
      }
      // Only an implementation plan target reads its ready assignment; the
      // planning fixer and the first coder need none.
      const fixerFor = async (target: AuditTarget) =>
        roundFixer(
          target,
          target.roundKind === "implementation" && "plan" in target
            ? await readReadyCoder(context.planRoot, planStem(target.plan))
            : null,
          settings,
        )
      const deferralsInto = async (
        plan: string,
        destination: "repo-edu" | "plan",
      ) => {
        const state = await deferralState(context, planStem(plan))
        return {
          ...state,
          deferrals: state.deferrals.filter(
            (deferral) => deferral.deferringRepository !== destination,
          ),
        }
      }
      const runDeferralRound = async (
        parent: Extract<AuditTarget, { scope: string }>,
        nested: boolean,
      ): Promise<DeferralChainOutcome> => {
        const { deferrals } = await deferralsInto(parent.plan, "plan")
        if (deferrals.length === 0) return "none"
        const seat = settingsOpener(settings.planningAudit.auditors)
        const currentPlan = await resolvePlan(context, planStem(parent.plan))
        const planningSession = roundContext(context, "planning")
        const setup = {
          ...planningSession,
          roundKind: "planning" as const,
          plan: currentPlan,
          ...(await fixerFor({
            roundKind: "planning",
            plan: currentPlan,
          })),
          auditor: seat.assistant,
          auditorSelectionSource: "settings" as const,
          override: seat.override,
          deferrals,
        }
        const chainedRun = await roundRun(
          { ...setup, implementationSeriesScope: parent.scope },
          now(),
          releases,
          settings,
          rerunCommand(setup),
        )
        const active = nested
          ? new RoundOutput(chainedRun, {
              ...options,
              verbose,
              clock,
            })
          : open(chainedRun)
        try {
          const chained = await runRound(
            {
              ...chainedRun.setup,
              documents: chainedRun.documents,
              transcript: chainedRun.paths.markdown,
              watch: series.watch
                ? { file: chainedRun.watch, cacheRoot }
                : null,
              ...(chainedRun.stored === undefined
                ? {}
                : { stored: chainedRun.stored }),
            },
            dependenciesFor(active, planningSession),
            releases,
            settings,
          )
          if (!nested) result = chained
          active.finish(chained, runtime.signal)
          if (chained.status === "failed") return "failed"
          if (chained.status === "awaiting-ruling") return "awaiting-ruling"
          const landedPlan = await resolvePlan(context, planStem(currentPlan))
          if (planPhase(landedPlan) !== planPhase(currentPlan))
            return "phase-change"
          if (chained.watch === "red") return "red-watch"
          return "finished"
        } finally {
          if (nested) active.close()
        }
      }
      /**
       * One auditor series on one target. Each scope of a list opens as its
       * own series, so the opener is chosen again and the round count starts
       * over. A settle or ready answer names that lifecycle call; stop,
       * the maximum or an exhausted queue ends the series; an ending that
       * needs the user stops the whole list.
       */
      const runSeries = async (initial: AuditTarget): Promise<SeriesEnding> => {
        // Only an `--auditor` sequence owns an editable queue. Automatic
        // series keep their next auditor in this invocation.
        const queue =
          series.auditor !== undefined
            ? await queueFile({ ...seriesSession, ...initial })
            : null
        let rest: readonly AuditorEntry[] = queued
        if (queue !== null) await writeQueue(queue, rest)
        let auditorSelectionSource: AuditorSelectionSource =
          first !== undefined
            ? "--auditor"
            : series.first !== undefined
              ? "--first"
              : "settings"
        let target = initial
        let completed = 0
        // The reason behind the rule answer that chose the next auditor, printed
        // with the next round's opening line so the log carries it.
        let decisionReason: string | null = null
        const seatFor = (chosen: Auditor): AuditorSeat => {
          const index = poolAuditors.findIndex(
            (auditor) => auditorText(auditor) === auditorText(chosen),
          )
          if (index === -1)
            throw new Error(
              `The series rules chose ${auditorText(chosen)}, which the auditor list does not hold`,
            )
          return pool[index]
        }
        /**
         * An automatic series with no `--first` continues where the target's
         * retained data left it: rule 3 opens on a listed auditor without a
         * current read when another has one, so a rerun after a failed round
         * picks up that round's reader rather than the configured default.
         */
        const retainedOpener = async (): Promise<AuditorSeat | null> => {
          if (opened !== undefined || !automatic) return null
          const label = targetLabel(initial)
          const opening = openingAuditor(
            await readSeriesEvidence({ ...seriesSession, target: initial }),
            label,
            poolAuditors,
          )
          if (opening === null) return null
          decisionReason = opening.reason
          return seatFor(opening.answer)
        }
        let seat: AuditorSeat | null =
          opened ?? (await retainedOpener()) ?? settingsOpener(classAuditors)
        const seriesName = (value: AuditTarget): string =>
          "plan" in value
            ? `${roundSubject(value, planStem(value.plan))}: automatic auditor series`
            : "Commit audit: automatic auditor series"
        const advanceCommitTarget = async (
          value: CommitTarget,
          landed: readonly LandedCommit[],
        ): Promise<CommitTarget> => {
          const repositories = new Set(
            value.groups.map((group) => group.repository),
          )
          const unexpected = landed.find(
            (commit) => !repositories.has(commit.repository),
          )
          if (unexpected !== undefined)
            throw new Error(
              `Commit round landed ${unexpected.repository}@${unexpected.sha} outside its original repository groups`,
            )
          const root = (repository: LandedCommit["repository"]): string =>
            repository === "plan" ? context.planRoot : context.repoEduRoot
          // A clean record changes no file, so the next auditor has nothing to
          // read in it. The round data still keeps it among the landed commits.
          const fixes = (
            await Promise.all(
              landed.map(async (commit) => {
                const { subject } = await readLandedRecord(
                  root(commit.repository),
                  commit.sha,
                  commit.repository,
                )
                return parseSubject(subject, commit.repository).class === "C2"
                  ? []
                  : [commit]
              }),
            )
          ).flat()
          const rebuilt = await Promise.all(
            value.groups.map(async (group) => {
              const groupFixes = fixes
                .filter((commit) => commit.repository === group.repository)
                .map((commit) => commit.sha)
              const commits = [
                ...new Set([...group.commits, ...groupFixes]),
              ] as [string, ...string[]]
              const cwd = root(group.repository)
              const startingHead = (
                await execa("git", ["rev-parse", "HEAD"], { cwd })
              ).stdout
              const references = commits.map((commit, index) =>
                group.repository === "plan" && index === 0
                  ? `${planRepositoryPrefix}${commit}`
                  : commit,
              ) as [string, ...string[]]
              return {
                repository: group.repository,
                references,
                startingHead,
                commits,
                shortReferences: commits.map((commit) =>
                  commit.slice(0, 6),
                ) as [string, ...string[]],
              }
            }),
          )
          const first = rebuilt[0]
          if (first === undefined)
            throw new Error("Commit target lost its required repository group")
          const groups: [CommitGroup, ...CommitGroup[]] = [
            first,
            ...rebuilt.slice(1),
          ]
          return {
            ...value,
            groups,
          }
        }
        if ("groups" in target) {
          let retainedCommits: readonly LandedCommit[] = []
          try {
            retainedCommits = (
              await readSeriesRoundData(context, commitTargetLabel(target))
            ).flatMap((round) => round.commits)
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
          }
          if (retainedCommits.length > 0)
            target = await advanceCommitTarget(target, retainedCommits)
        }
        const printDeferrals = async () => {
          if (!("plan" in target)) return
          const state = await deferralState(context, planStem(target.plan))
          await output?.message(
            openDeferralText(planStem(target.plan), state.deferrals),
          )
        }
        const stopForChain = async (
          outcome: Exclude<DeferralChainOutcome, "none" | "finished">,
        ): Promise<"stopped"> => {
          code = outcome === "failed" ? 1 : 0
          const series =
            "plan" in initial
              ? roundSubject(initial, planStem(initial.plan))
              : "Commit audit"
          await output?.message(
            `${series}: automatic auditor series stopped because the chained deferral round ended with ${outcome.replace("-", " ")}.`,
          )
          await printDeferrals()
          return "stopped"
        }
        if (automatic && "scope" in target) {
          const outcome = await runDeferralRound(target, false)
          if (outcome !== "none" && outcome !== "finished")
            return stopForChain(outcome)
        }
        do {
          if (completed > 0 && !automatic && "plan" in target) {
            const plan = await resolvePlan(context, planStem(target.plan))
            target = { ...target, plan }
          }
          const repoEduDeferrals =
            seriesSession.roundKind === "implementation" && "plan" in target
              ? (await deferralsInto(target.plan, "repo-edu")).deferrals
              : undefined
          const setup = {
            ...seriesSession,
            ...target,
            ...(await fixerFor(target)),
            auditor: seat.assistant,
            auditorSelectionSource,
            override: seat.override,
            ...(automatic ? { pool: poolAuditors } : {}),
            ...(repoEduDeferrals === undefined
              ? {}
              : { deferrals: repoEduDeferrals }),
          }
          const run = await roundRun(
            setup,
            now(),
            releases,
            settings,
            rerunCommand(target),
          )
          // A continued round runs on the auditor its kept audit report
          // fixes, so the seat this call chose waits for the round after it.
          const ranSeat: AuditorSeat =
            run.stored === undefined
              ? seat
              : {
                  assistant: run.setup.auditor,
                  override: run.setup.override ?? noOverride,
                }
          const opening =
            run.stored !== undefined
              ? `Continuing round ${run.stored.round}, which ended ${run.stored.status}, on its kept audit report by ${auditorText(auditorSetting(ranSeat, releases, settings))}.`
              : automatic && decisionReason !== null
                ? completed === 0
                  ? `Opening round: ${auditorText(auditorSetting(seat, releases, settings))}. ${decisionReason}`
                  : `Next round: ${auditorText(auditorSetting(seat, releases, settings))}; ${settings.maximumAutomaticRounds - completed} rounds remain before the maximum. ${decisionReason}`
                : null
          if (opening !== null) {
            if (output === undefined) options.terminal.write(opening)
            else await output.message(opening)
          }
          if (
            run.stored !== undefined &&
            queue !== null &&
            first !== undefined
          ) {
            rest = [first, ...rest]
            await writeQueue(queue, rest)
          }
          const active = open(run)
          if (queue !== null)
            await active.message(
              `Queued after this round: ${rest.map((entry) => entry.text).join(", ") || "none"}. Edit ${queue} to add or remove rounds.`,
            )
          const round = await runRound(
            {
              ...run.setup,
              documents: run.documents,
              transcript: run.paths.markdown,
              watch: series.watch ? { file: run.watch, cacheRoot } : null,
              ...(run.stored === undefined ? {} : { stored: run.stored }),
            },
            dependenciesFor(active, seriesSession, (parent) =>
              runDeferralRound(parent, true),
            ),
            releases,
            settings,
          )
          result = round
          code = exitCode(round)
          active.finish(round, runtime.signal)
          completed += 1
          if (
            round.status === "finished" &&
            round.deferralChain !== "none" &&
            round.deferralChain !== "finished"
          )
            return stopForChain(round.deferralChain)
          if (round.status !== "finished") {
            await active.message(
              round.status === "failed"
                ? "Auditor sequence stopped: this round failed."
                : "Auditor sequence stopped: this round required your ruling.",
            )
            if (automatic) await printDeferrals()
            return "stopped"
          }
          if (!automatic && queue === null) return "complete"
          if (automatic && "plan" in target) {
            const previousPhase = planPhase(target.plan)
            const plan = await resolvePlan(context, planStem(target.plan))
            target = { ...target, plan }
            const currentPhase = planPhase(plan)
            if (currentPhase !== previousPhase) {
              await active.message(
                `${roundSubject(target, planStem(plan))}: automatic auditor series stopped after ${completed} round${completed === 1 ? "" : "s"} because the plan changed from ${previousPhase} to ${currentPhase}.`,
              )
              await printDeferrals()
              return "stopped"
            }
          }
          // A red watch asks the user to act now, so no queued round starts first.
          if (round.watch === "red") {
            await active.message(
              `Auditor sequence stopped: the watch graded red. Read ${run.watch} before running more rounds.`,
            )
            if (automatic) await printDeferrals()
            return "stopped"
          }
          if (automatic) {
            const series = seriesName(target)
            const decision = round.decision
            if (decision === null)
              throw new Error(
                "Automatic round finished without a series answer",
              )
            if (decision.answer === "stop") {
              await active.message(
                `${series} stopped after ${completed} round${completed === 1 ? "" : "s"}. ${decision.reason}`,
              )
              await printDeferrals()
              return "complete"
            }
            if (decision.answer === "settle") {
              if (!("plan" in target))
                throw new Error(
                  "Commit series returned the plan-only settle answer",
                )
              await active.message(
                `${series} ended after ${completed} round${completed === 1 ? "" : "s"}. Widening is done: run pnpm audit-round settle ${planStem(target.plan)}. ${decision.reason}`,
              )
              await printDeferrals()
              return "settle"
            }
            if (decision.answer === "ready") {
              if (!("plan" in target))
                throw new Error(
                  "Commit series returned the plan-only ready answer",
                )
              await active.message(
                `${series} ended after ${completed} round${completed === 1 ? "" : "s"}. Detailing is done: run pnpm audit-round ready ${planStem(target.plan)}. ${decision.reason}`,
              )
              await printDeferrals()
              return "ready"
            }
            if (completed >= settings.maximumAutomaticRounds) {
              await active.message(
                `${series} reached its maximum of ${settings.maximumAutomaticRounds} round${settings.maximumAutomaticRounds === 1 ? "" : "s"}.`,
              )
              await printDeferrals()
              return "limit"
            }
            // A `--first` selection opens the first round after a
            // continued one, because the continued round is not its own.
            const waiting = run.stored === undefined ? undefined : opened
            seat = waiting ?? seatFor(decision.answer)
            decisionReason =
              waiting === undefined
                ? decision.reason
                : `--first ${waiting.text} opens the first round after the continued one.`
            auditorSelectionSource =
              waiting === undefined ? "settings" : "--first"
            if ("groups" in target)
              target = await advanceCommitTarget(target, round.commits)
            continue
          }
          const ending = round.cleanAudit ? "Clean audit" : null
          const ended =
            ending === null ? null : auditorSetting(ranSeat, releases, settings)
          if (queue === null) return "complete"
          const taken = await takeNext(queue, ended, releases, settings)
          if (taken.skipped > 0)
            await active.message(
              `${ending} by ${ended?.assistant} on ${ended?.model} ${ended?.effort ?? "effort unavailable"}; skipped ${taken.skipped} queued ${taken.skipped === 1 ? "entry" : "entries"} with the same setting.`,
            )
          seat = taken.next
          auditorSelectionSource = "--auditor"
          rest = taken.rest
          if (seat !== null && "groups" in target)
            target = await advanceCommitTarget(target, round.commits)
          await active.message(
            seat === null
              ? `Auditor sequence finished after ${completed} round${completed === 1 ? "" : "s"}.`
              : `Next round: ${seat.assistant}; ${rest.length + 1} auditor entries remain.`,
          )
        } while (seat !== null)
        return "complete"
      }
      const say = async (text: string | null) => {
        if (text === null) return
        if (output === undefined) options.terminal.write(text)
        else await output.message(text)
      }
      let ending: SeriesEnding = "complete"
      for (const [index, target] of targets.entries()) {
        const later = targets.slice(index + 1)
        if (index > 0 && "plan" in target)
          await output?.message(
            `Next scope: ${roundSubject(target, planStem(target.plan))}; ${later.length} scope${later.length === 1 ? "" : "s"} remain after it.`,
          )
        // A finished commit series waits in its archive folder. A rerun
        // brings it back before anything reads it, so the series keeps its
        // numbering and earlier fixes.
        const label = "groups" in target ? targetLabel(target) : null
        if (label !== null)
          await say(
            movedSeriesText(
              label,
              await restoreSeries(
                context.evidenceRoot,
                context.roundRoot,
                "commit",
                label,
              ),
            ),
          )
        ending = await runSeries(target)
        // A series is finished when the rules stop it. The maximum and every
        // ending that needs the user leave it in the round folder, where its
        // rerun reads it.
        if (label !== null && ending === "complete")
          await say(
            movedSeriesText(
              label,
              await archiveSeries(
                context.evidenceRoot,
                context.roundRoot,
                "commit",
                label,
              ),
            ),
          )
        // Every ending but stopped lets the next scope run.
        if (ending !== "stopped") continue
        const unrun = later.flatMap((scope) =>
          "scope" in scope ? [scope.scope] : [],
        )
        if (unrun.length > 0)
          await output?.message(
            `Scope list stopped before ${unrun.join(", ")}.`,
          )
        break
      }
      return ending
    }
    /**
     * The lifecycle from the stage the plan's state calls for. Invoking it is
     * the user's settle, ready and close call given in advance, so the runner's
     * settle or ready answer and a range series that needed nobody move on
     * through the lifecycle owner's functions. Every other ending ends the
     * run with the stage's own lines; a rerun reads the plan's state again.
     */
    const runStages = async (run: PreparedRun): Promise<void> => {
      const { stem } = run
      const completed: string[] = []
      const say = async (text: string) => {
        if (output === undefined) options.terminal.write(text)
        else await output.message(text)
      }
      // The ending repeats the invocation's reading, so it survives the last stamp.
      const runTime = () =>
        `Run time ${elapsedText(clock.elapsed(clock.invocation))}.`
      const ended = (stage: string) =>
        say(
          `Run of ${stem} ended in the ${stage}${completed.length === 0 ? "" : ` after the ${completed.join(", ")}`}. Once that ending is handled, ${shellJoin(planRunCommand(run))} continues from where the plan stands. ${runTime()}`,
        )
      const defaults: SeriesOptions = { watch: true }
      // A worker's session belongs to the implementation the run starts in.
      if (run.resume !== undefined && run.stage !== "implement")
        await say(
          `${stem} starts in the ${runStageNames[run.stage]}, so session ${run.resume.sessionId} stays unused.`,
        )
      let stage: LifecycleStage = run.stage
      let current: string = runStageNames[stage]
      let closed = false
      try {
        for (;;) {
          current = runStageNames[stage]
          await say(`Run of ${stem}: starting the ${current}.`)
          if (stage === "widening" || stage === "detailing") {
            const plan = await resolvePlan(context, stem)
            const call = stage === "widening" ? "settle" : "ready"
            const ending = await seriesStage(
              [{ roundKind: "planning", plan }],
              defaults,
            )
            if (ending !== call) break
            completed.push(current)
            current = call
            if (call === "settle") {
              await say(settleReport(await settlePlan(context, plan)))
            } else {
              const ready = await readyPlan(context, plan, settings.coders)
              await say(`Committed ${ready.sha}: ${ready.subject}`)
            }
            // A plan reopened after its ready marker keeps that marker, so
            // the plan's state, not the stage just run, names the next stage.
            stage = await lifecycleStage(
              context,
              await resolvePlan(context, stem),
            )
          } else if (stage === "implement") {
            const status = await implementStage(
              await prepareImplementation(context, stem),
              {
                command: planRunCommand(run),
                resume: run.stage === "implement" ? (run.resume ?? null) : null,
              },
            )
            if (status !== "finished") break
            stage = "ranges"
          } else if (stage === "ranges") {
            const targets = await resolveTargets(context, {
              plan: stem,
              scope: null,
            })
            if ((await seriesStage(targets, defaults)) === "stopped") break
            stage = "close"
          } else {
            const status = await closeStage(
              await preparedClose(context, {
                kind: "close",
                stem,
                verbose: run.verbose,
              }),
            )
            closed = status === "finished"
            break
          }
          completed.push(current)
        }
      } catch (error) {
        await ended(current)
        throw error
      }
      if (closed)
        await say(`Run of ${stem} finished: the plan is closed. ${runTime()}`)
      else await ended(current)
    }
    if (prepared.kind === "implement")
      await implementStage(prepared, {
        command: [
          "pnpm",
          "audit-round",
          "implement",
          prepared.stem,
          ...(prepared.scope === undefined ? [] : [prepared.scope]),
          ...(prepared.verbose === true ? ["-v"] : []),
        ],
        resume: prepared.resume ?? null,
      })
    else if (prepared.kind === "close") await closeStage(prepared)
    else if (prepared.kind === "run") await runStages(prepared)
    else await seriesStage(prepared.targets, prepared)
  } catch (error) {
    code = error instanceof InvalidArgumentError ? 2 : 1
    options.terminal.clear()
    options.emergency(`audit-round: ${errorMessage(error)}`)
    // Required recording failures cannot be reported through the failed writer.
    if (result?.status === "failed") {
      options.emergency(
        `[${result.phase}] failed: ${result.reason}\nSession: ${result.sessionId ?? "unavailable"}`,
      )
      const recovery = output?.recoveryText(result) ?? null
      if (recovery !== null) options.emergency(recovery)
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
    // After the run files close, so the commit takes their last lines. A
    // command refused for its arguments wrote no round file, so it leaves any
    // pending file for the next writer rather than commit under its own text.
    if (
      evidenceRoot !== undefined &&
      code !== 2 &&
      roundFileWriters.has(invocation.kind)
    ) {
      const evidence = await commitEvidence(evidenceRoot, commandText)
      if (evidence.status === "failed")
        options.emergency(evidenceFailureText(evidence))
    }
  }
  return code
}

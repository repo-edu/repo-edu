import { readFile, stat, writeFile } from "node:fs/promises"
import { dirname, join, relative } from "node:path"
import {
  Command,
  CommanderError,
  InvalidArgumentError,
  Option,
} from "commander"
import { format } from "date-fns"
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
import { type LogCommit, readLog } from "./episode-log.js"
import { errorMessage } from "./feedback.js"
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
import { auditorText, readJudgeEvidence } from "./judge.js"
import {
  archiveRoundData,
  commitOnly,
  markImplemented,
  readReadyCoder,
  readyPlan,
  requireReadyMarker,
  settlePlan,
} from "./lifecycle.js"
import { modelsReport } from "./models.js"
import { type OpenDeferral, openDeferrals } from "./open-deferrals.js"
import {
  closeRun,
  type OutputOptions,
  RoundOutput,
  type Run,
  roundRun,
} from "./output.js"
import { elapsedText } from "./output-format.js"
import {
  type Assistant,
  type AuditorOption,
  type AuditorSeat,
  type AuditorSelectionSource,
  type DeferralChainOutcome,
  listedSeat,
  phaseWorkflow,
  type RoundDependencies,
} from "./phase.js"
import {
  type AuditorEntry,
  auditorSetting,
  parseAuditors,
  removeQueue,
  takeNext,
  writeQueue,
} from "./queue.js"
import { readReport, reportKind } from "./report.js"
import { recoveryCommand } from "./requests.js"
import {
  type CloseResult,
  failureResumeSessionId,
  type RoundResult,
  runClose,
  runRound,
} from "./round.js"
import {
  type DisprovedFinding,
  type LandedCommit,
  parseRoundDataFile,
  readCommitRoundData,
  roundDataFilename,
  writeDisprovedFinding,
} from "./round-data.js"
import {
  commitTargetLabel,
  deleteRoundReports,
  type ManualPhase,
  type MarkerKind,
  manualPhasePaths,
  markerPath,
  phaseFilename,
  planTargetKind,
  queueFile,
  roundIdentity,
  roundSubject,
} from "./round-paths.js"
import { readRulingReply } from "./ruling-input.js"
import { RunClock } from "./run-clock.js"
import { claimRound } from "./run-files.js"
import { type RoundSettings, readSettings } from "./settings.js"
import { prepareAssistants, resolveCacheRoot } from "./startup.js"
import {
  type AuditTarget,
  activePlan,
  archivedPlans,
  type CommitGroup,
  type CommitTarget,
  commitAuditGroups,
  isActivePlanPath,
  planPhase,
  planRepositoryPrefix,
  planStem,
  type RoundContext,
  type RoundKind,
  requiredActivePlan,
  resolvePlan,
  roundContext,
  type TargetRequest,
  targetRequest,
} from "./target.js"
import { readRebuttal, readVet } from "./vet.js"

/** What the command line selected, captured by the subcommand actions. */
type Invocation =
  | {
      readonly kind: "episode"
      readonly target?: string
      readonly lines: LineRange
    }
  | { readonly kind: "models"; readonly all: boolean }
  | {
      readonly kind: "disprove"
      readonly stem: string
      readonly target: string
      readonly reason: string
      readonly finding:
        | { readonly round: number; readonly number: number }
        | {
            readonly auditor: {
              readonly model: string
              readonly effort: "low" | "medium" | "high" | "xhigh"
            }
          }
    }
  | { readonly kind: "plan" }
  | {
      readonly kind: "deferrals"
      /** Absent when the command takes the plan `plan` prints. */
      readonly stem?: string
    }
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
  | {
      readonly kind: "run"
      readonly stem: string
      readonly verbose?: boolean
      /** A failed worker's step and session, which this entry resumes. */
      readonly resume?: WorkerResume
    }

/** The round options one series reads; the run supplies the defaults alone. */
type SeriesOptions = Pick<
  Extract<Invocation, { kind: "round" }>,
  "auditor" | "firstAuditor" | "watch"
>

function requestedTarget(
  invocation: Extract<Invocation, { kind: "round" | "name" }>,
): TargetRequest | null {
  if (invocation.first === undefined) return null
  return targetRequest(invocation.first, invocation.rest)
}

/**
 * A resolved target list runs one automatic series per target. It joins no
 * `--auditor` list, whose editable queue belongs to one target and whose
 * pairing with several targets would need a second reading, and `name` claims
 * one hand-run round.
 */
function requireSingleTarget(
  invocation: Extract<Invocation, { kind: "round" | "name" }>,
  targets: AuditTargets,
): void {
  if (targets.length === 1) return
  if (invocation.kind === "name")
    throw new InvalidArgumentError(
      "A hand-run round claims one scope. Name one step or range.",
    )
  if (invocation.auditor !== undefined)
    throw new InvalidArgumentError(
      "A scope list runs one automatic series per scope. Use --auditor with one scope.",
    )
}

function sessionTag(value: string): string {
  if (!/^[ao][btu][lmhx]$/.test(value))
    throw new InvalidArgumentError(
      "Expected a full session tag, such as oth or oux.",
    )
  return value
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

function disproveInvocation(
  value: string,
  target: string,
  details: readonly string[],
  auditor?: DisprovedAuditor,
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
  let directory = context.activeRoot
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
  const kind = planTargetKind(invocation.stem, invocation.target)
  if (kind === null)
    throw new InvalidArgumentError(
      `The target must be ${invocation.stem}-plan-audit or a stored ${invocation.stem}-impl-audit-<scope> target.`,
    )
  return {
    path: join(directory, roundDataFilename(invocation.stem, kind)),
    archived,
  }
}

async function requireDisprovedFinding(
  path: string,
  target: string,
  finding: { readonly round: number; readonly number: number },
): Promise<void> {
  let source: string
  try {
    source = await readFile(path, "utf8")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      throw new Error(`No round data exists at ${path}.`)
    throw error
  }
  const file = parseRoundDataFile(path, source)
  const round = file.rounds.find(
    (entry) => entry.target === target && entry.round === finding.round,
  )
  if (round === undefined)
    throw new Error(`No ${target} round ${finding.round} exists in ${path}.`)
  if (!round.findings.some((entry) => entry.number === finding.number))
    throw new Error(
      `No finding ${finding.number} exists in ${target} round ${finding.round}.`,
    )
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
 * How one auditor series ended. `settle` and `ready` carry the judge's
 * recommended lifecycle call, `ended` a judge stop, the round maximum or an
 * exhausted manual queue, and `stopped` an ending that needs the user: a
 * failure, an unanswered ruling, a red watch, a phase change or a chained
 * deferral round that ended the series.
 */
type SeriesEnding = "settle" | "ready" | "ended" | "stopped"

type DeferralState = {
  readonly deferrals: readonly OpenDeferral[]
  readonly logs: Readonly<Record<"repo-edu" | "plan", readonly LogCommit[]>>
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
  return { deferrals: openDeferrals(stem, logs), logs }
}

/** The newest open deferral selects the assistant that recorded its round. */
function deferringAssistant(
  deferral: OpenDeferral,
  logs: DeferralState["logs"],
): Assistant {
  const commit = logs[deferral.deferringRepository].find(
    (candidate) => candidate.sha === deferral.sha,
  )
  const vendor =
    commit === undefined
      ? null
      : /(?:^| )([ao])[btu][lmhx](?: |$)/.exec(commit.subject)?.[1]
  if (vendor === undefined || vendor === null)
    throw new Error(
      `Cannot resolve the assistant that recorded ${deferral.deferringRepository}@${deferral.sha}`,
    )
  return vendor === "a" ? "claude" : "codex"
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

function parseInvocation(
  argv: readonly string[],
  options: Pick<OutputOptions, "terminal"> & {
    readonly emergency: (text: string) => void
  },
): Invocation | number {
  let invocation: Invocation | undefined
  const command = new Command("audit-round")
    .enablePositionalOptions()
    .description(
      "Take a plan from its current stage through its close, or run one of its stages.\nArguments have the same meaning from either checkout.",
    )
    .configureHelp({
      helpWidth: 88,
      subcommandTerm: (subcommand) => subcommand.name(),
    })
    .usage(
      "[options] <stem>\n       audit-round round [options] [target] [scope-or-commits...]\n       audit-round models [options]\n       audit-round disprove <stem> <target> <round> <finding> <reason>\n       audit-round settle [stem]\n       audit-round ready [stem]\n       audit-round implement [options] <stem> [scope]\n       audit-round close [options] [stem]\n       audit-round plan",
    )
    .configureOutput({
      writeOut: (text) => options.terminal.write(text.trimEnd()),
      writeErr: (text) => options.emergency(text.trimEnd()),
    })
    .exitOverride()
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
range's newest series has ended on a judge stop and no plan commit has changed a
file since, the run goes straight to the close. Every series it opens
starts with the default auditor and runs the glance and the watch.
A failed implementation worker prints this command with --resume, which resumes
that worker's session on its step before the run continues.

Use round to run one audit round or series on a plan scope or on commits.
Use models to read the auditor and coder results.
Use disprove to record a finding that later evidence disproved.
Use implement to land ready plan steps on their assigned coder.
Use settle, ready or close to record the corresponding plan lifecycle call.
Use round --help or close --help for their arguments and options.`,
    )
    .action(
      (stem: string, flags: { verbose?: boolean; resume?: WorkerResume }) => {
        invocation = { kind: "run", stem, ...flags }
      },
    )
    // Positional options give an option before a subcommand to the run,
    // which the subcommand never reads. Refusing it keeps an option from
    // being dropped without a word.
    .hook("preSubcommand", (run, subcommand) => {
      const given = run.options
        .filter(
          (option) =>
            run.getOptionValueSource(option.attributeName()) === "cli",
        )
        .map((option) => option.long ?? option.short)
      if (given.length > 0)
        run.error(
          `${given.join(", ")} came before ${subcommand.name()}. Put options after the subcommand, as audit-round ${subcommand.name()} --help shows.`,
        )
    })
  // The program owns the run, so Commander adds no `help` command of its own.
  command
    .command("round")
    .description(
      "Run one audit round or series on a plan scope or on commits: audit, vet, rebuttal and the fix that lands the agreed corrections.",
    )
    .argument(
      "[target]",
      "a plan stem or commit references; see Targets and scope below",
    )
    .argument(
      "[scope-or-commits...]",
      "the planning word, a step scope or more commits; see Targets and scope below",
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
    .option("-v, --verbose", "show tool calls as well as assistant text")
    .addHelpText(
      "after",
      `
Targets and scope:
  Plan     A stem names a plan in the sibling plan repo. .md and -widen are ignored.
           Paths and archived plans are refused. A stem shaped like a commit
           reference keeps .md to identify it as a plan.
           Alone, the stem runs the audit the plan's history calls for:
             - no step has landed: a plan audit of the plan document
             - every listed step has landed in each hosting repo and each repo's
               implemented marker follows its newest hosted step: every Audit ranges:
               scope in order, then the full listed step range; one full-range
               sentence runs that range only
             - otherwise: stop and name pending steps and missing or stale markers
  Scope    One step (3) or an increasing range (1-3) audits implementation.
           A list such as 2,3-5,6-7, separated by commas or spaces, runs one
           automatic series per scope in that order; see Round sequence below.
           A step scope is refused until a step has landed. The word plan selects
           the planning audit whatever has landed, for a plan edited after ready.
  Commits  A commit ID, HEAD or HEAD-<n>, a comma-or-space-separated list of them,
           or an inclusive range <from>..<to>.
           A reference without a prefix is a Repo Edu commit. plan@ marks a plan
           repo commit, as in plan@HEAD or plan@5c71e0a. Every reference after the
           first plan@ one is also a plan repo commit, so list Repo Edu commits
           first. HEAD-1 is the previous first-parent commit in that reference's
           repo. The ordered exact set owns one bounded commit- label and
           round-data file.
  Omitted  round alone, or with options only, takes the active plan with the
           newest stem commit in either repo, which audit-round plan prints, as
           if named alone.
  The first line of every round names the target it resolved.

Auditor selection (--auditor <selections>):
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
  The default auditor is an entry of the auditors list in settings.json.
  Without --auditor, an active plan or commit target starts an automatic series
  with that default.
  --first <selection> takes one entry in the same form and runs it instead of the
  default for the first round. When the auditors list has no entry for its
  assistant, the series may also choose it again. It cannot be combined with
  --auditor.
  Settings file: tools/audit-round/settings.json in the Repo Edu checkout.

Round sequence:

  Automatic series (active plan or commit target without --auditor):
    - The configured default auditor runs first, or the --first selection. A
      random default picks the opener from the auditors list in each scope's
      series.
    - After each non-red round, a fresh judge picks the next listed auditor or
      an ending. In widening it may recommend settle or stop; in detailing
      before the ready marker, ready or stop; otherwise it may stop. A settled
      A finding removes settle in widening; a settled A or B finding removes
      ready and stop otherwise.
    - No queue file is written.
    - settings.json sets the maximum round count, including the first round.
    - A commit round keeps the original bounded label, then adds earlier landed
      fixes to the next round's exact scope and advances its repository heads.
      It has no watch. A phase change ends a plan series.

  Scope list (2,3-5,6-7):
    - Each scope runs its own series on its own target and files, in list order.
      The opener is chosen again for each scope, and --first opens every scope.
    - A judge stop or the maximum ends only that scope.
    - A failure, an unanswered ruling, a red watch or a plan phase change
      ends the whole list and names the scopes that did not run.
    - A scope list is refused beside --auditor, whose queue belongs to one scope.

  Manual order (--auditor):
    - Every round runs on the same plan scope or commit series. A later commit
      round reads the original commits and earlier landed fixes.
    - Repeat a name or tag to run another round with that auditor.

  Queue file (manual series):
    - The entries after the current round wait in <target>-queue.md at the
      active folder. Each round prints its path and what it holds.
    - Edit it at any time to add, remove or reorder rounds. It takes the same
      names and tags, separated by commas, spaces or line breaks. The runner
      reads it between rounds, so an edit applies from the next round on.
    - An empty or deleted file ends the sequence after the current round.
    - The runner deletes the file when the sequence ends.

  Phases within a round:
    1. Audit     The selected auditor reports findings.
    2. Vet       The other assistant reviews those findings.
    3. Rebuttal  The auditor answers the vet's revisions, drops or ruling items.
                 Skipped if the vet accepts every finding.
    4. Fix       The assistant set in settings.json fixes the accepted findings.
    5. Watch     The trajectory watch runs when its glance says it is due.
    6. Judge     A fresh evidence-only turn ends or continues an automatic series.

  Skipping rounds and stopping:
    - If the audit finds nothing, it skips vet, rebuttal, fix and watch. An
      automatic series still runs the judge.
    - The judge's answer and reason print inside the round, enter the round
      transcript and repeat in the line that stops the series or opens the
      next round. A settle or ready answer ends the series with that command
      to run; its reason stays in the round.
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
    - Commit audits never run a glance or watch.

Examples (from either checkout):

  1. Audit steps 1-3, first with Codex and then with Claude.

     $ pnpm audit-round round example 1-3 --auditor codex,claude

  2. Audit step 3 with Claude's top model at xhigh effort (atx),
     then Codex's base model at medium effort (obm).

     $ pnpm audit-round round example 3 --auditor atx,obm

  3. Audit both repo shares of one change as one round.

     $ pnpm audit-round round HEAD ${planRepositoryPrefix}HEAD

  4. Audit one Repo Edu commit and one plan repo commit by ID as one round.

     $ pnpm audit-round round 3f2a1c9 ${planRepositoryPrefix}5c71e0a

  5. Audit an inclusive commit range in the plan repo.

     $ pnpm audit-round round ${planRepositoryPrefix}HEAD-2..HEAD

  6. Run the audit the newest plan calls for with Codex.

     $ pnpm audit-round round --auditor codex

  7. Start an automatic series on steps 1-4 with Codex instead of the default.

     $ pnpm audit-round round example 1-4 --first codex

  8. Run an automatic series on step 2, then on steps 3-5, then on steps 6-7.

     $ pnpm audit-round round example 2,3-5,6-7

Use pnpm audit-round <stem> to take a plan from its current stage through its close.`,
    )
    .action(
      (
        first: string | undefined,
        rest: string[],
        flags: {
          auditor?: readonly AuditorEntry[]
          first?: AuditorEntry
          watch: boolean
          verbose?: boolean
        },
      ) => {
        // The target's first argument already holds the name `first`.
        const { first: firstAuditor, ...rounds } = flags
        invocation = { kind: "round", first, rest, firstAuditor, ...rounds }
      },
    )
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
      "the planning word, a step scope or further commits, as audit-round --help explains",
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
      "bare audit report name; defaults to the newest eligible file in the active folder",
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
    .command("deferrals", { hidden: true })
    .description(
      "Print one active plan's open deferrals without writing files or starting assistants.",
    )
    .argument("[stem]", "an active plan, or none for the newest plan")
    .action((stem: string | undefined) => {
      invocation = { kind: "deferrals", stem }
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
      "Read auditor and coder results from retained records without starting assistants.",
    )
    .option("--all", "print the excluded plans after the readings")
    .action((flags: { all?: boolean }) => {
      invocation = { kind: "models", all: flags.all === true }
    })
  command
    .command("disprove")
    .description(
      "Record the user's later ruling that one audit finding was disproved.",
    )
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
    .action(
      (
        stem: string,
        target: string,
        details: string[],
        flags: { by?: DisprovedAuditor },
      ) => {
        invocation = disproveInvocation(stem, target, details, flags.by)
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
    .command("delete-reports", { hidden: true })
    .description(
      "Delete one round's audit, vet and rebuttal reports in the active folder and list them.",
    )
    .argument(
      "<target-round>",
      "exact target and round, such as example-impl-audit-02..02-01",
      (value: string) => {
        if (!/^[^/]+-\d{2,}$/.test(value))
          throw new InvalidArgumentError(
            "Expected a target and round, such as example-impl-audit-02..02-01.",
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
    // A bare command line asks for help rather than reporting a missing plan.
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

async function preparedClose(
  context: ExecutionContext,
  invocation: Extract<Invocation, { kind: "close" }>,
) {
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
  return {
    ...invocation,
    stem: planStem(plan),
    stage: await lifecycleStage(context, plan),
  }
}

type PreparedRun = Awaited<ReturnType<typeof preparedRun>>

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
    readonly readReply?: () => Promise<string | null>
    /** Supplies a random default's opener index below the count in deterministic tests. */
    readonly coin?: (count: number) => number
  },
): Promise<number> {
  const now = options.now ?? Date.now
  // One clock per invocation, so the run reading spans every output it opens.
  const clock = new RunClock(now)
  const invocation = parseInvocation(argv, options)
  if (typeof invocation === "number") return invocation
  let output: RoundOutput | undefined
  let result: RoundResult | CloseResult | undefined
  let code = 1
  /** A finished or interrupted outcome exits clean; only a failure exits 1. */
  const exitCode = (outcome: { readonly status: string }): number =>
    outcome.status === "failed" ? 1 : 0
  try {
    const context = await executionContext(options.repoEduRoot)
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
      options.terminal.write(
        await modelsReport(context, modelSettings, { all: invocation.all }),
        "markdown",
      )
      return 0
    }
    if (invocation.kind === "disprove") {
      const file = await disproveFile(context, invocation)
      const date = format(new Date(now()), "yyyy-MM-dd")
      let entry: DisprovedFinding
      let subject: string
      if ("round" in invocation.finding) {
        await requireDisprovedFinding(
          file.path,
          invocation.target,
          invocation.finding,
        )
        entry = {
          date,
          reason: invocation.reason,
          target: invocation.target,
          round: invocation.finding.round,
          finding: invocation.finding.number,
        }
        subject = `${invocation.stem}/disprove: ${invocation.target} round ${invocation.finding.round} finding ${invocation.finding.number}`
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
          `Recorded the disproved finding in ${file.path}. Loop-close will commit it with the archive move.`,
        )
      }
      return 0
    }
    if (invocation.kind === "plan") {
      options.terminal.write(await defaultPlan(context))
      return 0
    }
    if (invocation.kind === "deferrals") {
      const plan =
        invocation.stem === undefined
          ? await defaultPlan(context)
          : await requiredActivePlan(
              context.activeRoot,
              invocation.stem,
              "deferrals",
            )
      const stem = planStem(plan)
      const { deferrals } = await deferralState(context, stem)
      options.terminal.write(openDeferralText(stem, deferrals))
      return 0
    }
    if (invocation.kind === "delete-reports") {
      const deleted = await deleteRoundReports(
        context.activeRoot,
        invocation.nameStart,
      )
      if (deleted.length === 0)
        throw new Error(
          `No audit, vet or rebuttal report of ${invocation.nameStart} at ${context.activeRoot}.`,
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
        const result = await settlePlan(context, plan)
        options.terminal.write(
          `Committed ${result.sha}: ${result.subject}\nMarker: ${result.marker}`,
        )
      } else {
        const lifecycleSettings = options.settings ?? (await readSettings())
        const result = await readyPlan(context, plan, lifecycleSettings.coders)
        options.terminal.write(`Committed ${result.sha}: ${result.subject}`)
      }
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
    if (prepared.kind === "round" || prepared.kind === "name")
      requireSingleTarget(prepared, prepared.targets)
    if (prepared.kind === "name") {
      const [target] = prepared.targets
      const { nameStart } = await roundIdentity({
        ...context,
        ...target,
      })
      const claim = join(context.activeRoot, `${nameStart}-0-claim.md`)
      claimRound(claim)
      const report = join(
        context.activeRoot,
        `${phaseFilename(nameStart, "audit", prepared.auditor)}.md`,
      )
      const session = roundContext(context, target.roundKind)
      options.terminal.write(
        JSON.stringify({
          cwd: session.cwd,
          workflow: phaseWorkflow({ ...session, phase: "audit" }),
          claim,
          arguments: [
            report,
            ...("plan" in target
              ? [
                  target.plan,
                  ...(target.roundKind === "planning" ? [] : [target.scope]),
                ]
              : commitAuditGroups(target)),
          ],
        }),
      )
      return 0
    }
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
    const releases = await prepareAssistants(
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
    // The commit stamps are the output's, because the output records which
    // phases ran and a child reads them only when it starts.
    const dependenciesFor = (
      active: RoundOutput,
      phaseContext: RoundContext,
      chainDeferrals: RoundDependencies["chainDeferrals"] = async () => "none",
    ): RoundDependencies => {
      const fixPhaseStamps = new Set<string>()
      const childCommitStamps = () => {
        const stamps = active.commitStamps()
        if (
          stamps?.phases
            .split("\n")
            .some((line) => line.split(":", 1)[0].split(", ").includes("fix"))
        )
          fixPhaseStamps.add(stamps.phases)
        return stamps
      }
      return {
        watchEvidence: readWatchEvidence,
        writeWatchDocument: async (file, document) =>
          writeFile(file, `${document}\n`, "utf8"),
        writeWatchRecord,
        deleteRoundReports,
        checkFile: async (file) => {
          if (!(await readFile(file, "utf8")).trim())
            throw new Error(`Phase output is empty: ${file}`)
        },
        completeClean: async (input) => {
          const stamps = active.commitStamps()
          if (stamps === undefined)
            throw new Error("Missing audit model record")
          const completion = await completeClean(input, stamps)
          active.cleanCompletion(completion.message)
          return completion
        },
        readReport: async (file, kind, target) =>
          readReport(await readFile(file, "utf8"), kind, target),
        readVet: async (file, findings) =>
          readVet(await readFile(file, "utf8"), findings),
        readRebuttal: async (file, findings, reviews) =>
          readRebuttal(await readFile(file, "utf8"), findings, reviews),
        judgeEvidence: readJudgeEvidence,
        chainDeferrals,
        readHead: async (cwd) =>
          (await execa("git", ["rev-parse", "HEAD"], { cwd })).stdout,
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
        commitPhaseStamps: () => [...fixPhaseStamps],
        ...assistantDependencies(
          { ...runtime, cwd: phaseContext.cwd, commit: childCommitStamps },
          active.phase,
        ),
        writeSettledRound: (commits, account) =>
          active.writeSettledRound(commits, account),
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
      }
    }

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
              context.activeRoot,
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
            const phaseOutput = {
              ...active.phase,
              observe: async (
                feedback: Parameters<typeof active.phase.observe>[0],
              ) => {
                await active.phase.observe(feedback)
                if (feedback.type !== "model") return
                reported = true
                if (
                  feedback.selection.model !== expected.model ||
                  feedback.selection.effort !== expected.effort
                )
                  throw new Error(
                    `Implement worker reported ${feedback.selection.model} ${feedback.selection.effort ?? "effort unavailable"}; the runner launched ${input.assistant} on ${expected.model} ${expected.effort}.`,
                  )
              },
            }
            const worker = await runAssistantPhase(input, phaseOutput, {
              ...runtime,
              cwd: implementationSession.cwd,
              env: {
                ...runtime.env,
                COMMIT_AUDITOR: "",
                COMMIT_PHASES: "",
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
          requestRuling: async (document) => {
            const active = output
            if (active === undefined)
              throw new Error("Implementation ruling has no active output")
            active.beginRuling(document, await readFile(document, "utf8"))
            let reply: string | null = null
            try {
              reply = await (
                options.readReply ??
                (() =>
                  readRulingReply(
                    process.stdin,
                    process.stdout,
                    runtime.signal,
                  ))
              )()
              return reply
            } finally {
              active.endRuling(reply)
            }
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
      if (closed.status === "finished" && closed.archived !== null)
        await active.message(
          `Committed ${closed.archived.sha}: ${closed.archived.subject}`,
        )
      active.finish(closed, runtime.signal)
      code = exitCode(closed)
      return closed.status
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
      // A random default spreads first looks over every listed auditor without
      // binding any entry to the first position on every target.
      const settingsOpener = (): AuditorSeat =>
        listedSeat(
          settings.auditors[
            settings.defaultAuditor === "random"
              ? coin(settings.auditors.length)
              : 0
          ],
        )
      const opened = first ?? series.firstAuditor
      // The judge draws on the listed auditors and on a `--first` selection
      // whose assistant the list lacks, so the opener stays inside the series
      // for every scope the run opens.
      const firstAuditor = series.firstAuditor
      const pool: readonly AuditorSeat[] = [
        ...settings.auditors.map(listedSeat),
        ...(firstAuditor !== undefined &&
        !settings.auditors.some(
          (auditor) => auditor.assistant === firstAuditor.assistant,
        )
          ? [firstAuditor]
          : []),
      ]
      // The judge reads each round's auditor as the release its CLI resolved,
      // so the pool offers every entry under that same name.
      const poolAuditors = pool.map((seat) =>
        auditorSetting(seat, releases, settings),
      )
      const fixerFor = async (target: AuditTarget) => {
        const assigned =
          "plan" in target
            ? await readReadyCoder(context.planRoot, planStem(target.plan))
            : null
        return {
          fixer: assigned ?? settings.coders[0],
          fixerSource:
            assigned === null ? "audit-round coders" : "ready assignment",
        }
      }
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
        plan: string,
        auditor: Assistant,
        deferrals: readonly OpenDeferral[],
        nested: boolean,
        roundNumber: number,
      ): Promise<DeferralChainOutcome> => {
        const currentPlan = await resolvePlan(context, planStem(plan))
        const planningSession = roundContext(context, "planning")
        const setup = {
          ...planningSession,
          roundKind: "planning" as const,
          plan: currentPlan,
          ...(await fixerFor({
            roundKind: "planning",
            plan: currentPlan,
          })),
          auditor,
          auditorSelectionSource: "settings" as const,
          deferrals,
        }
        const chainedRun = await roundRun(
          setup,
          now(),
          releases,
          settings,
          roundNumber,
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
              ...setup,
              documents: chainedRun.documents,
              transcript: chainedRun.paths.markdown,
              watch: series.watch
                ? { file: chainedRun.watch, cacheRoot }
                : null,
            },
            dependenciesFor(active, planningSession),
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
       * over. A judge settle or ready names that lifecycle call; a judge stop,
       * the maximum or an exhausted queue ends the series; an ending that
       * needs the user stops the whole list.
       */
      const runSeries = async (initial: AuditTarget): Promise<SeriesEnding> => {
        // Only an explicit auditor list owns an editable queue. Automatic
        // series keep their next seat in this invocation.
        const queue =
          series.auditor !== undefined
            ? await queueFile({ ...seriesSession, ...initial })
            : null
        let rest: readonly AuditorEntry[] = queued
        if (queue !== null) await writeQueue(queue, rest)
        let auditorSelectionSource: AuditorSelectionSource =
          first !== undefined
            ? "--auditor"
            : series.firstAuditor !== undefined
              ? "--first"
              : "settings"
        let seat: AuditorSeat | null = opened ?? settingsOpener()
        let target = initial
        let completed = 0
        // The reason behind the judge answer that chose the next seat, printed
        // with the next round's opening line so the log carries it.
        let judgedReason: string | null = null
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
          const rebuilt = await Promise.all(
            value.groups.map(async (group) => {
              const fixes = landed
                .filter((commit) => commit.repository === group.repository)
                .map((commit) => commit.sha)
              const commits = [...new Set([...group.commits, ...fixes])] as [
                string,
                ...string[],
              ]
              const cwd =
                group.repository === "plan"
                  ? context.planRoot
                  : context.repoEduRoot
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
              await readCommitRoundData(context, commitTargetLabel(target))
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
        try {
          if (
            automatic &&
            seriesSession.roundKind === "implementation" &&
            "plan" in target
          ) {
            const openPlanDeferrals = await deferralsInto(target.plan, "plan")
            if (openPlanDeferrals.deferrals.length > 0) {
              const outcome = await runDeferralRound(
                target.plan,
                deferringAssistant(
                  openPlanDeferrals.deferrals[0],
                  openPlanDeferrals.logs,
                ),
                openPlanDeferrals.deferrals,
                false,
                completed + 1,
              )
              if (outcome !== "none" && outcome !== "finished")
                return stopForChain(outcome)
            }
          }
          do {
            if (completed > 0) {
              if (!automatic) {
                if ("plan" in target) {
                  const plan = await resolvePlan(context, planStem(target.plan))
                  target = { ...target, plan }
                }
              }
              if (automatic)
                await output?.message(
                  `Next round: ${auditorText(auditorSetting(seat, releases, settings))}, as judged; ${settings.maximumAutomaticRounds - completed} rounds remain before the maximum. ${judgedReason}`,
                )
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
                watch: series.watch
                  ? {
                      file: run.watch,
                      cacheRoot,
                    }
                  : null,
              },
              dependenciesFor(
                active,
                seriesSession,
                async ({ plan, auditor }) => {
                  const openPlanDeferrals = await deferralsInto(plan, "plan")
                  if (openPlanDeferrals.deferrals.length === 0) return "none"
                  return runDeferralRound(
                    plan,
                    auditor,
                    openPlanDeferrals.deferrals,
                    true,
                    completed + 1,
                  )
                },
              ),
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
            if (!automatic && queue === null) break
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
              const judge = round.judge
              if (judge === null)
                throw new Error(
                  "Automatic round finished without a judge answer",
                )
              if (judge.answer === "stop") {
                await active.message(
                  `${series} stopped on the judge answer after ${completed} round${completed === 1 ? "" : "s"}. ${judge.reason}`,
                )
                await printDeferrals()
                break
              }
              if (judge.answer === "settle") {
                if (!("plan" in target))
                  throw new Error(
                    "Commit series judge returned the plan-only settle answer",
                  )
                await active.message(
                  `${series} ended after ${completed} round${completed === 1 ? "" : "s"}. The judge finds no open shape question. Widening is done: run pnpm audit-round settle ${planStem(target.plan)}.`,
                )
                await printDeferrals()
                return "settle"
              }
              if (judge.answer === "ready") {
                if (!("plan" in target))
                  throw new Error(
                    "Commit series judge returned the plan-only ready answer",
                  )
                await active.message(
                  `${series} ended after ${completed} round${completed === 1 ? "" : "s"}. The judge finds the brief complete. Detailing is done: run pnpm audit-round ready ${planStem(target.plan)}.`,
                )
                await printDeferrals()
                return "ready"
              }
              if (completed >= settings.maximumAutomaticRounds) {
                await active.message(
                  `${series} reached its maximum of ${settings.maximumAutomaticRounds} rounds.`,
                )
                await printDeferrals()
                break
              }
              const chosen = judge.answer
              const index = poolAuditors.findIndex(
                (auditor) => auditorText(auditor) === auditorText(chosen),
              )
              if (index === -1)
                throw new Error(
                  `The judge chose ${auditorText(chosen)}, which the series pool does not hold`,
                )
              seat = pool[index]
              judgedReason = judge.reason
              auditorSelectionSource = "settings"
              if ("groups" in target)
                target = await advanceCommitTarget(target, round.commits)
              continue
            }
            const ending = round.cleanAudit ? "Clean audit" : null
            const ended =
              ending === null ? null : auditorSetting(seat, releases, settings)
            if (queue === null) break
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
        } finally {
          if (queue !== null) await removeQueue(queue)
        }
        return "ended"
      }
      let ending: SeriesEnding = "ended"
      for (const [index, target] of targets.entries()) {
        const later = targets.slice(index + 1)
        if (index > 0 && "plan" in target)
          await output?.message(
            `Next scope: ${roundSubject(target, planStem(target.plan))}; ${later.length} scope${later.length === 1 ? "" : "s"} remain after it.`,
          )
        ending = await runSeries(target)
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
     * the user's settle, ready and close call given in advance, so the judge's
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
          `Run of ${stem} ended in the ${stage}${completed.length === 0 ? "" : ` after the ${completed.join(", ")}`}. Once that ending is handled, pnpm audit-round ${stem} continues from where the plan stands. ${runTime()}`,
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
              const settled = await settlePlan(context, plan)
              await say(
                `Committed ${settled.sha}: ${settled.subject}\nMarker: ${settled.marker}`,
              )
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
                command: [
                  "pnpm",
                  "audit-round",
                  stem,
                  ...(run.verbose === true ? ["-v"] : []),
                ],
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
      const resumeSessionId = failureResumeSessionId(result)
      options.emergency(
        `[${result.phase}] failed: ${result.reason}\nSession: ${result.sessionId ?? "unavailable"}`,
      )
      if (resumeSessionId !== null)
        options.emergency(
          `Resume: ${recoveryCommand({ ...result, sessionId: resumeSessionId })}`,
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

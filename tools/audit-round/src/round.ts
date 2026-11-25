import { join } from "node:path"
import { isDeepStrictEqual } from "node:util"
import type { ClosedRoundFiles } from "./evidence.js"
import { errorMessage, type ModelReleases } from "./feedback.js"
import type { WatchGrade } from "./glance.js"
import { decideSeries } from "./judge.js"
import type { LifecycleCommit } from "./lifecycle.js"
import type { OpenDeferral } from "./open-deferrals.js"
import type { RoundDocuments } from "./output.js"
import { phaseSelection } from "./output-format.js"
import {
  type Assistant,
  type AuditorOverride,
  type AuditorSelectionSource,
  type ChoiceScope,
  type ContestScope,
  closePhase,
  type DeferralChainOutcome,
  type DeferralScope,
  type Effort,
  efforts,
  type FixerSide,
  type LandedRecord,
  noOverride,
  type Phase,
  type PhaseFailure,
  type PhaseInput,
  type PhaseResult,
  type PhaseRun,
  type RoundDependencies,
  type RoundFixer,
  type RoundPhases,
  roundPhases,
  targetWorkClass,
  watchPhase,
} from "./phase.js"
import { type AuditReport, targetReportClass } from "./report.js"
import {
  findingSplit,
  highestGrade,
  type LandedCommit,
  type PanelVet,
  type RoundAccount,
  type RoundData,
  type RoundFinding,
  type RulingWinner,
  reviewedRoundFindings,
  roundDataIdentity,
  type SeriesAnswer,
  settleRoundFindings,
  tierWithin,
} from "./round-data.js"
import { documentTag, targetLabel, transcriptNameStart } from "./round-paths.js"
import type { RulingInput, RulingQuestion } from "./ruling-wait.js"
import type { Auditor, RoundSettings } from "./settings.js"
import {
  parseSubject,
  planForm,
  type Repository,
  seriesLabel,
} from "./subject.js"
import {
  type AuditTarget,
  type CommitGroup,
  type CommitTarget,
  commitAuditGroups,
  planPhase,
  planRepositoryPrefix,
  planStem,
  type RoundContext,
  type RoundKind,
  reportTarget,
  roundListPath,
} from "./target.js"

/**
 * Whether two phases run on the same release and effort. Each model name reads
 * as the release startup resolved it to, so an alias and its release match.
 */
function samePhaseSelection(
  first: PhaseRun,
  second: PhaseRun,
  releases: Record<Assistant, ModelReleases>,
): boolean {
  if (first.assistant !== second.assistant) return false
  const one = phaseSelection(first.model, releases[first.assistant])
  const other = phaseSelection(second.model, releases[second.assistant])
  return one.model === other.model && one.effort === other.effort
}

/**
 * Name whether the fix uses the selected model and effort of the auditor or of
 * one vetter of the panel, which it names by its tag.
 */
function selectedFixerSide(
  phases: Pick<RoundPhases, "audit" | "fix">,
  panel: readonly PanelRun[],
  releases: Record<Assistant, ModelReleases>,
): FixerSide {
  const same = (run: PhaseRun) => samePhaseSelection(phases.fix, run, releases)
  if (same(phases.audit)) return "auditor"
  const vet = panel.find(({ run }) => same(run))
  return vet === undefined ? "neither" : { vet: vet.tag }
}

/** One vetter of the round's panel: what it runs on, its vet report and its tag. */
type PanelRun = {
  readonly run: PhaseRun
  readonly report: string
  readonly tag: string
}

function contestScope(
  findings: readonly RoundAccount["findings"][number][],
  contests: readonly number[],
): ContestScope | null {
  if (contests.length === 0) return null
  return {
    contests: contests.map((number) => {
      const finding = findings.find((candidate) => candidate.number === number)
      if (finding === undefined)
        throw new Error(`Contest names no audit report finding: ${number}`)
      return {
        finding: number,
        ...(finding.ruling === undefined
          ? {}
          : { winner: finding.ruling.winner, reason: finding.ruling.reason }),
      }
    }),
  }
}

function openContests(
  account: RoundAccount,
  contests: readonly number[],
): readonly number[] {
  return contests.filter(
    (number) =>
      account.findings.find((finding) => finding.number === number)?.ruling ===
      undefined,
  )
}

/**
 * Whether a finding holds a dispute that needs a judge: the rebuttal contests
 * a vetter's verdict, or two vetters of the panel split under `reviewsSplit`.
 */
function disputed(finding: RoundFinding): boolean {
  return (
    finding.reviews.some((review) => review.answer === "contest") ||
    findingSplit(finding.reviews)
  )
}

/**
 * Every contest and split of the round, under one rule in every round and
 * both work classes: the user names the winner on a finding the audit report
 * or a vetter graded A or B, and the ruler on every other one. The grade is
 * the highest any side gave, so one side alone cannot lower a finding out of
 * the user's reach.
 */
function disputedFindings(
  account: RoundAccount,
  judge?: "user" | "ruler",
): readonly number[] {
  return account.findings.flatMap((finding) =>
    finding.number !== null &&
    disputed(finding) &&
    (judge === undefined ||
      tierWithin(highestGrade(finding), "A/B") === (judge === "user"))
      ? [finding.number]
      : [],
  )
}

/** The contests and splits whose winner the user names. */
export function seriousFindings(account: RoundAccount): readonly number[] {
  return disputedFindings(account, "user")
}

/** The contests and splits whose winner the ruler names. */
export function rulerFindings(account: RoundAccount): readonly number[] {
  return disputedFindings(account, "ruler")
}

/** The serious findings that still need the user's winner. */
export function openSeriousFindings(account: RoundAccount): readonly number[] {
  return openContests(account, seriousFindings(account))
}

/**
 * The findings the reviews agree to send to the user: a vetter refers the
 * finding or the rebuttal answers a verdict for the user's ruling, and no
 * contest or split disputes it. An agreed revision or drop sends nothing, and
 * a referral overturned in a contest or split reaches the user only through
 * its judge.
 */
export function referredFindings(account: RoundAccount): readonly number[] {
  return account.findings.flatMap((finding) =>
    finding.number !== null &&
    !disputed(finding) &&
    finding.reviews.some(
      (review) =>
        review.verdict === "needs-user-ruling" ||
        review.answer === "for-user-ruling",
    )
      ? [finding.number]
      : [],
  )
}

/**
 * Every question the user answers before the fix starts, in finding order:
 * the winner of each serious contest or split still without one, and a choice
 * on each finding the reviews refer to the user, the ruler report names an
 * open choice for or whose stored winner the user gave with a choice. A
 * choice is not stored, so a stopped round asks it again.
 */
export function rulingQuestions(
  account: RoundAccount,
  rulerChoices: readonly number[],
): readonly RulingQuestion[] {
  const winners = openSeriousFindings(account)
  const choices = new Set([
    ...referredFindings(account),
    ...rulerChoices,
    ...account.findings.flatMap(({ number, ruling }) =>
      number !== null && ruling?.withChoice === true ? [number] : [],
    ),
  ])
  return account.findings.flatMap(({ number }): RulingQuestion[] =>
    number === null
      ? []
      : winners.includes(number)
        ? [{ finding: number, needs: "winner" }]
        : choices.has(number)
          ? [{ finding: number, needs: "choice" }]
          : [],
  )
}

/**
 * Record each admitted winner with who named it, and whether the user's
 * answer added a choice to it. The waiting run already checked that the
 * user's answer is complete, and the ruler report's reader that the ruler
 * answered every finding it was given.
 */
function recordWinners(
  account: RoundAccount,
  winners: readonly {
    readonly finding: number
    readonly winner: RulingWinner
    readonly reason: string
  }[],
  namedBy: "user" | "ruler",
  chosen: ReadonlySet<number> = new Set(),
): RoundAccount {
  const byNumber = new Map(winners.map((winner) => [winner.finding, winner]))
  return {
    ...account,
    findings: account.findings.map((finding) => {
      const named =
        finding.number === null ? undefined : byNumber.get(finding.number)
      return named === undefined
        ? finding
        : {
            ...finding,
            ruling: {
              winner: named.winner,
              reason: named.reason,
              namedBy,
              ...(chosen.has(named.finding)
                ? { withChoice: true as const }
                : {}),
            },
          }
    }),
  }
}

/** The tier the audit report gave one of its findings. */
function auditTier(
  evidence: AuditReport,
  number: number,
): RoundFinding["tier"] {
  const finding = evidence.findings.find(
    (candidate) => candidate.number === number,
  )
  if (finding === undefined)
    throw new Error(`The ruler was given no audit report finding ${number}`)
  return finding.tier
}

/** What names a round before it starts: its target, who audits and fixes and on what. */
export type RoundSetup = RoundContext &
  RoundFixer & {
    readonly auditor: Assistant
    /** The command route that supplied this round's auditor. */
    readonly auditorSelectionSource: AuditorSelectionSource
    /** What the command line asked of the auditor's phases; absent asks nothing. */
    readonly override?: AuditorOverride
    /**
     * The auditor list the runner routes between, present only for an automatic
     * series.
     */
    readonly pool?: readonly Auditor[]
    /** The open deferrals this round must inspect and settle. */
    readonly deferrals?: readonly OpenDeferral[]
  } & AuditTarget

/** Where a watch that follows the round writes, and where it keeps its history. */
export type WatchTarget = {
  /** The watch's document, named for the round the watch follows. */
  readonly file: string
  /** The shared `audit-round` cache, which holds the watch's own history. */
  readonly cacheRoot: string
}

export type RoundInput = RoundSetup & {
  readonly documents: RoundDocuments
  /** The round's Markdown transcript, whose name starts every file of the round. */
  readonly transcript: string
  /** Null when the user asked for no watch, whatever the commit record says. */
  readonly watch: WatchTarget | null
  /**
   * The stored round data entry of the stopped round this run continues,
   * absent for a new round. It supplies what no kept report holds: the winners
   * the user named, the commits the round landed and whether its fix or clean
   * completion ended.
   */
  readonly stored?: RoundData
}

/**
 * One stored commit group as a round's target carries it. A group stored
 * before its references were kept names each commit by its full ID, as a later
 * round of a commit series does.
 */
function storedCommitGroup(group: {
  readonly repository: Repository
  readonly commits: readonly string[]
  readonly startingHead: string
  readonly references?: readonly string[]
}): CommitGroup {
  const commits = group.commits as [string, ...string[]]
  return {
    repository: group.repository,
    references: (group.references ??
      commits.map((commit, index) =>
        group.repository === "plan" && index === 0
          ? `${planRepositoryPrefix}${commit}`
          : commit,
      )) as [string, ...string[]],
    startingHead: group.startingHead,
    commits,
    shortReferences: commits.map((commit) => commit.slice(0, 6)) as [
      string,
      ...string[],
    ],
  }
}

/**
 * What a continued round's setup takes from its stored entry. The kept audit
 * report fixes the auditor, so the audit and the rebuttal, which answers for
 * it, run on the selection the stored audit launched on. The fix of a chained
 * round or of a plan-scoped implementation round receives the deferral list its
 * kept audit report judged, not the list read from Git again. A commit round keeps the exact commits and references its
 * kept audit report judged, while the call's target has already moved on to
 * the fixes landed since. Every other phase takes the current settings, as in
 * a new round. Spread it over the setup the call would give a new round.
 */
export function continuedSetup(
  stored: RoundData,
): Pick<
  RoundSetup,
  "auditor" | "auditorSelectionSource" | "override" | "deferrals"
> &
  Partial<Pick<CommitTarget, "originalGroups" | "groups">> {
  const audit = stored.phases.find((phase) => phase.phase === "audit")
  const { model, effort } = audit?.launched ?? stored.auditor
  if (effort === null || !efforts.includes(effort as Effort))
    throw new Error(
      `The stopped round ${stored.target} ${stored.round} recorded no supported audit effort`,
    )
  return {
    auditor: stored.auditor.assistant,
    auditorSelectionSource:
      stored.auditor.chosenBy === "command-line"
        ? "--auditor"
        : stored.auditor.chosenBy,
    override: { listed: { model, effort: effort as Effort } },
    ...("deferrals" in stored && stored.deferrals !== undefined
      ? { deferrals: stored.deferrals }
      : {}),
    ...("groups" in stored
      ? {
          originalGroups: stored.originalGroups.map(storedCommitGroup) as [
            CommitGroup,
            ...CommitGroup[],
          ],
          groups: stored.groups.map(storedCommitGroup) as [
            CommitGroup,
            ...CommitGroup[],
          ],
        }
      : {}),
  }
}

/**
 * Whether the stopped round's stored account carries its outcomes, so its fix
 * or its clean completion ended: every finding has an outcome, and a round
 * without findings landed its clean record.
 */
function settledAccount(stored: RoundData): boolean {
  return stored.findings.length === 0
    ? stored.commits.length > 0
    : stored.findings.every((finding) => finding.outcome !== null)
}

/** The account a stored entry holds. A planning entry stores no judged repositories. */
function storedAccount(stored: RoundData): RoundAccount {
  return {
    settling: "settling" in stored ? stored.settling : "",
    judgedRepos: "judgedRepos" in stored ? stored.judgedRepos : [],
    findings: stored.findings,
  }
}

/**
 * Carry the winners the user named in the stopped round onto the account its
 * kept reports rebuild. A winner judged one finding as its reviews then stood,
 * so it stands only while the reports rebuild that finding exactly as stored.
 * A changed panel can change the reviews, and the user then rules again.
 */
function userWinners(account: RoundAccount, stored: RoundData): RoundAccount {
  return {
    ...account,
    findings: account.findings.map((finding) => {
      const earlier = stored.findings.find(
        (candidate) =>
          candidate.number !== null && candidate.number === finding.number,
      )
      if (earlier?.ruling?.namedBy !== "user") return finding
      const { ruling, ...rebuilt } = earlier
      return isDeepStrictEqual(finding, rebuilt)
        ? { ...finding, ruling }
        : finding
    }),
  }
}

export type RoundFailure = PhaseFailure &
  PhaseRun &
  RoundContext & {
    readonly phase: Phase | "ruling-input" | "complete"
  }

export type RoundResult = (
  | {
      readonly status: "finished"
      readonly report: string
      /** True only when the audit report itself contained no findings. */
      readonly cleanAudit: boolean
      /** The runner's series answer; manual, red-watch and phase-change rounds have none. */
      readonly decision: SeriesAnswer | null
      /** The grade the watch that followed the round recorded; null when none ran. */
      readonly watch: WatchGrade | null
      /** The chained planning round's outcome before this round's decision. */
      readonly deferralChain: DeferralChainOutcome
    }
  | {
      readonly status: "awaiting-ruling"
      readonly report: string
      /** The fix session that wrote the ruling; null for a question asked before the fix. */
      readonly sessionId: string | null
    }
  | RoundFailure
) & {
  readonly commits: readonly LandedCommit[]
  readonly account: RoundAccount
}

export type CloseInput = RoundContext & {
  /** The active plan the close archives. */
  readonly plan: string
  /** The close session's own capability tag and model record for its commits. */
  readonly tag: string
  readonly record: string
  /** Why an episode that never shipped is abandoned; null for a completed plan. */
  readonly reason: string | null
  /** Open deferrals resolved before the close session starts. */
  readonly deferrals: readonly OpenDeferral[]
}

export type CloseResult =
  | {
      readonly status: "finished"
      /** The runner's own commit of the archived round data, or null when the plan had none. */
      readonly archived: LifecycleCommit | null
      /** The plan's round files the runner moved out of the round folder. */
      readonly moved: ClosedRoundFiles
    }
  | RoundFailure

/** A completed report phase must have written its supplied output. */
async function reportPhase<R extends PhaseResult>(
  invoke: () => Promise<R>,
  file: string,
  dependencies: Pick<RoundDependencies, "checkFile">,
): Promise<R | PhaseFailure> {
  let result: R
  try {
    result = await invoke()
  } catch (error) {
    return {
      status: "failed",
      sessionId: null,
      reason: errorMessage(error),
    }
  }
  if (result.status === "failed") return result
  try {
    await dependencies.checkFile(file)
    return result
  } catch (error) {
    return {
      status: "failed",
      sessionId: result.sessionId,
      reason: errorMessage(error),
    }
  }
}

/**
 * Loop-close runs alone, on its own settings, and belongs to no round. The
 * session cannot tell its own capability, so it receives the tag and model
 * record its commits carry; its workflow owns the plan move and the commits.
 * The runner itself then moves and commits the plan's round data, and moves
 * the plan's other round files into its own folder of the evidence checkout,
 * so neither depends on the session remembering it.
 */
export async function runClose(
  input: CloseInput,
  dependencies: Pick<
    RoundDependencies,
    "runPhase" | "fileExists" | "archiveRoundData" | "moveRoundFiles"
  >,
  settings: RoundSettings,
): Promise<CloseResult> {
  const run = closePhase(settings)
  const {
    cwd,
    repoEduRoot,
    planRoot,
    activeRoot,
    evidenceRoot,
    roundRoot,
    roundKind,
  } = input
  const context = {
    cwd,
    repoEduRoot,
    planRoot,
    activeRoot,
    evidenceRoot,
    roundRoot,
    roundKind,
  }
  const close = await dependencies.runPhase.close({
    phase: "close",
    ...run,
    ...context,
    arguments:
      input.reason === null
        ? [input.plan, input.tag, input.record, { deferrals: input.deferrals }]
        : [
            input.plan,
            input.tag,
            input.record,
            { deferrals: input.deferrals },
            input.reason,
          ],
    sessionId: null,
  })
  if (close.status === "failed")
    return { ...close, phase: "close", ...run, ...context }
  // The move is the close; a session that finished without it closed nothing.
  const failed = (reason: string): CloseResult => ({
    status: "failed",
    sessionId: close.sessionId,
    phase: "close",
    ...run,
    ...context,
    reason,
  })
  try {
    if (await dependencies.fileExists(input.plan))
      return failed(
        `The finished close left ${input.plan} in the active folder`,
      )
    const stem = planStem(input.plan)
    const archived = await dependencies.archiveRoundData(
      stem,
      input.tag,
      input.record,
    )
    const moved = await dependencies.moveRoundFiles(stem)
    return { status: "finished", archived, moved }
  } catch (error) {
    return failed(errorMessage(error))
  }
}

/**
 * The watch that follows a round. It reads the Git record and retained round
 * data, never the round's reports or transcript. The glance decides from the
 * log and the watch's own history alone, and the watch grounds itself in the
 * code the log points at. The glance exists because the watch is expensive and
 * most rounds do not move the record far enough to change its reading;
 * `glance.ts` owns its rule.
 *
 * Only a round that finished runs it. A round awaiting a ruling has not proved
 * that its work landed, so the record it would grade may be missing its own
 * commit. Nothing is lost by waiting: the glance counts what the log has
 * gained in corrections since the last watch, not how many rounds have run. A user who asked
 * for no watch gets none, whatever the record says.
 *
 * Returns the failure that stops the round, or the admitted and published grade.
 * The grade is null when the watch was not due or was not asked for.
 */
async function runWatch(
  input: RoundContext &
    Pick<RoundInput, "watch"> & {
      readonly plan: string
      readonly roundKind: Exclude<RoundKind, "split">
    },
  dependencies: Pick<
    RoundDependencies,
    | "runPhase"
    | "glance"
    | "watchEvidence"
    | "writeWatchDocument"
    | "writeWatchRecord"
  >,
  settings: RoundSettings,
): Promise<RoundFailure | { readonly grade: WatchGrade | null }> {
  const target = input.watch
  if (target === null) return { grade: null }
  const phases = { watch: watchPhase(input.roundKind, settings) }
  const {
    cwd,
    repoEduRoot,
    planRoot,
    activeRoot,
    evidenceRoot,
    roundRoot,
    roundKind,
  } = input
  const context = {
    cwd,
    repoEduRoot,
    planRoot,
    activeRoot,
    evidenceRoot,
    roundRoot,
    roundKind,
  }
  const stem = planStem(input.plan)
  try {
    const glance = await dependencies.glance({
      cwd,
      repoEduRoot,
      repository: roundKind === "planning" ? "plan" : "repo-edu",
      cacheRoot: target.cacheRoot,
      stem,
    })
    if (!glance.due) return { grade: null }
    const { evidence, heads } = await dependencies.watchEvidence({
      ...context,
      stem,
    })

    const watch = await dependencies.runPhase.watch({
      phase: "watch",
      ...phases.watch,
      ...context,
      arguments: [],
      evidence,
      sessionId: null,
    })
    if (watch.status === "failed")
      return { ...watch, phase: "watch", ...phases.watch, ...context }
    const startFresh = (reason: string): RoundFailure => ({
      status: "failed",
      sessionId: watch.sessionId,
      phase: "watch",
      ...phases.watch,
      ...context,
      reason: `${reason}${/[.!?]$/.test(reason) ? "" : "."} The next watch must start fresh.`,
    })
    if (watch.compactions > 0)
      return startFresh(
        `The watch compacted while reading ${evidence.length} characters of evidence; it needs one uncompacted session.`,
      )
    try {
      await dependencies.writeWatchDocument(target.file, watch.document)
      await dependencies.writeWatchRecord({
        cacheRoot: target.cacheRoot,
        stem,
        heads,
        grade: watch.grade,
      })
      return { grade: watch.grade }
    } catch (error) {
      return startFresh(errorMessage(error))
    }
  } catch (error) {
    return {
      status: "failed",
      sessionId: null,
      phase: "watch",
      ...phases.watch,
      ...context,
      reason: errorMessage(error),
    }
  }
}

/** Apply the runner's deterministic rules after an automatic-series round. */
async function runSeriesDecision(
  input: RoundInput,
  pool: readonly Auditor[],
  dependencies: Pick<RoundDependencies, "seriesEvidence">,
  settings: RoundSettings,
): Promise<RoundFailure | { readonly answer: SeriesAnswer }> {
  const phases = roundPhases(
    input.auditor,
    input.override ?? noOverride,
    settings,
    input,
    targetWorkClass(input),
  )
  const {
    cwd,
    repoEduRoot,
    planRoot,
    activeRoot,
    evidenceRoot,
    roundRoot,
    roundKind,
  } = input
  const context = {
    cwd,
    repoEduRoot,
    planRoot,
    activeRoot,
    evidenceRoot,
    roundRoot,
    roundKind,
  }
  try {
    const currentRound = roundDataIdentity(
      transcriptNameStart(input.transcript),
    )
    const evidence = await dependencies.seriesEvidence({
      ...context,
      target: input,
    })
    return { answer: decideSeries(evidence, currentRound, pool) }
  } catch (error) {
    return {
      status: "failed",
      sessionId: null,
      phase: "complete",
      ...phases.audit,
      ...context,
      reason: errorMessage(error),
    }
  }
}

async function runDeferralChain(
  input: RoundInput,
  dependencies: Pick<RoundDependencies, "chainDeferrals">,
): Promise<DeferralChainOutcome> {
  if (
    input.pool === undefined ||
    input.roundKind !== "implementation" ||
    !("plan" in input)
  )
    return "none"
  return dependencies.chainDeferrals(input)
}

/** A round that stopped, with what it landed and the account it reached. */
type FailedRound = Extract<RoundResult, { readonly status: "failed" }>

/** The roots and kind every phase input and every failure of a round carries. */
function phaseContext(input: RoundContext): RoundContext {
  const {
    cwd,
    repoEduRoot,
    planRoot,
    activeRoot,
    evidenceRoot,
    roundRoot,
    roundKind,
  } = input
  return {
    cwd,
    repoEduRoot,
    planRoot,
    activeRoot,
    evidenceRoot,
    roundRoot,
    roundKind,
  }
}

/**
 * A kept report's reading, or null when its phase must run: the report is
 * missing, or the reader that admits it after its phase ran refuses it.
 */
async function keptReport<T>(
  file: string,
  read: () => Promise<T>,
  dependencies: Pick<RoundDependencies, "fileExists">,
): Promise<T | null> {
  try {
    return (await dependencies.fileExists(file)) ? await read() : null
  } catch {
    return null
  }
}

/**
 * One report phase's reading: its kept report when that reads as valid,
 * otherwise a fresh run of the phase and the reading of the report it wrote. A
 * failed run, or a report its reader refuses after the run, stops the round
 * with the run's session.
 */
async function reportReading<R extends PhaseResult, T>(
  file: string,
  read: () => Promise<T>,
  run: () => Promise<R>,
  dependencies: Pick<RoundDependencies, "checkFile" | "fileExists">,
  ranReading: (result: Exclude<R, PhaseFailure>) => Promise<T> = read,
): Promise<{ readonly status: "read"; readonly reading: T } | PhaseFailure> {
  const kept = await keptReport(file, read, dependencies)
  if (kept !== null) return { status: "read", reading: kept }
  const result = await reportPhase(run, file, dependencies)
  if (result.status === "failed") return result
  try {
    return {
      status: "read",
      reading: await ranReading(result as Exclude<R, PhaseFailure>),
    }
  } catch (error) {
    return {
      status: "failed",
      sessionId: result.sessionId,
      reason: errorMessage(error),
    }
  }
}

/** What the audit, the vet, the rebuttal and the ruler leave for the fix. */
type Review = {
  readonly evidence: AuditReport
  readonly account: RoundAccount
  /** The vet, rebuttal and ruler reports the fix reads after the audit report. */
  readonly twins: readonly string[]
  /** The findings whose ruler entry names an open choice for the user. */
  readonly rulerChoices: readonly number[]
}

/**
 * Run the audit, the vet, the rebuttal and the ruler in order, and skip each
 * phase whose kept report reads as valid. A new round keeps nothing, so every
 * phase runs. A continued round runs from the first phase without a valid
 * report, and of the panel only the vetters without one. The readers that
 * admit each report after its phase ran rebuild the round's account, so a
 * kept report needs no second copy of it. A stopped phase starts again in a
 * fresh session, and a report its reader refuses still fails the round.
 */
async function reviewRound(
  input: RoundInput,
  phases: RoundPhases,
  panel: readonly PanelRun[],
  dependencies: RoundDependencies,
): Promise<Review | FailedRound> {
  const context = phaseContext(input)
  const { report, rebut, ruler } = input.documents
  let account: RoundAccount = { settling: "", judgedRepos: [], findings: [] }
  const stopped = (
    phase: Phase,
    run: PhaseRun,
    failure: PhaseFailure,
  ): FailedRound => ({
    ...failure,
    phase,
    ...run,
    ...context,
    commits: [],
    account,
  })
  const deferralScope: readonly DeferralScope[] =
    input.deferrals === undefined ? [] : [{ deferrals: input.deferrals }]
  const audited = await reportReading(
    report,
    () =>
      dependencies.readReport(
        report,
        targetReportClass(input),
        reportTarget(input),
      ),
    () =>
      dependencies.runPhase.audit({
        phase: "audit",
        ...phases.audit,
        ...context,
        arguments:
          "groups" in input
            ? [report, ...commitAuditGroups(input)]
            : "source" in input
              ? [report, join(input.planRoot, roundListPath(input.source))]
              : input.roundKind === "planning"
                ? [report, input.plan, ...deferralScope]
                : [report, input.plan, input.scope, ...deferralScope],
        sessionId: null,
      }),
    dependencies,
  )
  if (audited.status === "failed")
    return stopped("audit", phases.audit, audited)
  const evidence = audited.reading
  account = {
    settling: evidence.settling,
    judgedRepos: evidence.judgedRepos,
    findings: reviewedRoundFindings(evidence.findings),
  }
  // Zero findings complete in the runner. No later assistant can add anything
  // needed to close this audit.
  if (evidence.findings.length === 0)
    return { evidence, account, twins: [], rulerChoices: [] }

  // Every vetter without a kept vet report reads the audit report on its own
  // and at the same time. The round waits for the slowest; a failed vetter
  // fails the round, and the finished vetters' vet reports stay in place.
  const vetted = await Promise.all(
    panel.map((vet) =>
      reportReading(
        vet.report,
        () => dependencies.readVet(vet.report, evidence.findings),
        () =>
          dependencies.runPhase.vet({
            phase: "vet",
            ...vet.run,
            ...context,
            arguments: [report, vet.report],
            sessionId: null,
          }),
        dependencies,
      ),
    ),
  )
  const vets: PanelVet[] = []
  let accepted = true
  for (const [index, vet] of panel.entries()) {
    const reading = vetted[index]
    if (reading.status === "failed") return stopped("vet", vet.run, reading)
    vets.push({ vet: vet.tag, reviews: reading.reading.reviews })
    accepted &&= reading.reading.allAccepted
  }
  account = {
    ...account,
    findings: reviewedRoundFindings(evidence.findings, vets),
  }
  const twins = panel.map((vet) => vet.report)
  const rulerChoices: number[] = []
  // The rebuttal runs once for the whole panel, unless every vetter accepted
  // every finding.
  if (!accepted) {
    const rebutted = await reportReading(
      rebut,
      () => dependencies.readRebuttal(rebut, evidence.findings, vets),
      () =>
        dependencies.runPhase.rebut({
          phase: "rebut",
          ...phases.rebut,
          ...context,
          arguments: [report, ...panel.map((vet) => vet.report), rebut],
          sessionId: null,
        }),
      dependencies,
    )
    if (rebutted.status === "failed")
      return stopped("rebut", phases.rebut, rebutted)
    account = {
      ...account,
      findings: reviewedRoundFindings(
        evidence.findings,
        vets,
        rebutted.reading,
      ),
    }
    twins.push(rebut)
    // The ruler names the winner of every contest and split on a C or D
    // finding before the fix starts, so the fix applies winners and never
    // picks a side. It runs only when such a dispute exists. A choice it
    // leaves open joins the questions the user answers before the fix, while
    // its winner stays credited to it.
    const given = rulerFindings(account).map((number) => ({
      number,
      tier: auditTier(evidence, number),
    }))
    if (given.length > 0) {
      const tags = panel.map((vet) => vet.tag)
      const ruled = await reportReading(
        ruler,
        () => dependencies.readRuler(ruler, given, tags),
        () =>
          dependencies.runPhase.rule({
            phase: "rule",
            ...phases.rule,
            ...context,
            arguments: [
              report,
              ...panel.map((vet) => vet.report),
              rebut,
              ruler,
              {
                findings: given.map(({ number, tier }) => ({
                  finding: number,
                  tier,
                })),
              },
            ],
            panel: tags,
            sessionId: null,
          }),
        dependencies,
        // The ruler's reading check already read the report it saved.
        async (result) => result.reading,
      )
      if (ruled.status === "failed") return stopped("rule", phases.rule, ruled)
      account = recordWinners(
        account,
        ruled.reading.winners.map(({ number, winner, reason }) => ({
          finding: number,
          winner,
          reason,
        })),
        "ruler",
      )
      for (const { number, choice } of ruled.reading.winners)
        if (choice !== null) rulerChoices.push(number)
      twins.push(ruler)
    }
  }
  return {
    evidence,
    account:
      input.stored === undefined ? account : userWinners(account, input.stored),
    twins,
    rulerChoices,
  }
}

/**
 * Finish a round without findings once its clean record landed: publish the
 * settled account, chain any planning round for open deferrals and apply the
 * series rules.
 */
async function concludeClean(
  input: RoundInput,
  phases: RoundPhases,
  commits: readonly LandedCommit[],
  account: RoundAccount,
  dependencies: RoundDependencies,
  settings: RoundSettings,
): Promise<RoundResult> {
  try {
    dependencies.writeSettledRound(commits, account)
    const deferralChain = await runDeferralChain(input, dependencies)
    const decided =
      input.pool !== undefined &&
      (deferralChain === "none" || deferralChain === "finished")
        ? await runSeriesDecision(input, input.pool, dependencies, settings)
        : { answer: null }
    if ("status" in decided) return { ...decided, commits, account }
    return {
      status: "finished",
      report: input.documents.report,
      cleanAudit: true,
      decision: decided.answer,
      watch: null,
      deferralChain,
      commits,
      account,
    }
  } catch (error) {
    return {
      status: "failed",
      sessionId: null,
      phase: "complete",
      ...phases.audit,
      ...phaseContext(input),
      reason: errorMessage(error),
      commits,
      account,
    }
  }
}

/**
 * Finish a round once its fix ended: publish the settled account, run the
 * watch that follows a plan round, chain any planning round for open deferrals
 * and apply the series rules. A fix that changed the plan's phase or withdrew
 * the move list ends the series before the rules apply.
 */
async function concludeFixed(
  input: RoundInput,
  phases: RoundPhases,
  commits: readonly LandedCommit[],
  account: RoundAccount,
  dependencies: RoundDependencies,
  settings: RoundSettings,
): Promise<RoundResult> {
  const context = phaseContext(input)
  const failed = (error: unknown): FailedRound => ({
    status: "failed",
    sessionId: null,
    phase: "complete",
    ...phases.fix,
    ...context,
    reason: errorMessage(error),
    commits,
    account,
  })
  try {
    dependencies.writeSettledRound(commits, account)
  } catch (error) {
    return failed(error)
  }
  let currentPlan = "plan" in input ? input.plan : null
  if (input.pool !== undefined && currentPlan !== null) {
    try {
      currentPlan = await dependencies.resolvePlan(input, planStem(currentPlan))
    } catch (error) {
      return failed(error)
    }
  }
  const watched =
    "plan" in input
      ? await runWatch(input, dependencies, settings)
      : { grade: null }
  if ("status" in watched) return { ...watched, commits, account }
  let seriesMayContinue: boolean
  try {
    seriesMayContinue =
      "groups" in input ||
      ("source" in input
        ? (await dependencies.readMoveList(input.source)).kind === "moves"
        : currentPlan !== null &&
          planPhase(currentPlan) === planPhase(input.plan) &&
          watched.grade !== "red")
  } catch (error) {
    return failed(error)
  }
  let deferralChain: DeferralChainOutcome = "none"
  if (seriesMayContinue) {
    try {
      deferralChain = await runDeferralChain(input, dependencies)
    } catch (error) {
      return failed(error)
    }
  }
  const decided =
    input.pool !== undefined &&
    seriesMayContinue &&
    (deferralChain === "none" || deferralChain === "finished")
      ? await runSeriesDecision(input, input.pool, dependencies, settings)
      : { answer: null }
  if ("status" in decided) return { ...decided, commits, account }
  return {
    status: "finished",
    report: input.documents.report,
    cleanAudit: false,
    decision: decided.answer,
    watch: watched.grade,
    deferralChain,
    commits,
    account,
  }
}

/**
 * Run one round, new or continued, along one path: the audit, the vet, the
 * rebuttal and the ruler each run unless a kept report reads as valid, then a
 * fresh fix, then the watch and the series rules. A continued round whose
 * stored account carries its outcomes already ended its fix or clean
 * completion, so it goes on after them.
 */
export async function runRound(
  input: RoundInput,
  dependencies: RoundDependencies,
  releases: Record<Assistant, ModelReleases>,
  settings: RoundSettings,
): Promise<RoundResult> {
  const phases = roundPhases(
    input.auditor,
    input.override ?? noOverride,
    settings,
    input,
    targetWorkClass(input),
  )
  const context = phaseContext(input)
  const { repoEduRoot, planRoot, roundKind } = context
  const stored = input.stored
  if (stored !== undefined && settledAccount(stored)) {
    const account = storedAccount(stored)
    return stored.findings.length === 0
      ? concludeClean(
          input,
          phases,
          stored.commits,
          account,
          dependencies,
          settings,
        )
      : concludeFixed(
          input,
          phases,
          stored.commits,
          account,
          dependencies,
          settings,
        )
  }
  const report = input.documents.report
  // The run names one vet report per vetter of the panel, in panel order, each
  // with the tag of the vetter that writes it.
  const panel: readonly PanelRun[] = input.documents.vets.map(
    (vetReport, index) => ({
      run: phases.vet[index],
      report: vetReport,
      tag: documentTag(vetReport),
    }),
  )
  const review = await reviewRound(input, phases, panel, dependencies)
  if ("status" in review) return review
  const { evidence, twins, rulerChoices } = review
  let account = review.account
  if (evidence.findings.length === 0) {
    let landedClean: readonly LandedCommit[]
    try {
      landedClean = (
        await dependencies.completeClean({
          ...input,
          report,
          judgedRepos: evidence.judgedRepos,
        })
      ).commits
    } catch (error) {
      return {
        status: "failed",
        sessionId: null,
        phase: "complete",
        ...phases.audit,
        ...context,
        reason: errorMessage(error),
        commits: [],
        account,
      }
    }
    return concludeClean(
      input,
      phases,
      landedClean,
      account,
      dependencies,
      settings,
    )
  }

  // One wait before the fix asks every question the reviews leave, so no fix
  // writes a recommendation for them. A stored winner is not asked again; a
  // choice is, because only winners are stored.
  const fixerSide = selectedFixerSide(phases, panel, releases)
  const tags = panel.map((vet) => vet.tag)
  const reports = [report, ...twins]
  const questions = rulingQuestions(account, rulerChoices)
  let choices: ChoiceScope["choices"] = []
  if (questions.length > 0) {
    const asked = stored?.commits ?? []
    let answer: RulingInput | null
    try {
      answer = await dependencies.requestRuling({
        document: null,
        reports,
        fixerSide,
        questions,
        panel: tags,
      })
    } catch (error) {
      return {
        status: "failed",
        phase: "ruling-input",
        ...phases.fix,
        ...context,
        sessionId: null,
        reason: errorMessage(error),
        commits: asked,
        account,
      }
    }
    if (answer === null)
      return {
        status: "awaiting-ruling",
        report,
        sessionId: null,
        commits: asked,
        account,
      }
    choices = answer.choices
    account = recordWinners(
      account,
      answer.rulings,
      "user",
      new Set(choices.map(({ finding }) => finding)),
    )
  }

  const deferralScope: DeferralScope | null =
    input.deferrals === undefined ? null : { deferrals: input.deferrals }
  const repositories: readonly { root: string; repository: Repository }[] = [
    { root: repoEduRoot, repository: "repo-edu" },
    { root: planRoot, repository: "plan" },
  ]
  const fixFailure = (
    sessionId: string | null,
    error: unknown,
    commits: readonly LandedCommit[],
  ): FailedRound => ({
    status: "failed",
    sessionId,
    phase: "fix",
    ...phases.fix,
    ...context,
    reason: errorMessage(error),
    commits,
    account,
  })
  let before: readonly string[]
  // The commits the stopped fix landed count for this round as if the new fix
  // had landed them; the new fix sees them as moved heads.
  let landed: readonly (readonly LandedRecord[])[]
  try {
    before = await Promise.all(
      repositories.map(({ root }) => dependencies.readHead(root)),
    )
    const kept = await Promise.all(
      (stored?.commits ?? []).map(({ repository, sha }) =>
        dependencies.readRecord(
          repository === "repo-edu" ? repoEduRoot : planRoot,
          sha,
          repository,
        ),
      ),
    )
    landed = repositories.map(({ repository }) =>
      kept.filter((record) => record.repository === repository),
    )
  } catch (error) {
    return fixFailure(null, error, stored?.commits ?? [])
  }
  // The fix receives every contest and split with the winner the ruler or the
  // user named, and every choice the user made, from its first call.
  const serious = seriousFindings(account)
  const contests = contestScope(account.findings, disputedFindings(account))
  let fixInput: PhaseInput<"fix"> = {
    phase: "fix",
    ...phases.fix,
    ...context,
    arguments: [
      report,
      ...twins,
      ...(deferralScope === null ? [] : [deferralScope]),
      ...(contests === null ? [] : [contests]),
      ...(choices.length === 0 ? [] : [{ choices }]),
    ],
    rulingFile: input.documents.ruling,
    sessionId: null,
  }
  let commits: readonly LandedCommit[] = landed
    .flat()
    .map(({ repository, sha }) => ({ repository, sha }))
  // A commit belongs to the round when it opens with the round's own form: a
  // plan round's stem or a commit round's series label. Another plan's round,
  // another series and hand-run work carry another form or none.
  const belongsToRound =
    "plan" in input
      ? (record: LandedRecord) =>
          planForm(record.subject)?.stem === planStem(input.plan)
      : (record: LandedRecord) =>
          seriesLabel(record.subject) === targetLabel(input)
  // A fix may commit before it fails, is interrupted or asks for a ruling.
  // Read its records after every invocation so every exit retains the same
  // exact scope evidence as a finished fix.
  const readFixRecords = async (): Promise<
    readonly (readonly LandedRecord[])[]
  > =>
    (
      await Promise.all(
        repositories.map(({ root, repository }, index) =>
          dependencies.readRecords(root, before[index], repository),
        ),
      )
    ).map((records) => records.filter(belongsToRound))
  const collectFixRecords = async (): Promise<void> => {
    const found = await readFixRecords()
    landed = landed.map((records, index) => {
      const joined = new Map(
        [...records, ...(found[index] ?? [])].map((record) => [
          record.sha,
          record,
        ]),
      )
      return [...joined.values()]
    })
    commits = landed.flat().map(({ repository, sha }) => ({ repository, sha }))
  }
  // A fix that finds a decision the reviews could not raise writes a ruling;
  // its own session resumes with the user's reply.
  let pendingRuling = false
  while (true) {
    if (pendingRuling) {
      const sessionId: string | null = fixInput.sessionId
      if (sessionId === null)
        throw new Error("A ruling has no fix session to resume")
      let answer: RulingInput | null
      try {
        answer = await dependencies.requestRuling({
          document: input.documents.ruling,
          reports,
          fixerSide,
          questions: [],
          panel: tags,
        })
      } catch (error) {
        return {
          status: "failed",
          phase: "ruling-input",
          ...phases.fix,
          ...context,
          sessionId,
          reason: errorMessage(error),
          commits,
          account,
        }
      }
      if (answer === null)
        return {
          status: "awaiting-ruling",
          report,
          sessionId,
          commits,
          account,
        }
      fixInput = { ...fixInput, sessionId, rulingReply: answer.reply }
      pendingRuling = false
    }
    let fix: PhaseResult<"fix">
    try {
      fix = await dependencies.runPhase.fix(fixInput)
    } catch (error) {
      try {
        await collectFixRecords()
      } catch (recordError) {
        return fixFailure(fixInput.sessionId, recordError, commits)
      }
      return fixFailure(fixInput.sessionId, error, commits)
    }
    try {
      await collectFixRecords()
    } catch (error) {
      return fixFailure(fix.sessionId, error, commits)
    }
    if (fix.status === "failed") {
      return {
        ...fix,
        phase: "fix",
        ...phases.fix,
        ...context,
        commits,
        account,
      }
    }

    if (fix.status === "needs-ruling") {
      try {
        await dependencies.checkFile(input.documents.ruling)
      } catch (error) {
        return fixFailure(fix.sessionId, error, commits)
      }
    }

    if (fix.status === "finished") {
      try {
        const unresolved = openContests(account, serious)
        if (unresolved.length > 0)
          throw new Error(
            `The finished fix left serious contests or splits without winners: ${unresolved.map((number) => `finding ${number}`).join(", ")}`,
          )
        // The fix ends the round and has answered every ruling it asked, so
        // its settling line is the recommendation the series rules read. The
        // audit report's closing line stands only when no fix ran.
        const widening =
          "plan" in input &&
          roundKind === "planning" &&
          planPhase(input.plan) === "widening"
        if (widening && fix.settling === null)
          throw new Error("A widening fix must end with a settling line")
        if (!widening && fix.settling !== null)
          throw new Error("Only a widening fix returns a settling line")
        if (fix.settling !== null)
          account = { ...account, settling: fix.settling }
        // A plan or move-list fix lands the round's record with its change;
        // only a commit round whose findings all need a listed-file change
        // lands nothing.
        if (
          !("groups" in input) &&
          landed.every((records) => records.length === 0)
        )
          throw new Error(
            `The finished fix landed no commit for a ${"source" in input ? "move-list" : "plan"} target`,
          )
        for (const [index, records] of landed.entries()) {
          for (const { subject } of records) {
            parseSubject(subject, repositories[index].repository)
          }
        }
        account = {
          ...account,
          findings: settleRoundFindings(account.findings, landed.flat()),
        }
      } catch (error) {
        return fixFailure(fix.sessionId, error, commits)
      }
      return concludeFixed(
        input,
        phases,
        commits,
        account,
        dependencies,
        settings,
      )
    }

    fixInput = { ...fixInput, sessionId: fix.sessionId }
    pendingRuling = true
  }
}

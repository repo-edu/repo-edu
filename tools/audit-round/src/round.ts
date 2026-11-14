import { readModelRecord } from "./commit-msg.js"
import { errorMessage } from "./feedback.js"
import type { WatchGrade } from "./glance.js"
import { decideSeries } from "./judge.js"
import type { LifecycleCommit } from "./lifecycle.js"
import type { OpenDeferral } from "./open-deferrals.js"
import type { RoundDocuments } from "./output.js"
import {
  type Assistant,
  type AuditorOverride,
  type AuditorSelectionSource,
  type ContestScope,
  closePhase,
  type DeferralChainOutcome,
  type DeferralScope,
  type FixerSide,
  type InteractiveSession,
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
import type { AuditReport } from "./report.js"
import {
  findingSplit,
  gradedAOrB,
  type LandedCommit,
  type PanelVet,
  type RoundAccount,
  reviewedRoundFindings,
  roundDataIdentity,
  type SeriesAnswer,
  settleRoundFindings,
} from "./round-data.js"
import { documentTag, transcriptNameStart } from "./round-paths.js"
import type { RulingInput } from "./ruling-wait.js"
import type { Auditor, RoundSettings } from "./settings.js"
import { looseForm, parseSubject, type Repository } from "./subject.js"
import {
  type AuditTarget,
  commitAuditGroups,
  planPhase,
  planStem,
  type RoundContext,
  reportTarget,
} from "./target.js"

function samePhaseSelection(first: PhaseRun, second: PhaseRun): boolean {
  return (
    first.assistant === second.assistant &&
    first.model.model.value === second.model.model.value &&
    first.model.effort.value === second.model.effort.value
  )
}

/**
 * Name whether the fix uses the selected model and effort of the auditor or of
 * one vet of the panel, which it names by its tag.
 */
function selectedFixerSide(
  phases: Pick<RoundPhases, "audit" | "fix">,
  panel: readonly PanelRun[],
): FixerSide {
  if (samePhaseSelection(phases.fix, phases.audit)) return "auditor"
  const vet = panel.find(({ run }) => samePhaseSelection(phases.fix, run))
  return vet === undefined ? "neither" : { vet: vet.tag }
}

/** One vet of the round's panel: what it runs on, its report and its tag. */
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
        throw new Error(`Contest names no report finding: ${number}`)
      return {
        finding: number,
        ...(finding.ruling === undefined ? {} : finding.ruling),
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
 * The findings the user rules on: a contest or a split on a finding that the
 * report or a vet graded A or B. A contest is the rebuttal contesting a vet's
 * verdict. A split is two vets of the panel giving different verdicts, under
 * `reviewsSplit`.
 */
export function seriousFindings(account: RoundAccount): readonly number[] {
  return account.findings.flatMap((finding) => {
    const disputed =
      finding.reviews.some((review) => review.answer === "contest") ||
      findingSplit(finding.reviews)
    return finding.number !== null && gradedAOrB(finding) && disputed
      ? [finding.number]
      : []
  })
}

/** The serious findings that still need the user's winner. */
export function openSeriousFindings(account: RoundAccount): readonly number[] {
  return openContests(account, seriousFindings(account))
}

/** Record each admitted winner; the waiting run already checked the answer is complete. */
function recordRulings(
  account: RoundAccount,
  rulings: RulingInput["rulings"],
): RoundAccount {
  const byNumber = new Map(rulings.map((ruling) => [ruling.finding, ruling]))
  return {
    ...account,
    findings: account.findings.map((finding) => {
      const ruling =
        finding.number === null ? undefined : byNumber.get(finding.number)
      return ruling === undefined
        ? finding
        : {
            ...finding,
            ruling: { winner: ruling.winner, reason: ruling.reason },
          }
    }),
  }
}

/** Compare the commit body's complete leading model record with this round's stamps. */
function carriesPhaseStamp(
  record: LandedRecord,
  stamps: readonly string[],
): boolean {
  const body = record.message.startsWith(`${record.subject}\n`)
    ? record.message.slice(record.subject.length + 1)
    : record.message
  try {
    const recordStamp = readModelRecord(body).join("\n")
    return stamps.includes(recordStamp)
  } catch {
    return false
  }
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
     * The series pool the runner routes between, present only for an automatic
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
  /** Retained state used only by the runner-owned serious-contest recovery. */
  readonly recovery?: {
    readonly account: RoundAccount
    readonly phases: Pick<RoundPhases, "audit" | "vet" | "rebut" | "fix">
    readonly sessionId: string
    readonly rulingReady: boolean
    readonly records: readonly LandedRecord[]
  }
}

export type RoundFailure = PhaseFailure &
  PhaseRun &
  RoundContext & {
    readonly phase: Phase | "ruling-input" | "complete"
    /** Overrides the diagnostic session identity when this failure cannot resume it. */
    readonly resumeSessionId?: string | null
  }

/** The session a failed round may resume, which can differ from its diagnostic identity. */
export function failureResumeSessionId(failure: RoundFailure): string | null {
  return failure.resumeSessionId === undefined
    ? failure.sessionId
    : failure.resumeSessionId
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
      readonly session: InteractiveSession
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
 * record its commits carry; its workflow owns the plan move, the commits and
 * the sidecars it deletes. The runner itself then moves and commits the plan's
 * round data, so that account never depends on the session remembering it.
 */
export async function runClose(
  input: CloseInput,
  dependencies: Pick<
    RoundDependencies,
    "runPhase" | "fileExists" | "archiveRoundData"
  >,
  settings: RoundSettings,
): Promise<CloseResult> {
  const run = closePhase(settings)
  const { cwd, repoEduRoot, planRoot, activeRoot, roundKind } = input
  const context = { cwd, repoEduRoot, planRoot, activeRoot, roundKind }
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
    const archived = await dependencies.archiveRoundData(
      planStem(input.plan),
      input.tag,
      input.record,
    )
    return { status: "finished", archived }
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
  input: RoundContext & Pick<RoundInput, "watch"> & { readonly plan: string },
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
  const phases = { watch: watchPhase(settings) }
  const { cwd, repoEduRoot, planRoot, activeRoot, roundKind } = input
  const context = { cwd, repoEduRoot, planRoot, activeRoot, roundKind }
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
      resumeSessionId: null,
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
  const { cwd, repoEduRoot, planRoot, activeRoot, roundKind } = input
  const context = { cwd, repoEduRoot, planRoot, activeRoot, roundKind }
  try {
    const currentRound = roundDataIdentity(
      transcriptNameStart(input.transcript),
    )
    const evidence = await dependencies.seriesEvidence({
      ...context,
      stem: "plan" in input ? planStem(input.plan) : currentRound.target,
      seriesKind: "groups" in input ? "commit" : "plan",
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
  return dependencies.chainDeferrals({
    plan: input.plan,
    auditor: input.auditor,
  })
}

export async function runRound(
  input: RoundInput,
  dependencies: RoundDependencies,
  settings: RoundSettings,
): Promise<RoundResult> {
  let account: RoundAccount = input.recovery?.account ?? {
    settling: "",
    judgedRepos: [],
    findings: [],
  }
  const phases =
    input.recovery?.phases ??
    roundPhases(
      input.auditor,
      input.override ?? noOverride,
      settings,
      input,
      targetWorkClass(input),
    )
  const { cwd, repoEduRoot, planRoot, activeRoot, roundKind } = input
  const context = { cwd, repoEduRoot, planRoot, activeRoot, roundKind }
  const deferralScope: DeferralScope | null =
    input.deferrals === undefined ? null : { deferrals: input.deferrals }
  const report = input.documents.report
  // The run names one report per vet of the panel, in panel order, each with
  // the tag of the vet that writes it.
  const panel: readonly PanelRun[] = input.documents.vets.map(
    (vetReport, index) => ({
      run: phases.vet[index],
      report: vetReport,
      tag: documentTag(vetReport),
    }),
  )
  const vetReports = panel.map((vet) => vet.report)
  const twins = [...vetReports]
  if (input.recovery === undefined) {
    const auditInput: PhaseInput<"audit"> = {
      phase: "audit",
      ...phases.audit,
      ...context,
      arguments:
        "groups" in input
          ? [input.documents.report, ...commitAuditGroups(input)]
          : input.roundKind === "planning"
            ? [
                input.documents.report,
                input.plan,
                ...(deferralScope === null ? [] : [deferralScope]),
              ]
            : [
                input.documents.report,
                input.plan,
                input.scope,
                ...(deferralScope === null ? [] : [deferralScope]),
              ],
      sessionId: null,
    }
    const audit = await reportPhase(
      () => dependencies.runPhase.audit(auditInput),
      input.documents.report,
      dependencies,
    )
    if (audit.status === "failed") {
      return {
        ...audit,
        phase: "audit",
        ...phases.audit,
        ...context,
        commits: [],
        account,
      }
    }

    let evidence: AuditReport
    try {
      evidence = await dependencies.readReport(
        report,
        roundKind === "implementation"
          ? "implementation"
          : planPhase(input.plan),
        reportTarget(input),
      )
    } catch (error) {
      return {
        status: "failed",
        sessionId: audit.sessionId,
        phase: "audit",
        ...phases.audit,
        ...context,
        reason: errorMessage(error),
        commits: [],
        account,
      }
    }
    account = {
      settling: evidence.settling,
      judgedRepos: evidence.judgedRepos,
      findings: reviewedRoundFindings(evidence.findings),
    }
    // Zero findings complete in the runner. No later assistant or historical
    // watch can add anything needed to close this audit.
    if (evidence.findings.length === 0) {
      try {
        const completion = await dependencies.completeClean({
          ...input,
          report,
          judgedRepos: evidence.judgedRepos,
        })
        try {
          dependencies.writeSettledRound(completion.commits, account)
          const deferralChain = await runDeferralChain(input, dependencies)
          const decided =
            input.pool !== undefined &&
            (deferralChain === "none" || deferralChain === "finished")
              ? await runSeriesDecision(
                  input,
                  input.pool,
                  dependencies,
                  settings,
                )
              : { answer: null }
          if ("status" in decided)
            return { ...decided, commits: completion.commits, account }
          return {
            status: "finished",
            report,
            cleanAudit: true,
            decision: decided.answer,
            watch: null,
            deferralChain,
            commits: completion.commits,
            account,
          }
        } catch (error) {
          return {
            status: "failed",
            sessionId: null,
            phase: "complete",
            ...phases.audit,
            ...context,
            reason: errorMessage(error),
            commits: completion.commits,
            account,
          }
        }
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
    }

    // Every vet reads the audit report on its own and at the same time. The
    // round waits for the slowest; a failed vet fails the round, and the
    // finished vets' reports stay in place.
    const vetted = await Promise.all(
      panel.map((vet) =>
        reportPhase(
          () =>
            dependencies.runPhase.vet({
              phase: "vet",
              ...vet.run,
              ...context,
              arguments: [report, vet.report],
              sessionId: null,
            }),
          vet.report,
          dependencies,
        ),
      ),
    )
    const failedVet = vetted.findIndex((vet) => vet.status === "failed")
    const failure = vetted[failedVet]
    if (failure?.status === "failed") {
      return {
        ...failure,
        phase: "vet",
        ...panel[failedVet].run,
        ...context,
        commits: [],
        account,
      }
    }

    const vets: PanelVet[] = []
    let accepted = true
    for (const [index, vet] of panel.entries()) {
      try {
        const reading = await dependencies.readVet(
          vet.report,
          evidence.findings,
        )
        vets.push({ vet: vet.tag, reviews: reading.reviews })
        accepted &&= reading.allAccepted
      } catch (error) {
        return {
          status: "failed",
          sessionId: vetted[index].sessionId,
          phase: "vet",
          ...vet.run,
          ...context,
          reason: errorMessage(error),
          commits: [],
          account,
        }
      }
    }
    account = {
      ...account,
      findings: reviewedRoundFindings(evidence.findings, vets),
    }
    // The rebuttal runs once for the whole panel, unless every vet accepted
    // every finding.
    if (!accepted) {
      const rebut = await reportPhase(
        () =>
          dependencies.runPhase.rebut({
            phase: "rebut",
            ...phases.rebut,
            ...context,
            arguments: [report, ...vetReports, input.documents.rebut],
            sessionId: null,
          }),
        input.documents.rebut,
        dependencies,
      )
      if (rebut.status === "failed") {
        return {
          ...rebut,
          phase: "rebut",
          ...phases.rebut,
          ...context,
          commits: [],
          account,
        }
      }
      try {
        const rebuttals = await dependencies.readRebuttal(
          input.documents.rebut,
          evidence.findings,
          vets,
        )
        account = {
          ...account,
          findings: reviewedRoundFindings(evidence.findings, vets, rebuttals),
        }
      } catch (error) {
        return {
          status: "failed",
          sessionId: rebut.sessionId,
          phase: "rebut",
          ...phases.rebut,
          ...context,
          reason: errorMessage(error),
          commits: [],
          account,
        }
      }
      twins.push(input.documents.rebut)
    }
  } else {
    twins.push(input.documents.rebut)
  }

  const repositories: readonly { root: string; repository: Repository }[] = [
    { root: repoEduRoot, repository: "repo-edu" },
    { root: planRoot, repository: "plan" },
  ]
  let before: readonly string[]
  try {
    before = await Promise.all(
      repositories.map(({ root }) => dependencies.readHead(root)),
    )
  } catch (error) {
    return {
      status: "failed",
      sessionId: null,
      phase: "fix",
      ...phases.fix,
      ...context,
      reason: errorMessage(error),
      commits: [],
      account,
    }
  }
  const contests = seriousFindings(account)
  const fixArguments = (): PhaseInput<"fix">["arguments"] => {
    const scope = contestScope(account.findings, contests)
    return [
      report,
      ...twins,
      ...(deferralScope === null ? [] : [deferralScope]),
      ...(scope === null ? [] : [scope]),
    ]
  }
  let fixInput: PhaseInput<"fix"> = {
    phase: "fix",
    ...phases.fix,
    ...context,
    arguments: fixArguments(),
    rulingFile: input.documents.ruling,
    sessionId: input.recovery?.sessionId ?? null,
  }
  let landed: readonly (readonly LandedRecord[])[] = repositories.map(
    ({ repository }) =>
      input.recovery?.records.filter(
        (record) => record.repository === repository,
      ) ?? [],
  )
  let commits: readonly LandedCommit[] = landed
    .flat()
    .map(({ repository, sha }) => ({ repository, sha }))
  // A fix may commit before it fails, is interrupted or asks for a ruling.
  // Read its records after every invocation so every exit retains the same
  // exact scope evidence as a finished fix.
  const readFixRecords = async (): Promise<
    readonly (readonly LandedRecord[])[]
  > => {
    const stem = "plan" in input ? planStem(input.plan) : null
    const phaseStamps = stem === null ? dependencies.commitPhaseStamps() : []
    if (stem === null && phaseStamps.length === 0)
      throw new Error("Missing fix phase stamp for a commit target")
    const belongsToRound = (record: LandedRecord): boolean => {
      if ((looseForm(record.subject)?.stem ?? null) !== stem) return false
      if (stem !== null) return true
      return carriesPhaseStamp(record, phaseStamps)
    }
    return (
      await Promise.all(
        repositories.map(({ root, repository }, index) =>
          dependencies.readRecords(root, before[index], repository),
        ),
      )
    ).map((records) => records.filter(belongsToRound))
  }
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
  let pendingRuling = input.recovery?.rulingReady ?? false
  while (true) {
    if (pendingRuling) {
      const sessionId = fixInput.sessionId
      if (sessionId === null)
        throw new Error("A retained ruling has no fix session")
      const session: InteractiveSession = {
        ...phases.fix,
        sessionId,
        ...context,
      }
      try {
        const open = openContests(account, contests)
        const ruling = await dependencies.requestRuling({
          document: input.documents.ruling,
          fixerSide: selectedFixerSide(phases, panel),
          contests: open,
          panel: panel.map((vet) => vet.tag),
          judgedRepos: account.judgedRepos,
        })
        if (ruling === null)
          return {
            status: "awaiting-ruling",
            report,
            session,
            commits,
            account,
          }
        account = recordRulings(account, ruling.rulings)
        fixInput = {
          ...fixInput,
          arguments: fixArguments(),
          sessionId,
          rulingReply: ruling.reply,
        }
        pendingRuling = false
      } catch (error) {
        return {
          status: "failed",
          phase: "ruling-input",
          ...session,
          reason: error instanceof Error ? error.message : String(error),
          commits,
          account,
        }
      }
    }
    let fix: PhaseResult<"fix">
    try {
      fix = await dependencies.runPhase.fix(fixInput)
    } catch (error) {
      try {
        await collectFixRecords()
      } catch (recordError) {
        return {
          status: "failed",
          sessionId: fixInput.sessionId,
          phase: "fix",
          ...phases.fix,
          ...context,
          reason: errorMessage(recordError),
          commits,
          account,
        }
      }
      return {
        status: "failed",
        sessionId: fixInput.sessionId,
        phase: "fix",
        ...phases.fix,
        ...context,
        reason: errorMessage(error),
        commits,
        account,
      }
    }
    try {
      await collectFixRecords()
    } catch (error) {
      return {
        status: "failed",
        sessionId: fix.sessionId,
        phase: "fix",
        ...phases.fix,
        ...context,
        reason: errorMessage(error),
        commits,
        account,
      }
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
        return {
          status: "failed",
          phase: "fix",
          sessionId: fix.sessionId,
          ...phases.fix,
          ...context,
          reason: errorMessage(error),
          commits,
          account,
        }
      }
    }

    if (fix.status === "finished") {
      try {
        const unresolved = openContests(account, contests)
        if (unresolved.length > 0)
          throw new Error(
            `The finished fix left serious contests or splits without winners: ${unresolved.map((number) => `finding ${number}`).join(", ")}`,
          )
        // The fix ends the round and has answered every ruling it asked, so
        // its settling line is the recommendation the series rules read. The audit
        // report's closing line stands only when no fix ran.
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
        if ("plan" in input && landed.every((records) => records.length === 0))
          throw new Error("The finished fix landed no commit for a plan target")
        for (const [index, records] of landed.entries()) {
          for (const { subject } of records) {
            parseSubject(subject, repositories[index].repository)
          }
        }
        account = {
          ...account,
          findings: settleRoundFindings(account.findings, landed.flat()),
        }
        await dependencies.deleteRoundReports(
          input.activeRoot,
          transcriptNameStart(input.transcript),
        )
      } catch (error) {
        return {
          status: "failed",
          sessionId: fix.sessionId,
          phase: "fix",
          ...phases.fix,
          ...context,
          reason: errorMessage(error),
          commits,
          account,
        }
      }
      try {
        dependencies.writeSettledRound(commits, account)
      } catch (error) {
        return {
          status: "failed",
          sessionId: null,
          phase: "complete",
          ...phases.fix,
          ...context,
          reason: errorMessage(error),
          commits,
          account,
        }
      }
      let currentPlan = "plan" in input ? input.plan : null
      if (input.pool !== undefined && currentPlan !== null) {
        try {
          currentPlan = await dependencies.resolvePlan(
            input,
            planStem(currentPlan),
          )
        } catch (error) {
          return {
            status: "failed",
            sessionId: null,
            phase: "complete",
            ...phases.fix,
            ...context,
            reason: errorMessage(error),
            commits,
            account,
          }
        }
      }
      const watched =
        "plan" in input
          ? await runWatch(input, dependencies, settings)
          : { grade: null }
      if ("status" in watched) return { ...watched, commits, account }
      const seriesMayContinue =
        "groups" in input ||
        (currentPlan !== null &&
          planPhase(currentPlan) === planPhase(input.plan) &&
          watched.grade !== "red")
      let deferralChain: DeferralChainOutcome = "none"
      if (seriesMayContinue) {
        try {
          deferralChain = await runDeferralChain(input, dependencies)
        } catch (error) {
          return {
            status: "failed",
            sessionId: null,
            phase: "complete",
            ...phases.fix,
            ...context,
            reason: errorMessage(error),
            commits,
            account,
          }
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
        report,
        cleanAudit: false,
        decision: decided.answer,
        watch: watched.grade,
        deferralChain,
        commits,
        account,
      }
    }

    fixInput = { ...fixInput, sessionId: fix.sessionId }
    pendingRuling = true
  }
}

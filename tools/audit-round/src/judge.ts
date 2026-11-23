import type { ExecutionContext } from "./context.js"
import { episodeMembers } from "./episode.js"
import {
  type LogCommit,
  readCommitTimes,
  readLog,
  shortSha,
} from "./episode-log.js"
import { readFindings } from "./findings.js"
import {
  type PlanRoundData,
  type RoundData,
  readPlanRoundData,
  readSeriesRoundData,
  roundDataFilename,
  type SeriesAnswer,
  type SplitRoundData,
} from "./round-data.js"
import { targetLabel } from "./round-paths.js"
import type { Auditor } from "./settings.js"
import { planForm, type Repository, seriesForm } from "./subject.js"
import {
  type AuditTarget,
  moveListFile,
  planStem,
  type RoundKind,
} from "./target.js"

export type SeriesCommit = {
  readonly repository: Repository
  readonly sha: string
  readonly committed: string
  readonly subject: string
  readonly role: string | null
  readonly files: readonly string[]
  readonly renames: readonly { readonly from: string; readonly to: string }[]
  readonly acceptedTiers: readonly ("A" | "B" | "C" | "D")[]
  /** The commit changes the series' document: the plan file or the move list. */
  readonly changesDocument: boolean
  /** The commit's form names the series' own plan stem or move-list label. */
  readonly ownStem: boolean
}

export type SeriesEvidence = {
  /**
   * The document the series judges, which names an edit to it in a rule 3
   * reason; null for a commit series, which judges commits and reads none.
   */
  readonly document: "plan" | "move list" | null
  readonly roundData: {
    readonly file: string
    readonly rounds: readonly RoundData[]
  }
  /** Commits recorded by every round kind, used to distinguish outside edits. */
  readonly roundCommits: ReadonlySet<string>
  /** Commit times for the bounded set of records landed by retained rounds. */
  readonly roundCommitTimes: ReadonlyMap<string, number>
  readonly commits: readonly SeriesCommit[]
}

export type SeriesEvidenceInput = ExecutionContext & {
  readonly target: AuditTarget
}

function acceptedTiers(
  body: string,
  repository: Repository,
  role: string | null,
): SeriesCommit["acceptedTiers"] {
  try {
    return readFindings(body, repository, role).map(
      (finding) => finding.tier.toUpperCase() as "A" | "B" | "C" | "D",
    )
  } catch {
    return []
  }
}

function roundCommitKey(repository: Repository, sha: string): string {
  return `${repository}@${sha}`
}

/** Keep commit times only for records named by retained rounds. */
export function retainedRoundCommitTimes(
  rounds: readonly RoundData[],
  logs: Readonly<Record<Repository, readonly LogCommit[]>>,
): ReadonlyMap<string, number> {
  const retained = new Set(
    rounds.flatMap((round) =>
      round.commits.map((commit) =>
        roundCommitKey(commit.repository, commit.sha),
      ),
    ),
  )
  const times = new Map<string, number>()
  for (const [repository, log] of Object.entries(logs) as [
    Repository,
    readonly LogCommit[],
  ][]) {
    for (const commit of log) {
      const key = roundCommitKey(repository, commit.sha)
      if (retained.has(key)) times.set(key, timestamp(commit.committedAt))
    }
  }
  return times
}

async function readRetainedRoundCommitTimes(
  input: ExecutionContext,
  rounds: readonly RoundData[],
): Promise<ReadonlyMap<string, number>> {
  const repositories = ["plan", "repo-edu"] as const
  const entries = await Promise.all(
    repositories.map(async (repository) => {
      const commits = rounds.flatMap((round) =>
        round.commits
          .filter((commit) => commit.repository === repository)
          .map((commit) => commit.sha),
      )
      const root = repository === "plan" ? input.planRoot : input.repoEduRoot
      return [repository, await readCommitTimes(root, commits)] as const
    }),
  )
  return new Map(
    entries.flatMap(([repository, times]) =>
      [...times].map(
        ([sha, committedAt]) =>
          [roundCommitKey(repository, sha), timestamp(committedAt)] as const,
      ),
    ),
  )
}

/** Build one plan's evidence from already-read data and Git logs. */
export function planSeriesEvidence(input: {
  readonly stem: string
  readonly roundKind: Exclude<RoundKind, "split">
  readonly roundData: PlanRoundData
  readonly logs: Readonly<Record<Repository, readonly LogCommit[]>>
}): SeriesEvidence {
  const { roundData } = input
  const allRounds = [
    ...(roundData.planning ?? []),
    ...(roundData.implementation ?? []),
  ]
  const commits = (
    [
      ["plan", input.logs.plan],
      ["repo-edu", input.logs["repo-edu"]],
    ] as const
  )
    .flatMap(([repository, log]) =>
      episodeMembers(log, repository, input.stem)
        .members.toReversed()
        .map((commit): SeriesCommit => {
          const form = planForm(commit.subject)
          const role = form?.role ?? null
          return {
            repository,
            sha: commit.sha,
            committed: new Date(commit.committedAt).toISOString(),
            subject: commit.subject,
            role,
            files: commit.files,
            renames: commit.renames,
            acceptedTiers: acceptedTiers(commit.body, repository, role),
            changesDocument:
              repository === "plan" &&
              commit.files.some(
                (file) =>
                  file === `active/${input.stem}.md` ||
                  file === `active/${input.stem}-widen.md`,
              ),
            ownStem: form?.stem === input.stem,
          }
        }),
    )
    .sort(
      (first, second) =>
        Date.parse(first.committed) - Date.parse(second.committed),
    )
  return {
    document: "plan",
    roundData: {
      file: roundDataFilename(input.stem, input.roundKind),
      rounds: allRounds,
    },
    roundCommits: new Set(
      allRounds.flatMap((round) => round.commits.map((commit) => commit.sha)),
    ),
    roundCommitTimes: retainedRoundCommitTimes(allRounds, input.logs),
    commits,
  }
}

/**
 * Build one move-list series' evidence from its rounds and the plan repo's log,
 * as a plan's evidence is built. The series' document is the one move list, so
 * the commits it reads are those that change the list and those whose form
 * carries the series' label: the design commits, the rounds' records and a
 * hand-run audit's record.
 */
export function splitSeriesEvidence(input: {
  readonly label: string
  /** The move list's path relative to the plan checkout's root. */
  readonly list: string
  readonly rounds: readonly SplitRoundData[]
  readonly log: readonly LogCommit[]
}): SeriesEvidence {
  const commits = input.log
    .flatMap((commit): SeriesCommit[] => {
      const form = seriesForm(commit.subject)
      const ownStem = form?.label === input.label
      const changesDocument = commit.files.includes(input.list)
      if (!ownStem && !changesDocument) return []
      const role = ownStem ? (form?.role ?? null) : null
      return [
        {
          repository: "plan",
          sha: commit.sha,
          committed: new Date(commit.committedAt).toISOString(),
          subject: commit.subject,
          role,
          files: commit.files,
          renames: commit.renames,
          acceptedTiers: acceptedTiers(commit.body, "plan", role),
          changesDocument,
          ownStem,
        },
      ]
    })
    .sort(
      (first, second) =>
        Date.parse(first.committed) - Date.parse(second.committed),
    )
  return {
    document: "move list",
    roundData: {
      file: roundDataFilename(input.label, "series"),
      rounds: input.rounds,
    },
    roundCommits: new Set(
      input.rounds.flatMap((round) =>
        round.commits.map((commit) => commit.sha),
      ),
    ),
    roundCommitTimes: retainedRoundCommitTimes(input.rounds, {
      plan: input.log,
      "repo-edu": [],
    }),
    commits,
  }
}

async function readPlanSeriesEvidence(
  input: ExecutionContext,
  stem: string,
  roundKind: Exclude<RoundKind, "split">,
): Promise<SeriesEvidence> {
  const [roundData, plan, repoEdu] = await Promise.all([
    readPlanRoundData(input.roundRoot, stem),
    readLog(input.planRoot),
    readLog(input.repoEduRoot),
  ])
  return planSeriesEvidence({
    stem,
    roundKind,
    roundData,
    logs: { plan, "repo-edu": repoEdu },
  })
}

async function readCommitSeriesEvidence(
  input: ExecutionContext,
  label: string,
): Promise<SeriesEvidence> {
  // A series opening on a fresh commit target has no file yet.
  const rounds = await readSeriesRoundData(input, label)
  return {
    document: null,
    roundData: {
      file: roundDataFilename(label, "series"),
      rounds,
    },
    roundCommits: new Set(),
    roundCommitTimes: await readRetainedRoundCommitTimes(input, rounds),
    commits: [],
  }
}

async function readSplitSeriesEvidence(
  input: ExecutionContext,
  label: string,
  source: string,
): Promise<SeriesEvidence> {
  const [rounds, log] = await Promise.all([
    readSeriesRoundData(input, label),
    readLog(input.planRoot),
  ])
  return splitSeriesEvidence({
    label,
    list: moveListFile(source),
    rounds: rounds.filter(
      (round): round is SplitRoundData => "source" in round,
    ),
    log,
  })
}

/** Read the retained round data and bounded commit facts used by the series rules. */
export async function readSeriesEvidence(
  input: SeriesEvidenceInput,
): Promise<SeriesEvidence> {
  const { target } = input
  if ("groups" in target)
    return readCommitSeriesEvidence(input, targetLabel(target))
  if ("source" in target)
    return readSplitSeriesEvidence(input, targetLabel(target), target.source)
  return readPlanSeriesEvidence(input, planStem(target.plan), target.roundKind)
}

type CurrentRound = Pick<RoundData, "target" | "round">

function settled(entry: RoundData, current?: CurrentRound): boolean {
  const currentInProgress =
    entry.status === "in-progress" &&
    entry.target === current?.target &&
    entry.round === current.round
  const statusSettled =
    entry.status === "finished" ||
    entry.status === "failed" ||
    entry.status === "interrupted" ||
    currentInProgress
  const emptyCommitSettled =
    "originalGroups" in entry &&
    (entry.status === "finished" || currentInProgress)
  return (
    statusSettled &&
    (entry.commits.length > 0 || emptyCommitSettled) &&
    entry.findings.every((finding) => finding.outcome !== null)
  )
}

/** One event that changed a scope, in the words the series reason names it by. */
type ScopeEvent = { readonly time: number; readonly text: string }

/** The highest tier of a real bug this round found under its phase's settled threshold. */
function realBugTier(entry: RoundData): "A" | "B" | null {
  const tiers: readonly ("A" | "B")[] =
    "phase" in entry && entry.phase === "widening" ? ["A"] : ["A", "B"]
  const accepted = entry.findings
    .filter(
      (finding) =>
        finding.outcome === "kept" || finding.outcome === "unmatched",
    )
    .map((finding) => finding.finalTier ?? finding.tier)
  return tiers.find((tier) => accepted.includes(tier)) ?? null
}

/** A real-bug round is an event when its latest record lands. */
function realBugEvent(
  evidence: SeriesEvidence,
  entry: RoundData,
  tier: "A" | "B",
  target: string,
): ScopeEvent {
  const newest = entry.commits
    .flatMap((commit) => {
      const time = evidence.roundCommitTimes.get(
        roundCommitKey(commit.repository, commit.sha),
      )
      return time === undefined ? [] : [{ time, sha: commit.sha }]
    })
    .toSorted((first, second) => second.time - first.time)[0]
  if (newest === undefined)
    throw new Error(
      `Real-bug round ${entry.target} ${entry.round} has no landed commit time`,
    )
  const round =
    entry.target === target
      ? `round ${entry.round}`
      : `${entry.target} round ${entry.round}`
  return {
    time: newest.time,
    text: `${round}'s accepted ${tier} landed as ${shortSha(newest.sha)}`,
  }
}

function timestamp(value: string): number {
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed))
    throw new Error(`Invalid series timestamp: ${value}`)
  return parsed
}

function isAuditRole(role: string | null): boolean {
  return (
    role === "audit" ||
    role === "plan-audit" ||
    role === "split-audit" ||
    role?.startsWith("impl-audit-") === true
  )
}

function reopens(commit: SeriesCommit): boolean {
  return commit.renames.some(({ to }) => to.endsWith("-widen.md"))
}

function initialPlanningPhase(commit: SeriesCommit): "widening" | "detailing" {
  const stem = planForm(commit.subject)?.stem
  return commit.files.some(
    (file) => file.split("/").at(-1) === `${stem}-widen.md`,
  )
    ? "widening"
    : "detailing"
}

/**
 * Events represented only by Git still invalidate older reads. Round-owned
 * audit commits are excluded because retained data dates them from the latest
 * landed record.
 */
function commitEvents(evidence: SeriesEvidence): ScopeEvent[] {
  let planningPhase: "widening" | "detailing" = "widening"
  const events: ScopeEvent[] = []
  for (const commit of evidence.commits) {
    const time = timestamp(commit.committed)
    const sha = shortSha(commit.sha)
    if (commit.ownStem && commit.role === "settle") {
      planningPhase = "detailing"
      events.push({ time, text: `the settle ${sha} landed` })
      continue
    }
    if (commit.ownStem && commit.role === "init") {
      planningPhase = initialPlanningPhase(commit)
      events.push({ time, text: `the init ${sha} landed` })
      continue
    }
    if (commit.ownStem && reopens(commit)) {
      planningPhase = "widening"
      events.push({ time, text: `the reopen ${sha} landed` })
      continue
    }
    const step = commit.ownStem
      ? commit.role?.match(/^impl-(\d+)$/)?.[1]
      : undefined
    if (step !== undefined) {
      events.push({ time, text: `step ${step} landed as ${sha}` })
      continue
    }
    const recorded = evidence.roundCommits.has(commit.sha)
    // Only a widening round's real bug stops at A; every other audit's B is one.
    const bTier =
      commit.role === "split-audit" ||
      commit.role?.startsWith("impl-audit-") === true ||
      planningPhase === "detailing"
    if (
      !recorded &&
      commit.ownStem &&
      isAuditRole(commit.role) &&
      (commit.acceptedTiers.includes("A") ||
        (bTier && commit.acceptedTiers.includes("B")))
    ) {
      events.push({
        time,
        text: `the audit ${sha} landed an accepted ${commit.acceptedTiers.includes("A") ? "A" : "B"}`,
      })
      continue
    }
    if (
      !recorded &&
      !isAuditRole(commit.role) &&
      commit.changesDocument &&
      evidence.document !== null
    )
      events.push({
        time,
        text:
          commit.role === "design"
            ? `the design ${sha} landed`
            : `the ${evidence.document} edit ${sha} landed`,
      })
  }
  return events
}

function currentRoundEntry(
  rounds: readonly RoundData[],
  current: CurrentRound,
): RoundData {
  const entry = rounds.find(
    (candidate) =>
      candidate.target === current.target && candidate.round === current.round,
  )
  if (entry === undefined)
    throw new Error(
      `Series data has no current round ${current.target} ${current.round}`,
    )
  return entry
}

function wideningEnding(entry: RoundData): "settle" | "stop" {
  if (!("phase" in entry) || entry.phase !== "widening") return "stop"
  const match = /^(settle|keep open)\. \S.*$/.exec(entry.settling)
  if (match === null)
    throw new Error("The current widening round has no parsed settling line")
  return match[1] === "settle" ? "settle" : "stop"
}

/** Whether a round launched its audit on this listed auditor's selection. */
function readBy(entry: RoundData, auditor: Auditor): boolean {
  const seat = entry.auditor.seat ?? entry.auditor
  return (
    entry.auditor.assistant === auditor.assistant &&
    seat.model === auditor.model &&
    seat.effort === auditor.effort
  )
}

/** The listed auditor's newest settled read of the target, current or stale. */
function lastReadBy(
  entries: readonly RoundData[],
  auditor: Auditor,
): RoundData | undefined {
  return entries
    .filter((entry) => readBy(entry, auditor))
    .toSorted(
      (first, second) => timestamp(second.started) - timestamp(first.started),
    )[0]
}

/**
 * Rule 3's choice among the listed auditors without a current read: the one that
 * read the scope least recently, with list order breaking a never-read tie.
 */
function leastRecentEntry(
  missing: readonly Auditor[],
  entries: readonly RoundData[],
): Auditor {
  const latest = (candidate: Auditor): number => {
    const read = lastReadBy(entries, candidate)
    return read === undefined ? -Infinity : timestamp(read.started)
  }
  const selected = missing.toSorted(
    (first, second) => latest(first) - latest(second),
  )[0]
  if (selected === undefined)
    throw new Error("The series rules found no listed auditor without a read")
  return selected
}

/**
 * Rule 3's reason names what the chosen auditor's read lacks: either the
 * auditor has no read of the target, or its last read started before the
 * newest event, which the reason names.
 */
function rule3Reason(
  answer: Auditor,
  entries: readonly RoundData[],
  latestEvent: ScopeEvent | undefined,
): string {
  const last = lastReadBy(entries, answer)
  if (last === undefined)
    return `Rule 3: ${auditorText(answer)} has no read of this scope yet.`
  if (latestEvent === undefined)
    throw new Error(
      `The series rules found no event after the read in round ${last.round}`,
    )
  return `Rule 3: ${auditorText(answer)} last read in round ${last.round}, before ${latestEvent.text}, so it reads again.`
}

/**
 * Rule 1 over one target: its settled reads, the newest event that changed the
 * scope and the listed auditors with no read that started after that event.
 */
function currentReads(
  evidence: SeriesEvidence,
  target: string,
  pool: readonly Auditor[],
  current?: CurrentRound,
): {
  readonly entries: readonly RoundData[]
  readonly missing: readonly Auditor[]
  readonly latestEvent: ScopeEvent | undefined
} {
  if (pool.length === 0)
    throw new Error("The automatic series auditor list is empty")
  // A real bug on any of the stem's targets is an event; reads belong to this one.
  const settledEntries = evidence.roundData.rounds.filter((entry) =>
    settled(entry, current),
  )
  const entries = settledEntries.filter((entry) => entry.target === target)
  const latestEvent = [
    ...commitEvents(evidence),
    ...settledEntries.flatMap((entry) => {
      const tier = realBugTier(entry)
      return tier === null ? [] : [realBugEvent(evidence, entry, tier, target)]
    }),
  ].toSorted((first, second) => second.time - first.time)[0]
  const reads = entries.filter(
    (entry) =>
      latestEvent === undefined || timestamp(entry.started) > latestEvent.time,
  )
  return {
    entries,
    missing: pool.filter(
      (auditor) => !reads.some((entry) => readBy(entry, auditor)),
    ),
    latestEvent,
  }
}

/**
 * Rule 3 at a series' opening. When the retained data holds a current read by
 * one listed auditor and none by another, the series continues where it stood
 * and opens on a listed auditor without one. With no current read at all, or
 * one for every listed auditor, the configured default opens instead, because the rules give
 * that round no reader and the user asked for one.
 */
export function openingAuditor(
  evidence: SeriesEvidence,
  target: string,
  pool: readonly Auditor[],
): { readonly answer: Auditor; readonly reason: string } | null {
  const { entries, missing, latestEvent } = currentReads(evidence, target, pool)
  if (missing.length === 0 || missing.length === pool.length) return null
  const answer = leastRecentEntry(missing, entries)
  return { answer, reason: rule3Reason(answer, entries, latestEvent) }
}

/**
 * Apply the three automatic-series rules. A read is current only when it
 * started after the newest event that changed its scope. Every listed auditor
 * must have one current read before the phase can end.
 */
export function decideSeries(
  evidence: SeriesEvidence,
  currentRound: CurrentRound,
  pool: readonly Auditor[],
): SeriesAnswer {
  const current = currentRoundEntry(evidence.roundData.rounds, currentRound)
  const { entries, missing, latestEvent } = currentReads(
    evidence,
    current.target,
    pool,
    currentRound,
  )
  if (missing.length === 0) {
    const answer = wideningEnding(current)
    if (answer === "settle")
      return {
        answer,
        reason:
          "Rule 2: every listed auditor has a current read, and the widening recommendation is settle.",
      }
    if ("phase" in current && current.phase === "widening")
      return {
        answer,
        reason: `Rule 2: every listed auditor has a current read; ${current.settling}`,
      }
    const readyOpen =
      "phase" in current &&
      current.phase === "detailing" &&
      !evidence.commits.some(
        (commit) => commit.ownStem && commit.role === "ready",
      )
    return {
      answer: readyOpen ? "ready" : "stop",
      reason: `Rule 2: every listed auditor has a current read; the ${readyOpen ? "detailing plan is ready" : "series stops"}.`,
    }
  }

  const answer = leastRecentEntry(missing, entries)
  return { answer, reason: rule3Reason(answer, entries, latestEvent) }
}

/** One listed auditor as terminal messages and retained answers spell it. */
export function auditorText(auditor: Auditor): string {
  return `${auditor.assistant} ${auditor.model} ${auditor.effort}`
}

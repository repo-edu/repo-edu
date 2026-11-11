import type { ExecutionContext } from "./context.js"
import { episodeMembers } from "./episode.js"
import { type LogCommit, readCommitTimes, readLog } from "./episode-log.js"
import { readFindings } from "./findings.js"
import {
  type CommitRoundData,
  type PlanRoundData,
  type RoundData,
  readCommitRoundData,
  readPlanRoundData,
  roundDataFilename,
  type SeriesAnswer,
} from "./round-data.js"
import type { Auditor } from "./settings.js"
import { looseForm, type Repository } from "./subject.js"
import type { RoundKind } from "./target.js"

export type SeriesCommit = {
  readonly repository: Repository
  readonly sha: string
  readonly committed: string
  readonly subject: string
  readonly role: string | null
  readonly files: readonly string[]
  readonly renames: readonly { readonly from: string; readonly to: string }[]
  readonly acceptedTiers: readonly ("A" | "B" | "C" | "D")[]
  readonly changesPlan: boolean
  readonly ownStem: boolean
}

export type SeriesEvidence = {
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
  readonly stem: string
  readonly roundKind: RoundKind
  readonly seriesKind: "plan" | "commit"
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
  readonly roundKind: RoundKind
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
          const form = looseForm(commit.subject)
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
            changesPlan:
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

async function readPlanSeriesEvidence(
  input: SeriesEvidenceInput,
): Promise<SeriesEvidence> {
  const [roundData, plan, repoEdu] = await Promise.all([
    readPlanRoundData(input.activeRoot, input.stem),
    readLog(input.planRoot),
    readLog(input.repoEduRoot),
  ])
  return planSeriesEvidence({
    stem: input.stem,
    roundKind: input.roundKind,
    roundData,
    logs: { plan, "repo-edu": repoEdu },
  })
}

async function readCommitSeriesEvidence(
  input: SeriesEvidenceInput,
): Promise<SeriesEvidence> {
  // A series opening on a fresh commit target has no file yet.
  let rounds: readonly CommitRoundData[] = []
  try {
    rounds = await readCommitRoundData(input, input.stem)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }
  return {
    roundData: {
      file: roundDataFilename(input.stem, "commit"),
      rounds,
    },
    roundCommits: new Set(),
    roundCommitTimes: await readRetainedRoundCommitTimes(input, rounds),
    commits: [],
  }
}

/** Read the retained round data and bounded commit facts used by the series rules. */
export async function readSeriesEvidence(
  input: SeriesEvidenceInput,
): Promise<SeriesEvidence> {
  return input.seriesKind === "commit"
    ? readCommitSeriesEvidence(input)
    : readPlanSeriesEvidence(input)
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

/** Whether this round found a real bug under its phase's settled threshold. */
function foundRealBug(entry: RoundData): boolean {
  const tiers =
    "phase" in entry && entry.phase === "widening"
      ? (["A"] as const)
      : (["A", "B"] as const)
  return entry.findings.some(
    (finding) =>
      (finding.outcome === "kept" || finding.outcome === "unmatched") &&
      (tiers as readonly string[]).includes(finding.finalTier ?? finding.tier),
  )
}

function realBugEventTime(evidence: SeriesEvidence, entry: RoundData): number {
  const times = entry.commits.flatMap((commit) => {
    const time = evidence.roundCommitTimes.get(
      roundCommitKey(commit.repository, commit.sha),
    )
    return time === undefined ? [] : [time]
  })
  if (times.length === 0)
    throw new Error(
      `Real-bug round ${entry.target} ${entry.round} has no landed commit time`,
    )
  return Math.max(...times)
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
    role?.startsWith("impl-audit-") === true
  )
}

function reopens(commit: SeriesCommit): boolean {
  return commit.renames.some(({ to }) => to.endsWith("-widen.md"))
}

function initialPlanningPhase(commit: SeriesCommit): "widening" | "detailing" {
  const stem = looseForm(commit.subject)?.stem
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
function commitEvents(evidence: SeriesEvidence): number[] {
  let planningPhase: "widening" | "detailing" = "widening"
  const events: number[] = []
  for (const commit of evidence.commits) {
    const time = timestamp(commit.committed)
    if (commit.ownStem && commit.role === "settle") {
      planningPhase = "detailing"
      events.push(time)
      continue
    }
    if (commit.ownStem && commit.role === "init") {
      planningPhase = initialPlanningPhase(commit)
      events.push(time)
      continue
    }
    if (commit.ownStem && reopens(commit)) {
      planningPhase = "widening"
      events.push(time)
      continue
    }
    if (
      commit.ownStem &&
      commit.role !== null &&
      /^impl-\d+$/.test(commit.role)
    ) {
      events.push(time)
      continue
    }
    const recorded = evidence.roundCommits.has(commit.sha)
    if (
      !recorded &&
      commit.ownStem &&
      isAuditRole(commit.role) &&
      (commit.acceptedTiers.includes("A") ||
        (planningPhase === "detailing" && commit.acceptedTiers.includes("B")) ||
        (commit.role?.startsWith("impl-audit-") === true &&
          commit.acceptedTiers.includes("B")))
    ) {
      events.push(time)
      continue
    }
    if (!recorded && !isAuditRole(commit.role) && commit.changesPlan)
      events.push(time)
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

/** Whether a round launched its audit on this pool entry. */
function readBy(entry: RoundData, auditor: Auditor): boolean {
  const seat = entry.auditor.seat ?? entry.auditor
  return (
    entry.auditor.assistant === auditor.assistant &&
    seat.model === auditor.model &&
    seat.effort === auditor.effort
  )
}

/**
 * Rule 3's choice among the pool entries without a current read: the one that
 * read the scope least recently, with list order breaking a never-read tie.
 */
function leastRecentEntry(
  missing: readonly Auditor[],
  entries: readonly RoundData[],
): Auditor {
  const latest = (candidate: Auditor): number =>
    Math.max(
      -Infinity,
      ...entries
        .filter((entry) => readBy(entry, candidate))
        .map((entry) => timestamp(entry.started)),
    )
  const selected = missing.toSorted(
    (first, second) => latest(first) - latest(second),
  )[0]
  if (selected === undefined)
    throw new Error("The series rules found no pool entry without a read")
  return selected
}

/**
 * Rule 1 over one target: its settled reads and the pool entries with no
 * read that started after the newest event that changed the scope.
 */
function currentReads(
  evidence: SeriesEvidence,
  target: string,
  pool: readonly Auditor[],
  current?: CurrentRound,
): {
  readonly entries: readonly RoundData[]
  readonly missing: readonly Auditor[]
} {
  if (pool.length === 0) throw new Error("The automatic series pool is empty")
  // A real bug on any of the stem's targets is an event; reads belong to this one.
  const settledEntries = evidence.roundData.rounds.filter((entry) =>
    settled(entry, current),
  )
  const entries = settledEntries.filter((entry) => entry.target === target)
  const eventTimes = [
    ...commitEvents(evidence),
    ...settledEntries
      .filter(foundRealBug)
      .map((entry) => realBugEventTime(evidence, entry)),
  ]
  const latestEvent = Math.max(-Infinity, ...eventTimes)
  const reads = entries.filter(
    (entry) => timestamp(entry.started) > latestEvent,
  )
  return {
    entries,
    missing: pool.filter(
      (auditor) => !reads.some((entry) => readBy(entry, auditor)),
    ),
  }
}

/**
 * Rule 3 at a series' opening. When the retained data holds a current read by
 * one pool entry and none by another, the series continues where it stood and
 * opens on an entry without one. With no current read at all, or one for
 * every entry, the configured default opens instead, because the rules give
 * that round no reader and the user asked for one.
 */
export function openingAuditor(
  evidence: SeriesEvidence,
  target: string,
  pool: readonly Auditor[],
): { readonly answer: Auditor; readonly reason: string } | null {
  const { entries, missing } = currentReads(evidence, target, pool)
  if (missing.length === 0 || missing.length === pool.length) return null
  const answer = leastRecentEntry(missing, entries)
  return {
    answer,
    reason: `Rule 3: ${auditorText(answer)} has no current read.`,
  }
}

/**
 * Apply the three automatic-series rules. A read is current only when it
 * started after the newest event that changed its scope. Every pool entry
 * must have one current read before the phase can end.
 */
export function decideSeries(
  evidence: SeriesEvidence,
  currentRound: CurrentRound,
  pool: readonly Auditor[],
): SeriesAnswer {
  const current = currentRoundEntry(evidence.roundData.rounds, currentRound)
  const { entries, missing } = currentReads(
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
          "Rule 2: every pool entry has a current read, and the widening recommendation is settle.",
      }
    if ("phase" in current && current.phase === "widening")
      return {
        answer,
        reason: `Rule 2: every pool entry has a current read; ${current.settling}`,
      }
    const readyOpen =
      "phase" in current &&
      current.phase === "detailing" &&
      !evidence.commits.some(
        (commit) => commit.ownStem && commit.role === "ready",
      )
    return {
      answer: readyOpen ? "ready" : "stop",
      reason: `Rule 2: every pool entry has a current read; the ${readyOpen ? "detailing plan is ready" : "series stops"}.`,
    }
  }

  const answer = leastRecentEntry(missing, entries)
  return {
    answer,
    reason: `Rule 3: ${auditorText(answer)} has no current read${readBy(current, answer) ? "" : " and did not audit this round"}.`,
  }
}

/** One series-pool entry as terminal messages and retained answers spell it. */
export function auditorText(auditor: Auditor): string {
  return `${auditor.assistant} ${auditor.model} ${auditor.effort}`
}

import type { ExecutionContext } from "./context.js"
import { episodeMembers } from "./episode.js"
import { type LogCommit, readLog } from "./episode-log.js"
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
    commits,
  }
}

async function readPlanSeriesEvidence(
  input: SeriesEvidenceInput,
): Promise<SeriesEvidence> {
  const [roundData, plan, repoEdu] = await Promise.all([
    readPlanRoundData(input, input.stem),
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
 * audit commits are excluded because their round start is the event's time.
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

function leastRecentEntry(
  assistant: Auditor["assistant"],
  pool: readonly Auditor[],
  entries: readonly RoundData[],
): Auditor {
  const candidates = pool.filter((entry) => entry.assistant === assistant)
  const latest = (candidate: Auditor): number =>
    Math.max(
      -Infinity,
      ...entries
        .filter(
          (entry) =>
            entry.auditor.assistant === candidate.assistant &&
            entry.auditor.model === candidate.model &&
            entry.auditor.effort === candidate.effort,
        )
        .map((entry) => timestamp(entry.started)),
    )
  const selected = candidates.toSorted(
    (first, second) => latest(first) - latest(second),
  )[0]
  if (selected === undefined)
    throw new Error(`The series pool has no ${assistant} entry`)
  return selected
}

/**
 * Rule 1 over one target: its settled reads and, per pool assistant, whether
 * one of them started after the newest event that changed the scope.
 */
function currentReads(
  evidence: SeriesEvidence,
  target: string,
  pool: readonly Auditor[],
  current?: CurrentRound,
): {
  readonly entries: readonly RoundData[]
  readonly assistants: readonly Auditor["assistant"][]
  readonly missing: readonly Auditor["assistant"][]
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
      .map((entry) => timestamp(entry.started)),
  ]
  const latestEvent = Math.max(-Infinity, ...eventTimes)
  const assistants = [...new Set(pool.map((entry) => entry.assistant))]
  const read = new Set(
    entries
      .filter((entry) => timestamp(entry.started) > latestEvent)
      .map((entry) => entry.auditor.assistant),
  )
  return {
    entries,
    assistants,
    missing: assistants.filter((assistant) => !read.has(assistant)),
  }
}

/**
 * Rule 3 at a series' opening. When the retained data holds a current read by
 * one pool assistant and none by another, the series continues where it
 * stood and opens on an assistant without one. With no current read at all,
 * or one for every assistant, the configured default opens instead, because
 * the rules give that round no reader and the user asked for one.
 */
export function openingAuditor(
  evidence: SeriesEvidence,
  target: string,
  pool: readonly Auditor[],
): { readonly answer: Auditor; readonly reason: string } | null {
  const { entries, assistants, missing } = currentReads(evidence, target, pool)
  if (missing.length === 0 || missing.length === assistants.length) return null
  const nextAssistant = missing[0]
  return {
    answer: leastRecentEntry(nextAssistant, pool, entries),
    reason: `Rule 3: ${nextAssistant} has no current read.`,
  }
}

/**
 * Apply the three automatic-series rules. A read is current only when it
 * started after the newest event that changed its scope. Every represented
 * assistant must have one current read before the phase can end.
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
          "Rule 2: every assistant in the pool has a current read, and the widening recommendation is settle.",
      }
    if ("phase" in current && current.phase === "widening")
      return {
        answer,
        reason: `Rule 2: every assistant in the pool has a current read; ${current.settling}`,
      }
    const readyOpen =
      "phase" in current &&
      current.phase === "detailing" &&
      !evidence.commits.some(
        (commit) => commit.ownStem && commit.role === "ready",
      )
    return {
      answer: readyOpen ? "ready" : "stop",
      reason: `Rule 2: every assistant in the pool has a current read; the ${readyOpen ? "detailing plan is ready" : "series stops"}.`,
    }
  }

  const nextAssistant =
    missing.find((assistant) => assistant !== current.auditor.assistant) ??
    missing[0]
  if (nextAssistant === undefined)
    throw new Error("The series rules found no next assistant")
  const answer = leastRecentEntry(nextAssistant, pool, entries)
  return {
    answer,
    reason: `Rule 3: ${nextAssistant} has no current read${nextAssistant === current.auditor.assistant ? "" : " and did not audit this round"}.`,
  }
}

/** One series-pool entry as terminal messages and retained answers spell it. */
export function auditorText(auditor: Auditor): string {
  return `${auditor.assistant} ${auditor.model} ${auditor.effort}`
}

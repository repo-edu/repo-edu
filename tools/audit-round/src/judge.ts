import type { ExecutionContext } from "./context.js"
import { episodeMembers } from "./episode.js"
import { readCommitEvidence, readLog } from "./episode-log.js"
import { readFindings } from "./findings.js"
import {
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

async function readPlanSeriesEvidence(
  input: SeriesEvidenceInput,
): Promise<SeriesEvidence> {
  const [roundData, planLog, repoEduLog] = await Promise.all([
    readPlanRoundData(input, input.stem),
    readLog(input.planRoot),
    readLog(input.repoEduRoot),
  ])
  const allRounds = [
    ...(roundData.planning ?? []),
    ...(roundData.implementation ?? []),
  ]
  const commits = (
    [
      ["plan", planLog],
      ["repo-edu", repoEduLog],
    ] as const
  )
    .flatMap(([repository, log]) =>
      episodeMembers(log, repository, input.stem)
        .members.toReversed()
        .map((commit): SeriesCommit => {
          const role = looseForm(commit.subject)?.role ?? null
          return {
            repository,
            sha: commit.sha,
            committed: new Date(commit.committedAt).toISOString(),
            subject: commit.subject,
            role,
            files: commit.files,
            renames: commit.renames,
            acceptedTiers: acceptedTiers(commit.body, repository, role),
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
      rounds: roundData[input.roundKind] ?? [],
    },
    roundCommits: new Set(
      allRounds.flatMap((round) => round.commits.map((commit) => commit.sha)),
    ),
    commits,
  }
}

async function readCommitSeriesEvidence(
  input: SeriesEvidenceInput,
): Promise<SeriesEvidence> {
  const rounds = await readCommitRoundData(input, input.stem)
  const ordered = rounds.toSorted((first, second) => first.round - second.round)
  if (ordered.length === 0)
    throw new Error(`Commit series ${input.stem} has no round data`)

  const wanted = new Map<Repository, string[]>()
  const add = (repository: Repository, sha: string) => {
    const commits = wanted.get(repository) ?? []
    if (!commits.includes(sha)) commits.push(sha)
    wanted.set(repository, commits)
  }
  for (const entry of ordered)
    for (const group of entry.originalGroups)
      for (const sha of group.commits) add(group.repository, sha)
  for (const entry of ordered)
    for (const commit of entry.commits) add(commit.repository, commit.sha)

  const commits = (
    await Promise.all(
      (["repo-edu", "plan"] as const).flatMap((repository) => {
        const shas = wanted.get(repository)
        if (shas === undefined) return []
        const cwd =
          repository === "repo-edu" ? input.repoEduRoot : input.planRoot
        return [
          readCommitEvidence(cwd, shas).then((commits) =>
            commits.map((commit): SeriesCommit => {
              const role = looseForm(commit.subject)?.role ?? null
              return {
                repository,
                sha: commit.sha,
                committed: new Date(commit.committedAt).toISOString(),
                subject: commit.subject,
                role,
                files: [],
                renames: [],
                acceptedTiers: acceptedTiers(commit.body, repository, role),
              }
            }),
          ),
        ]
      }),
    )
  ).flat()

  return {
    roundData: {
      file: roundDataFilename(input.stem, "commit"),
      rounds,
    },
    roundCommits: new Set(
      ordered.flatMap((round) => round.commits.map((commit) => commit.sha)),
    ),
    commits,
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

function settled(entry: RoundData, current: CurrentRound): boolean {
  const currentInProgress =
    entry.status === "in-progress" &&
    entry.target === current.target &&
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

/**
 * Events represented only by Git still invalidate older reads. Round-owned
 * audit commits are excluded because their round start is the event's time.
 */
function commitEvents(evidence: SeriesEvidence): number[] {
  let planningPhase: "widening" | "detailing" = "widening"
  const events: number[] = []
  for (const commit of evidence.commits) {
    const time = timestamp(commit.committed)
    if (commit.role === "settle") {
      planningPhase = "detailing"
      events.push(time)
      continue
    }
    if (commit.role === "init" || reopens(commit)) {
      planningPhase = "widening"
      events.push(time)
      continue
    }
    if (commit.role !== null && /^impl-\d+$/.test(commit.role)) {
      events.push(time)
      continue
    }
    const recorded = evidence.roundCommits.has(commit.sha)
    if (
      !recorded &&
      isAuditRole(commit.role) &&
      (commit.acceptedTiers.includes("A") ||
        (planningPhase === "detailing" && commit.acceptedTiers.includes("B")) ||
        (commit.role?.startsWith("impl-audit-") === true &&
          commit.acceptedTiers.includes("B")))
    ) {
      events.push(time)
      continue
    }
    if (
      !recorded &&
      !isAuditRole(commit.role) &&
      commit.repository === "plan" &&
      commit.files.length > 0
    )
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
 * Apply the three automatic-series rules. A read is current only when it
 * started after the newest event that changed its scope. Every represented
 * assistant must have one current read before the phase can end.
 */
export function decideSeries(
  evidence: SeriesEvidence,
  currentRound: CurrentRound,
  pool: readonly Auditor[],
): SeriesAnswer {
  if (pool.length === 0) throw new Error("The automatic series pool is empty")
  const current = currentRoundEntry(evidence.roundData.rounds, currentRound)
  const entries = evidence.roundData.rounds.filter(
    (entry) => entry.target === current.target && settled(entry, currentRound),
  )
  const eventTimes = [
    ...commitEvents(evidence),
    ...entries.filter(foundRealBug).map((entry) => timestamp(entry.started)),
  ]
  const latestEvent = Math.max(-Infinity, ...eventTimes)
  const assistants = [...new Set(pool.map((entry) => entry.assistant))]
  const latestCurrentRead = new Map<Auditor["assistant"], RoundData>()
  for (const entry of entries)
    if (
      assistants.includes(entry.auditor.assistant) &&
      timestamp(entry.started) > latestEvent
    ) {
      const earlier = latestCurrentRead.get(entry.auditor.assistant)
      if (
        earlier === undefined ||
        timestamp(entry.started) > timestamp(earlier.started)
      )
        latestCurrentRead.set(entry.auditor.assistant, entry)
    }

  const missing = assistants.filter(
    (assistant) => !latestCurrentRead.has(assistant),
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
      !evidence.commits.some((commit) => commit.role === "ready")
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

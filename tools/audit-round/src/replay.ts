import { dirname } from "node:path"
import type { ExecutionContext } from "./context.js"
import { readLog } from "./episode-log.js"
import {
  auditorText,
  decideSeries,
  planSeriesEvidence,
  retainedRoundCommitTimes,
  type SeriesEvidence,
} from "./judge.js"
import {
  type RetainedPlanRoundData,
  type RoundData,
  readAllCommitRoundData,
  readAllPlanRoundData,
  type SeriesDecision,
} from "./round-data.js"
import type { Auditor } from "./settings.js"

const baselineBefore = "2026-11-08T18:53:13Z"
const legacyPool: readonly Auditor[] = [
  {
    assistant: "claude",
    model: "claude-opus-5-5",
    effort: "high",
  },
  { assistant: "codex", model: "gpt-5.6-sol", effort: "high" },
]
const legacySettledRounds = new Set([
  "audit-range-series-plan/4",
  "open-deferrals-plan/1",
  "two-repo-commit-audits-plan/2",
  "watch-evidence-plan/2",
  "watch-evidence-plan/4",
  "watch-evidence-plan/5",
  "watch-evidence-plan/6",
  "watch-evidence-plan/7",
  "watch-evidence-plan/8",
  "watch-evidence-plan/9",
  "watch-evidence-plan/10",
  "watch-evidence-plan/12",
])

export type ReplayRow = {
  readonly stem: string
  readonly target: string
  readonly round: number
  readonly phase: "widening" | "detailing" | "implementation" | "commit"
  readonly started: string
  readonly computed: SeriesDecision
  readonly stored: SeriesDecision
  readonly nextFindings: string
  readonly matches: boolean
}

function retainedFile(
  files: readonly RetainedPlanRoundData[],
  kind: "planning",
): Extract<RetainedPlanRoundData, { readonly kind: "planning" }> | undefined
function retainedFile(
  files: readonly RetainedPlanRoundData[],
  kind: "implementation",
):
  | Extract<RetainedPlanRoundData, { readonly kind: "implementation" }>
  | undefined
function retainedFile(
  files: readonly RetainedPlanRoundData[],
  kind: RetainedPlanRoundData["kind"],
): RetainedPlanRoundData | undefined {
  const matches = files.filter((file) => file.kind === kind)
  if (matches.length > 1)
    throw new Error(
      `More than one ${kind} round data file exists in ${dirname(matches[0]?.file ?? "")}`,
    )
  return matches[0]
}

function planEpisodes(
  files: readonly RetainedPlanRoundData[],
): readonly (readonly RetainedPlanRoundData[])[] {
  const episodes = new Map<string, RetainedPlanRoundData[]>()
  for (const file of files) {
    const key = `${dirname(file.file)}\0${file.stem}`
    const episode = episodes.get(key)
    if (episode === undefined) episodes.set(key, [file])
    else episode.push(file)
  }
  return [...episodes.values()].toSorted(
    (first, second) => first[0]?.file.localeCompare(second[0]?.file ?? "") ?? 0,
  )
}

function timestamp(value: string): number {
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed))
    throw new Error(`Invalid replay timestamp: ${value}`)
  return parsed
}

/** The legacy judge started after the earlier recorded phase durations. */
function decisionTime(entry: RoundData): number {
  const judgeAt = entry.phases.findIndex((phase) => phase.phase === "judge")
  const earlier = judgeAt === -1 ? entry.phases : entry.phases.slice(0, judgeAt)
  return (
    timestamp(entry.started) +
    earlier.reduce((total, phase) => total + phase.milliseconds, 0)
  )
}

function replayCurrent(entry: RoundData): RoundData {
  if (!("phase" in entry) || entry.phase !== "widening")
    return { ...entry, status: "in-progress" }
  if (/^(settle|keep open)\. \S.*$/.test(entry.settling))
    return { ...entry, status: "in-progress" }
  const key = `${entry.target}/${entry.round}`
  if (!legacySettledRounds.has(key))
    throw new Error(`No replay reading exists for legacy settling value ${key}`)
  return {
    ...entry,
    status: "in-progress",
    settling: "settle. The completed legacy round left no shape question open.",
  }
}

function historicalEvidence(
  evidence: SeriesEvidence,
  entry: RoundData,
): SeriesEvidence {
  const current = replayCurrent(entry)
  const currentCommits = new Set(entry.commits.map((commit) => commit.sha))
  const before = decisionTime(entry)
  return {
    roundData: {
      file: evidence.roundData.file,
      rounds: evidence.roundData.rounds
        .filter(
          (candidate) =>
            timestamp(candidate.started) <= timestamp(entry.started),
        )
        .map((candidate) =>
          candidate.target === entry.target && candidate.round === entry.round
            ? current
            : candidate,
        ),
    },
    roundCommits: evidence.roundCommits,
    roundCommitTimes: evidence.roundCommitTimes,
    commits: evidence.commits.filter(
      (commit) =>
        timestamp(commit.committed) <= before || currentCommits.has(commit.sha),
    ),
  }
}

/**
 * An answer without a stored pool ran when its rules counted reads per
 * assistant and its auditors rotated across models, so each round reads as its
 * assistant's legacy pool entry.
 */
function legacyReads(evidence: SeriesEvidence): SeriesEvidence {
  return {
    ...evidence,
    roundData: {
      ...evidence.roundData,
      rounds: evidence.roundData.rounds.map((round) => {
        const entry = legacyPool.find(
          (auditor) => auditor.assistant === round.auditor.assistant,
        )
        return entry === undefined
          ? round
          : {
              ...round,
              auditor: {
                ...round.auditor,
                seat: { model: entry.model, effort: entry.effort },
              },
            }
      }),
    },
  }
}

export function replayAnswersMatch(
  computed: SeriesDecision,
  stored: SeriesDecision,
  hasStoredPool: boolean,
): boolean {
  if (typeof computed === "string" || typeof stored === "string")
    return computed === stored
  return hasStoredPool
    ? computed.assistant === stored.assistant &&
        computed.model === stored.model &&
        computed.effort === stored.effort
    : computed.assistant === stored.assistant
}

function findings(entry: RoundData | undefined): string {
  if (entry === undefined) return "no next round"
  const counts = new Map<string, number>()
  for (const finding of entry.findings)
    if (finding.outcome === "kept" || finding.outcome === "unmatched") {
      const tier = finding.finalTier ?? finding.tier
      counts.set(tier, (counts.get(tier) ?? 0) + 1)
    }
  const text = ["A", "B", "C", "D"]
    .flatMap((tier) => {
      const count = counts.get(tier)
      return count === undefined ? [] : [`${tier}${count}`]
    })
    .join("")
  return text || "none"
}

function answerText(answer: SeriesDecision): string {
  return typeof answer === "string" ? answer : auditorText(answer)
}

function phase(entry: RoundData): ReplayRow["phase"] {
  if ("originalGroups" in entry) return "commit"
  return "phase" in entry ? entry.phase : "implementation"
}

function appendRows(
  rows: ReplayRow[],
  stem: string,
  entries: readonly RoundData[],
  evidence: SeriesEvidence,
): void {
  const answered = entries.filter((entry) => entry.judge !== null)
  for (const entry of answered) {
    const historical = historicalEvidence(evidence, entry)
    const computed = decideSeries(
      entry.pool === undefined ? legacyReads(historical) : historical,
      { target: entry.target, round: entry.round },
      entry.pool ?? legacyPool,
    ).answer
    const stored = entry.judge?.answer
    if (stored === undefined) continue
    const next = entries
      .filter(
        (candidate) =>
          candidate.target === entry.target &&
          timestamp(candidate.started) > timestamp(entry.started),
      )
      .toSorted(
        (first, second) => timestamp(first.started) - timestamp(second.started),
      )[0]
    rows.push({
      stem,
      target: entry.target,
      round: entry.round,
      phase: phase(entry),
      started: entry.started,
      computed,
      stored,
      nextFindings: findings(next),
      matches: replayAnswersMatch(computed, stored, entry.pool !== undefined),
    })
  }
}

/** Replay every retained automatic-series answer against the current fixed rules. */
export async function replayRows(
  roots: ExecutionContext,
): Promise<readonly ReplayRow[]> {
  const [files, commitFiles, plan, repoEdu] = await Promise.all([
    readAllPlanRoundData(roots),
    readAllCommitRoundData(roots),
    readLog(roots.planRoot),
    readLog(roots.repoEduRoot),
  ])
  const rows: ReplayRow[] = []
  for (const episode of planEpisodes(files)) {
    const stem = episode[0]?.stem
    if (stem === undefined) continue
    const planning = retainedFile(episode, "planning")
    const implementation = retainedFile(episode, "implementation")
    const roundData = {
      ...(planning === undefined ? {} : { planning: planning.rounds }),
      ...(implementation === undefined
        ? {}
        : { implementation: implementation.rounds }),
    }
    for (const file of [planning, implementation]) {
      if (file === undefined) continue
      const evidence = planSeriesEvidence({
        stem,
        roundKind: file.kind,
        roundData,
        logs: { plan, "repo-edu": repoEdu },
      })
      appendRows(rows, stem, file.rounds, evidence)
    }
  }
  for (const file of commitFiles)
    appendRows(rows, file.label, file.rounds, {
      roundData: { file: file.file, rounds: file.rounds },
      roundCommits: new Set(),
      roundCommitTimes: retainedRoundCommitTimes(file.rounds, {
        plan,
        "repo-edu": repoEdu,
      }),
      commits: [],
    })
  return rows.toSorted(
    (first, second) =>
      timestamp(first.started) - timestamp(second.started) ||
      first.target.localeCompare(second.target) ||
      first.round - second.round,
  )
}

function totals(rows: readonly ReplayRow[], includeCommit: boolean): string[] {
  const phases: readonly (ReplayRow["phase"] | "all")[] = [
    "widening",
    "detailing",
    "implementation",
    ...(includeCommit ? (["commit"] as const) : []),
    "all",
  ]
  return phases.map((phase) => {
    const selected =
      phase === "all" ? rows : rows.filter((row) => row.phase === phase)
    const matches = selected.filter((row) => row.matches).length
    return `| ${phase} | ${selected.length} | ${matches} | ${selected.length - matches} |`
  })
}

function inFixedCorpus(row: ReplayRow): boolean {
  return (
    row.phase !== "commit" && timestamp(row.started) < timestamp(baselineBefore)
  )
}

function cell(value: string): string {
  return value.replaceAll("|", "\\|")
}

/** Format the complete ordinary replay and the fixed published corpus. */
export function formatReplay(rows: readonly ReplayRow[]): string {
  const fixed = rows.filter(inFixedCorpus)
  return [
    "# Automatic-series replay",
    "",
    "| Target | Round | Phase | Corpus | Rules | Stored | Next findings | Result |",
    "| --- | ---: | --- | --- | --- | --- | --- | --- |",
    ...rows.map(
      (row) =>
        `| ${cell(row.target)} | ${row.round} | ${row.phase} | ${inFixedCorpus(row) ? "fixed" : "ordinary only"} | ${cell(answerText(row.computed))} | ${cell(answerText(row.stored))} | ${row.nextFindings} | ${row.matches ? "match" : "difference"} |`,
    ),
    "",
    "## Ordinary totals",
    "",
    "| Phase | Answers | Matches | Differences |",
    "| --- | ---: | ---: | ---: |",
    ...totals(rows, true),
    "",
    `## Fixed corpus before ${baselineBefore}`,
    "",
    "| Phase | Answers | Matches | Differences |",
    "| --- | ---: | ---: | ---: |",
    ...totals(fixed, false),
  ].join("\n")
}

export async function replayReport(roots: ExecutionContext): Promise<string> {
  return formatReplay(await replayRows(roots))
}

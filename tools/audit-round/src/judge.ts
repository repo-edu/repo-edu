import { readFile } from "node:fs/promises"
import { basename } from "node:path"
import type { ExecutionContext } from "./context.js"
import { episodeMembers } from "./episode.js"
import { readLog } from "./episode-log.js"
import {
  type JudgeAnswer,
  type RoundData,
  readPlanRoundData,
} from "./round-data.js"
import { newestWatch } from "./round-paths.js"
import { looseForm, type Repository } from "./subject.js"
import type { RoundKind } from "./target.js"

export type JudgeCommit = {
  readonly repository: Repository
  readonly sha: string
  readonly committed: string
  readonly subject: string
  readonly role: string | null
}

export type JudgeEvidence = {
  readonly roundData: {
    readonly file: string
    readonly rounds: readonly RoundData[]
  }
  readonly commits: readonly JudgeCommit[]
  readonly latestWatch: {
    readonly file: string
    readonly text: string
  } | null
}

export type JudgeEvidenceInput = ExecutionContext & {
  readonly stem: string
  readonly roundKind: RoundKind
}

/** Read the judge's bounded four inputs without watch-only derived facts. */
export async function readJudgeEvidence(
  input: JudgeEvidenceInput,
): Promise<JudgeEvidence> {
  const [roundData, planLog, repoEduLog, watch] = await Promise.all([
    readPlanRoundData(input.planRoot, input.stem),
    readLog(input.planRoot),
    readLog(input.repoEduRoot),
    newestWatch(input.planRoot, input.stem),
  ])
  const kind = input.roundKind === "planning" ? "planning" : "implementation"
  const commits = (
    [
      ["plan", planLog],
      ["repo-edu", repoEduLog],
    ] as const
  )
    .flatMap(([repository, log]) =>
      episodeMembers(log, repository, input.stem)
        .members.toReversed()
        .map((commit) => ({
          repository,
          sha: commit.sha,
          committed: new Date(commit.committedAt * 1000).toISOString(),
          subject: commit.subject,
          role: looseForm(commit.subject)?.role ?? null,
        })),
    )
    .sort(
      (first, second) =>
        Date.parse(first.committed) - Date.parse(second.committed),
    )
  return {
    roundData: {
      file: `${input.stem}-${kind === "planning" ? "plan" : "impl"}-rounds.json`,
      rounds: roundData[kind] ?? [],
    },
    commits,
    latestWatch:
      watch === undefined
        ? null
        : { file: basename(watch), text: await readFile(watch, "utf8") },
  }
}

type CurrentRound = Pick<RoundData, "target" | "round">

function settled(entry: RoundData, current: CurrentRound): boolean {
  return (
    (entry.status === "finished" ||
      entry.status === "failed" ||
      entry.status === "interrupted" ||
      (entry.status === "in-progress" &&
        entry.target === current.target &&
        entry.round === current.round)) &&
    entry.commits.length > 0 &&
    entry.findings.every((finding) => finding.outcome !== null)
  )
}

function acceptedRealBug(entry: RoundData): boolean {
  return entry.findings.some(
    (finding) =>
      finding.outcome === "kept" &&
      ["A", "B"].includes(finding.finalTier ?? finding.tier),
  )
}

/**
 * Stop is available only when each assistant's latest settled read of this
 * scope in the current span has no accepted A or B finding.
 */
export function judgeCanStop(
  evidence: JudgeEvidence,
  currentRound: CurrentRound,
): boolean {
  let entries = evidence.roundData.rounds.filter(
    (entry) =>
      entry.target === currentRound.target && settled(entry, currentRound),
  )
  const current = entries
    .toSorted(
      (first, second) =>
        Date.parse(first.started) - Date.parse(second.started) ||
        first.round - second.round,
    )
    .at(-1)
  if (
    current !== undefined &&
    "phase" in current &&
    current.phase === "detailing"
  ) {
    const planCommits = evidence.commits.filter(
      (commit) => commit.repository === "plan",
    )
    const cutoff =
      planCommits.findLast((commit) => commit.role === "settle") ??
      planCommits.findLast((commit) => commit.role === "init")
    if (cutoff !== undefined) {
      const cutoffTime = Date.parse(cutoff.committed)
      entries = entries.filter(
        (entry) => Date.parse(entry.started) >= cutoffTime,
      )
    }
  }
  const latest = new Map<RoundData["auditor"]["assistant"], RoundData>()
  for (const entry of entries.toSorted(
    (first, second) =>
      Date.parse(first.started) - Date.parse(second.started) ||
      first.round - second.round,
  ))
    latest.set(entry.auditor.assistant, entry)
  return ![...latest.values()].some(acceptedRealBug)
}

/** Read the judge's single content line after the phase-result suffix is removed. */
export function readJudgeAnswer(source: string, canStop: boolean): JudgeAnswer {
  const lines = source.trim().split(/\r?\n/)
  const match =
    lines.length === 1
      ? /^Judge: (stop|continue with Claude|continue with Codex)\. (\S.*)$/.exec(
          lines[0],
        )
      : null
  if (match === null)
    throw new Error(
      "Judge answer must contain exactly one plain Judge line and a reason",
    )
  const answer =
    match[1] === "stop"
      ? "stop"
      : match[1] === "continue with Claude"
        ? "claude"
        : "codex"
  if (!canStop && answer === "stop")
    throw new Error(
      "Judge answered stop while the runner offered only Claude or Codex",
    )
  return { answer, reason: match[2] }
}

export function formatJudgeAnswer(answer: JudgeAnswer): string {
  const decision =
    answer.answer === "stop"
      ? "stop"
      : `continue with ${answer.answer === "claude" ? "Claude" : "Codex"}`
  return `Judge: ${decision}. ${answer.reason}`
}

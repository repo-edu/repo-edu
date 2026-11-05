import { readFile } from "node:fs/promises"
import { basename } from "node:path"
import type { ExecutionContext } from "./context.js"
import { episodeMembers } from "./episode.js"
import { readLog } from "./episode-log.js"
import {
  type JudgeAnswer,
  type JudgeDecision,
  type RoundData,
  readPlanRoundData,
  roundDataFilename,
} from "./round-data.js"
import { newestWatch } from "./round-paths.js"
import type { Auditor } from "./settings.js"
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
  const kind = input.roundKind
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
          committed: new Date(commit.committedAt).toISOString(),
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
      file: roundDataFilename(input.stem, kind),
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

/**
 * Whether the entry landed a finding at one of the gating tiers. Widening gates
 * on A alone: a widening B is a fixable issue inside the shape that the vet
 * checked and the fix landed, so the retained settling recommendation already
 * says whether a shape question remains. Detailing and implementation gate on A
 * and B, where B is a real bug the other assistant has not confirmed.
 */
function landedGatingFinding(
  entry: RoundData,
  tiers: readonly ("A" | "B")[],
): boolean {
  return entry.findings.some(
    (finding) =>
      (finding.outcome === "kept" || finding.outcome === "unmatched") &&
      (tiers as readonly string[]).includes(finding.finalTier ?? finding.tier),
  )
}

/**
 * The decisions the current series phase admits after applying the real-bug
 * gate, followed by every series-pool entry. Widening may end on settle or
 * stop; detailing before the ready marker on ready or stop; every other phase
 * on stop. The gate reads the latest settled read of each assistant the pool
 * can run: an assistant the series cannot send in again imposes nothing, so it
 * cannot hold an ending the series can never unlock.
 */
export function judgeOptions(
  evidence: JudgeEvidence,
  currentRound: CurrentRound,
  pool: readonly Auditor[],
): readonly JudgeDecision[] {
  let entries = evidence.roundData.rounds.filter(
    (entry) =>
      entry.target === currentRound.target && settled(entry, currentRound),
  )
  const current = entries.find(
    (entry) =>
      entry.target === currentRound.target &&
      entry.round === currentRound.round,
  )
  const planCommits = evidence.commits.filter(
    (commit) => commit.repository === "plan",
  )
  const detailing =
    current !== undefined && "phase" in current && current.phase === "detailing"
  if (detailing) {
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
  const represented = new Set(pool.map((auditor) => auditor.assistant))
  const latest = new Map<RoundData["auditor"]["assistant"], RoundData>()
  for (const entry of entries.toSorted(
    (first, second) => first.round - second.round,
  ))
    if (represented.has(entry.auditor.assistant))
      latest.set(entry.auditor.assistant, entry)
  const widening =
    current !== undefined && "phase" in current && current.phase === "widening"
  const gatingTiers = widening ? (["A"] as const) : (["A", "B"] as const)
  const canEnd = ![...latest.values()].some((entry) =>
    landedGatingFinding(entry, gatingTiers),
  )
  // A detailing round before the plan's ready marker may recommend that call
  // as a value. After the marker the planning round keeps stop alone.
  const readyOpen =
    detailing && !planCommits.some((commit) => commit.role === "ready")
  const endings: readonly JudgeDecision[] = widening
    ? [...(canEnd ? (["settle"] as const) : []), "stop"]
    : !canEnd
      ? []
      : readyOpen
        ? ["ready", "stop"]
        : ["stop"]
  return [...endings, ...pool]
}

/** One series-pool entry as the runner offers it and the judge names it back. */
export function auditorText(auditor: Auditor): string {
  return `${auditor.assistant} ${auditor.model} ${auditor.effort}`
}

function decisionText(decision: JudgeDecision): string {
  return typeof decision === "string" ? decision : auditorText(decision)
}

/** Read the judge's single content line after the phase-result suffix is removed. */
export function readJudgeAnswer(
  source: string,
  options: readonly JudgeDecision[],
): JudgeAnswer {
  const lines = source.trim().split(/\r?\n/)
  const match =
    lines.length === 1
      ? /^Judge: (settle|ready|stop|continue with (?:claude|codex) \S+ (?:low|medium|high|xhigh))\. (\S.*)$/.exec(
          lines[0],
        )
      : null
  if (match === null)
    throw new Error(
      "Judge answer must contain exactly one plain Judge line and a reason",
    )
  // An ending reads as itself and a continuation as the entry it names, so the
  // stored answer is the offered entry and the next round runs on that value.
  const named = match[1].replace(/^continue with /, "")
  const answer = options.find((option) => decisionText(option) === named)
  if (answer === undefined)
    throw new Error(
      `Judge answered ${named} while the runner offered only ${formatJudgeOptions(options)}`,
    )
  return { answer, reason: match[2] }
}

export function formatJudgeOptions(options: readonly JudgeDecision[]): string {
  const labels = options.map(decisionText)
  return labels.length < 2
    ? (labels[0] ?? "none")
    : `${labels.slice(0, -1).join(", ")} or ${labels.at(-1)}`
}

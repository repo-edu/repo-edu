import { type Area, computeEpisode, historyTopic } from "../episode.js"
import type { LogCommit } from "../episode-log.js"
import type {
  ImplementationRoundData,
  PlanningRoundData,
  PlanRoundData,
  RoundData,
  RoundFinding,
} from "../round-data.js"
import type { Repository } from "../subject.js"

export const areas: readonly Area[] = [
  ...["area-a", "area-b", "a", "b", "c", "d", "e", "tool-audit-round"].map(
    (id) => ({ id, kind: "partition" }),
  ),
  { id: "child-a", kind: "partition", splitFrom: "retired" },
  { id: "child-b", kind: "partition", splitFrom: "retired" },
  { id: "cover-x", kind: "cover" },
]

export const ratings =
  "[growth-pattern:none] [reach:developer] [complexity:none]"
export const bullet = (
  location = "area:area-a",
  tier = "C",
  tokens = ratings,
) => `- [${tier}] [${location}] ${tokens} Correct: the behaviour.`

export function commit(
  subject: string,
  body = "",
  files = ["src/a.ts"],
  renames: LogCommit["renames"] = [],
): Omit<LogCommit, "sha"> {
  return {
    subject,
    body,
    files,
    renames,
    committedAt: "1970-01-01T00:00:00+00:00",
  }
}

export const base = commit("example/impl-1 ath feat(x): step")
export const correction = (area = "area-a", severity = "c1", tier = "C") =>
  commit(
    `example/impl-audit-1-3 ath growth-none ${severity} fix(x): correction`,
    bullet(`area:${area}`, tier),
  )

export function history(...commits: Omit<LogCommit, "sha">[]): LogCommit[] {
  return [...commits, base].map((commit, at, all) => ({
    ...commit,
    sha: `c${String(all.length - at).padStart(6, "0")}`,
  }))
}

export const episode = (
  log: readonly LogCommit[],
  repository: Repository = "repo-edu",
  stem = historyTopic(log),
) => computeEpisode(log, repository, stem, areas)

const roundSettings: RoundData["settings"] = {
  audit: {
    claude: { model: "claude-opus-5", effort: "xhigh" },
    codex: { model: "gpt-6-astra", effort: "xhigh" },
  },
  vet: {
    claude: { model: "claude-opus-5", effort: "high" },
    codex: { model: "gpt-6.1-sol", effort: "high" },
  },
  fix: { assistant: "codex", model: "gpt-6.1-sol", effort: "high" },
}

function roundFinding(
  number: number,
  title: string,
  outcome: RoundFinding["outcome"],
  location: RoundFinding["location"],
): RoundFinding {
  return {
    number,
    title,
    tier: "B",
    reach: "developer",
    complexity: "none",
    growthPattern: "none",
    location,
    vetVerdict: outcome === null ? null : "accept",
    rebuttalAnswer: null,
    outcome,
    finalTier: null,
    finalReach: null,
  }
}

type CommonRoundData = Omit<ImplementationRoundData, "scope" | "judgedRepos">

function commonRound(
  target: string,
  round: number,
  status: RoundData["status"],
  sha: string,
  findings: RoundFinding[],
): CommonRoundData {
  return {
    target,
    round,
    tag: "oth",
    started: "2026-10-30T10:00:00.000Z",
    status,
    settings: roundSettings,
    auditor: {
      assistant: "codex",
      model: "gpt-6.1-sol",
      effort: "high",
      chosenBy: "settings",
    },
    phases: [
      {
        phase: "audit",
        assistant: "codex",
        model: "gpt-6.1-sol",
        effort: "high",
        milliseconds: 1_200,
        tokens: [
          {
            model: "gpt-6.1-sol",
            input: 1_000,
            cached: 500,
            output: 200,
          },
        ],
        peakContext: { tokens: 90_000, window: 100_000 },
        compactions: 1,
      },
      {
        phase: "fix",
        assistant: "codex",
        model: "gpt-6.1-sol",
        effort: "high",
        milliseconds: 800,
        tokens: [],
        peakContext: null,
        compactions: 0,
      },
    ],
    commits: [{ repository: "repo-edu", sha }],
    findings,
    judge: { answer: "stop", reason: "The fixture has converged." },
  }
}

/** Complete saved rounds whose watch view exercises both finding filters. */
export function watchRoundDataFixture(): PlanRoundData {
  const planning: PlanningRoundData = {
    ...commonRound("example-plan", 3, "finished", "a".repeat(40), [
      roundFinding(1, "Dropped finding", "dropped", {
        kind: "planning",
        field: "missing",
        section: "Decisions",
      }),
      roundFinding(2, "Kept finding", "kept", {
        kind: "planning",
        field: "excess",
        section: "Target state",
      }),
    ]),
    phase: "detailing",
    opening: "Complete report opening",
  }
  const implementation: ImplementationRoundData = {
    ...commonRound("example-impl-01..01", 4, "failed", "b".repeat(40), [
      roundFinding(1, "Unsettled finding", null, {
        kind: "repo-edu",
        area: "tool-audit-round",
        covers: [],
      }),
      roundFinding(2, "Dropped before failure", "dropped", {
        kind: "repo-edu",
        area: "tool-audit-round",
        covers: [],
      }),
    ]),
    scope: "1",
    judgedRepos: ["repo-edu"],
  }
  return { planning: [planning], implementation: [implementation] }
}

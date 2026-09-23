import { execa } from "execa"
import { loadAreaModel } from "../../architecture-check/src/area-model.js"
import { type ExecutionContext, installationRoot } from "./context.js"
import {
  checkFindingTotals,
  repeatedGrowth,
  runEvidence,
  tokenCounts,
  trajectory,
} from "./episode-facts.js"
import { type LogCommit, readLog } from "./episode-log.js"
import { type Finding, readFindings } from "./findings.js"
import {
  looseForm,
  parseSubject,
  type Repository,
  type Subject,
  stemTopic,
} from "./subject.js"

export type Area = {
  readonly id: string
  readonly kind: string
  readonly splitFrom?: string
}

export type EpisodeFinding = Finding & {
  readonly areas: readonly string[]
  readonly resolvedCovers: readonly string[]
  readonly unresolved: readonly string[]
}

export type EpisodeCommit = LogCommit & {
  readonly parsed: Subject | null
  readonly loose: ReturnType<typeof looseForm>
  readonly findings: readonly EpisodeFinding[]
  readonly unreadable: string | null
  readonly trajectory: ReturnType<typeof trajectory>
  readonly tokens: ReturnType<typeof tokenCounts>
  /** Candidates only. The watch decides whether a redesign retires a shape. */
  readonly windowStart: "redesign" | "widening" | null
}

export type Episode = {
  readonly repository: Repository
  readonly topic: string | null
  readonly head: string | null
  readonly anchor: string | null
  readonly history: readonly string[]
  readonly artifacts: readonly string[]
  readonly commits: readonly EpisodeCommit[]
  readonly tokens: ReturnType<typeof tokenCounts>
  readonly runs: ReturnType<typeof runEvidence>
  readonly unreadable: readonly {
    readonly sha: string
    readonly reason: string
  }[]
  readonly windowStarts: readonly {
    readonly sha: string
    readonly kind: "redesign" | "widening"
  }[]
}

export function commitTopic(commit: LogCommit): string | null {
  const form = looseForm(commit.subject)
  return form === null ? null : stemTopic(form.stem)
}

export function historyTopic(log: readonly LogCommit[]): string | null {
  return log.map(commitTopic).find((topic) => topic !== null) ?? null
}

export function sameHead(sha: string, head: string): boolean {
  return sha.startsWith(head) || head.startsWith(sha)
}

function resolveArea(
  id: string,
  kind: string,
  areas: readonly Area[],
): string[] {
  if (areas.some((area) => area.id === id && area.kind === kind)) return [id]
  return [
    ...new Set(
      areas
        .filter((area) => area.kind === kind && area.splitFrom === id)
        .map((area) => area.id),
    ),
  ]
}

function resolveFinding(
  finding: Finding,
  areas: readonly Area[],
): EpisodeFinding {
  const primary =
    finding.location.key === "area" ? finding.location.value : null
  const resolved =
    primary === null ? [] : resolveArea(primary, "partition", areas)
  const covers = finding.covers.map((id) => ({
    id,
    resolved: resolveArea(id, "cover", areas),
  }))
  return {
    ...finding,
    areas: resolved,
    resolvedCovers: [...new Set(covers.flatMap((cover) => cover.resolved))],
    unresolved: [
      ...(primary !== null && resolved.length === 0 ? [primary] : []),
      ...covers
        .filter((cover) => cover.resolved.length === 0)
        .map((cover) => cover.id),
    ],
  }
}

function readCommit(
  commit: LogCommit,
  repository: Repository,
  areas: readonly Area[],
): EpisodeCommit {
  let parsed: Subject | null = null
  try {
    parsed = parseSubject(commit.subject, repository)
  } catch {
    /* Loose form still scopes older subjects. */
  }
  const loose = looseForm(commit.subject)
  let findings: EpisodeFinding[] = []
  let unreadable: string | null = null
  try {
    findings = readFindings(
      commit.body,
      repository,
      parsed?.form?.role ?? loose?.role ?? null,
    ).map((finding) => resolveFinding(finding, areas))
    checkFindingTotals(parsed, findings)
  } catch (error) {
    findings = []
    unreadable = error instanceof Error ? error.message : String(error)
  }
  const windowStart =
    repository === "repo-edu" &&
    commit.files.length > 0 &&
    parsed?.kind?.conventional === "redesign"
      ? "redesign"
      : repository === "plan" &&
          commit.renames.some(
            ({ from, to }) =>
              from.endsWith(".md") && to === `${from.slice(0, -3)}-widen.md`,
          )
        ? "widening"
        : null
  return {
    ...commit,
    parsed,
    loose,
    findings,
    unreadable,
    trajectory: trajectory(parsed),
    tokens: tokenCounts(findings),
    windowStart,
  }
}

/** One repository's membership and facts. It neither grades nor stores the episode. */
export function computeEpisode(
  log: readonly LogCommit[],
  repository: Repository,
  topic: string | null,
  areas: readonly Area[],
  explicitAnchor?: string,
): Episode {
  const joinedTopic = topic === null ? null : stemTopic(topic)
  const named = log.filter(
    (commit) => joinedTopic !== null && commitTopic(commit) === joinedTopic,
  )
  const artifacts = new Set(named.flatMap((commit) => commit.files))
  const anchor =
    explicitAnchor === undefined
      ? joinedTopic === null
        ? log.length - 1
        : log.findLastIndex((commit) => commitTopic(commit) === joinedTopic)
      : log.findIndex((commit) => sameHead(commit.sha, explicitAnchor))
  if (explicitAnchor !== undefined && anchor === -1)
    throw new Error(
      `Episode anchor ${explicitAnchor} is not on ${repository}'s history.`,
    )
  const members = log
    .slice(0, anchor + 1)
    .filter(
      (commit) =>
        joinedTopic === null ||
        commitTopic(commit) === joinedTopic ||
        commit.files.some((file) => artifacts.has(file)),
    )
  const commits = members.map((commit) => readCommit(commit, repository, areas))
  return {
    repository,
    topic: joinedTopic,
    head: log[0]?.sha ?? null,
    anchor: log[anchor]?.sha ?? null,
    history: log.map((commit) => commit.sha),
    artifacts: [...artifacts].sort(),
    commits,
    tokens: tokenCounts(commits.flatMap((commit) => commit.findings)),
    runs: runEvidence(commits),
    unreadable: commits.flatMap((commit) =>
      commit.unreadable === null
        ? []
        : [{ sha: commit.sha, reason: commit.unreadable }],
    ),
    windowStarts: commits.flatMap((commit) =>
      commit.windowStart === null
        ? []
        : [{ sha: commit.sha, kind: commit.windowStart }],
    ),
  }
}

/** Join by topic, preserving each repository's anchor and chronological order. */
export function joinedEpisode(
  logs: Readonly<Record<Repository, readonly LogCommit[]>>,
  topic: string | null,
  areas: readonly Area[],
  anchor?: { readonly repository: Repository; readonly sha: string },
) {
  const repositories = (["plan", "repo-edu"] as const).map((repository) =>
    computeEpisode(
      logs[repository],
      repository,
      topic,
      areas,
      anchor?.repository === repository ? anchor.sha : undefined,
    ),
  )
  const commits = repositories.flatMap((episode) =>
    episode.commits.map((commit) => ({
      sha: `${episode.repository}@${commit.sha}`,
      findings: commit.findings,
    })),
  )
  return {
    topic: topic === null ? null : stemTopic(topic),
    repositories,
    tokens: tokenCounts(commits.flatMap((commit) => commit.findings)),
    growth: repeatedGrowth(commits),
  }
}

export async function readEpisode(
  cwd: string,
  repository: Repository,
  topic?: string,
  repoEduRoot = installationRoot,
): Promise<Episode> {
  const log = await readLog(cwd)
  // A finished fix may have changed the model since this runner started.
  return computeEpisode(
    log,
    repository,
    topic ?? historyTopic(log),
    loadAreaModel(repoEduRoot).areas,
  )
}

/** A named topic bypasses reference resolution for the runner's audited plan. */
export type WatchEvidenceInput = ExecutionContext &
  ({ readonly stem: string } | { readonly target?: string })

/** Resolve hand-run targets and join both histories only when evidence is requested. */
export async function readWatchEvidence(
  input: WatchEvidenceInput,
): Promise<string> {
  const [plan, repoEdu] = await Promise.all([
    readLog(input.planRoot),
    readLog(input.repoEduRoot),
  ])
  const repository = input.cwd === input.planRoot ? "plan" : "repo-edu"
  const logs = { plan, "repo-edu": repoEdu }
  const log = logs[repository]
  let topic = "stem" in input ? input.stem : historyTopic(log)
  let anchor: { repository: Repository; sha: string } | undefined
  if ("target" in input && input.target !== undefined) {
    const reference = input.target.replace(/^HEAD-(\d+)$/, "HEAD~$1")
    const result = await execa(
      "git",
      [
        "rev-parse",
        "--verify",
        "--quiet",
        "--end-of-options",
        `${reference}^{commit}`,
      ],
      { cwd: input.cwd, reject: false },
    )
    if (result.exitCode === 0) {
      const commit = log.find((commit) => commit.sha === result.stdout)
      if (commit === undefined)
        throw new Error(
          `Episode anchor ${input.target} is not on ${repository}'s history.`,
        )
      topic = commitTopic(commit) ?? historyTopic(log)
      anchor = { repository, sha: commit.sha }
    } else {
      topic = input.target
    }
  }
  return formatWatchEvidence(
    joinedEpisode(logs, topic, loadAreaModel(input.repoEduRoot).areas, anchor),
  )
}

/** One serialisation for the command and both watch prompts; no episode file. */
export function formatWatchEvidence(
  evidence: ReturnType<typeof joinedEpisode>,
): string {
  return JSON.stringify(
    {
      ...evidence,
      repositories: evidence.repositories.map(
        ({ history: _history, ...episode }) => episode,
      ),
    },
    null,
    2,
  )
}

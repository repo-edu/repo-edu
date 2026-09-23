import { type Area, computeEpisode, historyTopic } from "../episode.js"
import type { LogCommit } from "../episode-log.js"
import type { Repository } from "../subject.js"

export const areas: readonly Area[] = [
  ...["area-a", "area-b", "a", "b", "c", "d", "e", "tool-audit-round"].map(
    (id) => ({ id, kind: "partition" }),
  ),
  { id: "child-a", kind: "partition", splitFrom: "retired" },
  { id: "child-b", kind: "partition", splitFrom: "retired" },
  { id: "cover-x", kind: "cover" },
]

export const ratings = "[growth:none] [reach:developer] [complexity:none]"
export const bullet = (
  location = "area:area-a",
  tier = "C",
  tokens = ratings,
) => `- [${tier}] [${location}] ${tokens} Correct the behaviour.`

export function commit(
  subject: string,
  body = "",
  files = ["src/a.ts"],
  renames: LogCommit["renames"] = [],
): Omit<LogCommit, "sha"> {
  return { subject, body, files, renames }
}

export const base = commit("example/impl-1 ath feat(x): step")
export const correction = (area = "area-a", severity = "c1", tier = "C") =>
  commit(
    `example/impl-audit-all ath ${severity} fix(x): correction`,
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

import type { LogCommit } from "./episode-log.js"
import {
  type DeferralCitation,
  type Finding,
  readRecordBullets,
} from "./findings.js"
import { looseForm, type Repository, type TierLetter } from "./subject.js"
import { planStem } from "./target.js"

export type OpenDeferral = {
  readonly deferringRepository: Repository
  readonly sha: string
  readonly position: number
  readonly tier: TierLetter
  readonly destination: string
  readonly title: string
}

type DeferralCandidate = OpenDeferral & {
  readonly committedAt: string
  readonly fullSha: string
}

function readableBullets(commit: LogCommit, repository: Repository) {
  try {
    return readRecordBullets(
      commit.body,
      repository,
      looseForm(commit.subject)?.role ?? null,
    )
  } catch {
    return []
  }
}

function isFinding(
  bullet: ReturnType<typeof readableBullets>[number],
): bullet is Finding {
  return "tier" in bullet
}

function shortSha(sha: string): string {
  return sha.slice(0, 7)
}

function destinationPlan(location: string): string {
  return planStem(location.split("#", 1)[0])
}

function deferrals(
  commits: readonly LogCommit[],
  repository: Repository,
  selected: (finding: Finding) => boolean,
): DeferralCandidate[] {
  return commits.flatMap((commit) => {
    let position = 0
    return readableBullets(commit, repository).flatMap((bullet) => {
      if (!isFinding(bullet) || !bullet.deferred) return []
      position += 1
      if (!selected(bullet)) return []
      return [
        {
          deferringRepository: repository,
          sha: shortSha(commit.sha),
          fullSha: commit.sha,
          committedAt: commit.committedAt,
          position,
          tier: bullet.tier,
          destination: bullet.location.value,
          title: bullet.title,
        },
      ]
    })
  })
}

function citedDeferrals(
  destinationCommits: readonly LogCommit[],
  destinationRepository: Repository,
  sourceCommits: readonly LogCommit[],
): Set<string> {
  const cited = new Set<string>()
  for (const commit of destinationCommits) {
    for (const bullet of readableBullets(commit, destinationRepository)) {
      for (const citation of bullet.applies) {
        const sha = citationCommit(citation, sourceCommits)
        if (sha !== null) cited.add(`${sha}/${citation.position}`)
      }
    }
  }
  return cited
}

function citationCommit(
  citation: DeferralCitation,
  commits: readonly LogCommit[],
): string | null {
  const matches = commits.filter((commit) =>
    commit.sha.startsWith(citation.sha),
  )
  return matches.length === 1 ? matches[0].sha : null
}

/** Compute one active plan's open deferrals from the two newest-first logs. */
export function openDeferrals(
  stem: string,
  logs: Readonly<Record<Repository, readonly LogCommit[]>>,
): OpenDeferral[] {
  const topic = planStem(stem)
  const planCommits = logs.plan.filter(
    (commit) => looseForm(commit.subject)?.stem === topic,
  )
  const intoPlan = deferrals(
    logs["repo-edu"],
    "repo-edu",
    (finding) =>
      finding.location.key === "plan" &&
      destinationPlan(finding.location.value) === topic,
  )
  const intoRepoEdu = deferrals(
    planCommits,
    "plan",
    (finding) => finding.location.key === "area",
  )
  const appliedIntoPlan = citedDeferrals(planCommits, "plan", logs["repo-edu"])
  const appliedIntoRepoEdu = citedDeferrals(
    logs["repo-edu"],
    "repo-edu",
    planCommits,
  )

  return [...intoPlan, ...intoRepoEdu]
    .filter((deferral) => {
      const applied =
        deferral.deferringRepository === "repo-edu"
          ? appliedIntoPlan
          : appliedIntoRepoEdu
      return !applied.has(`${deferral.fullSha}/${deferral.position}`)
    })
    .sort(
      (first, second) =>
        Date.parse(second.committedAt) - Date.parse(first.committedAt),
    )
    .map(
      ({ committedAt: _committedAt, fullSha: _fullSha, ...deferral }) =>
        deferral,
    )
}

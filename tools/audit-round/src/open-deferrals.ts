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
          sha: commit.sha,
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

function citations(
  destinationCommits: readonly LogCommit[],
  destinationRepository: Repository,
): DeferralCitation[] {
  return destinationCommits.flatMap((commit) =>
    readableBullets(commit, destinationRepository).flatMap(
      (bullet) => bullet.applies,
    ),
  )
}

/** A citation names its deferring commit by its full, exact identity. */
function cited(
  deferral: DeferralCandidate,
  applied: readonly DeferralCitation[],
): boolean {
  return applied.some(
    (citation) =>
      citation.position === deferral.position && deferral.sha === citation.sha,
  )
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
  const appliedIntoPlan = citations(planCommits, "plan")
  const appliedIntoRepoEdu = [
    ...citations(logs["repo-edu"], "repo-edu"),
    ...citations(planCommits, "plan"),
  ]

  return [...intoPlan, ...intoRepoEdu]
    .filter(
      (deferral) =>
        !cited(
          deferral,
          deferral.deferringRepository === "repo-edu"
            ? appliedIntoPlan
            : appliedIntoRepoEdu,
        ),
    )
    .sort(
      (first, second) =>
        Date.parse(second.committedAt) - Date.parse(first.committedAt),
    )
    .map(({ committedAt: _committedAt, ...deferral }) => deferral)
}

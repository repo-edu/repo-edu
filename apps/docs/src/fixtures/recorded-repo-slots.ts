import type {
  GeneratedRepoSlot,
  RecordedAnalysisGitAuthor,
  RecordedAnalysisGitCommit,
  RecordedAnalysisGitFixture,
  RecordedAnalysisGitRepo,
} from "./analysis-git-fixture-types.js"

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function extractRecordedAuthors(
  commits: readonly RecordedAnalysisGitCommit[],
): RecordedAnalysisGitAuthor[] {
  const byEmail = new Map<string, RecordedAnalysisGitAuthor>()
  for (const commit of [...commits].sort((a, b) => a.timestamp - b.timestamp)) {
    const key = normalizeEmail(commit.authorEmail)
    if (key.length === 0 || byEmail.has(key)) continue
    byEmail.set(key, {
      name: commit.authorName,
      email: commit.authorEmail,
    })
  }
  return [...byEmail.values()]
}

function projectRepoToRoot(
  slot: GeneratedRepoSlot,
  rootPath: string,
): RecordedAnalysisGitRepo {
  return {
    ...slot.repo,
    name: slot.repoName,
    path: `${rootPath}/${slot.repoName}`,
  }
}

export function recordedAtForSlots(
  slots: readonly GeneratedRepoSlot[],
): string {
  if (slots.length === 0) return "1970-01-01T00:00:00.000Z"

  const latestCommitTimestamp = Math.max(
    ...slots.flatMap((slot) =>
      slot.repo.commits.map((commit) => commit.timestamp),
    ),
  )
  return new Date(latestCommitTimestamp * 1000).toISOString()
}

export function buildRecordedAnalysisGitFixture(
  slots: readonly GeneratedRepoSlot[],
  rootPath: string,
): RecordedAnalysisGitFixture {
  return {
    rootPath,
    recordedAt: recordedAtForSlots(slots),
    repos: slots
      .map((slot) => projectRepoToRoot(slot, rootPath))
      .sort((a, b) => a.name.localeCompare(b.name)),
  }
}

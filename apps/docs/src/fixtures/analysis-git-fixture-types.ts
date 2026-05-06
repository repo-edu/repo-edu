export type RecordedAnalysisGitNumstat = {
  path: string
  insertions: number
  deletions: number
}

export type RecordedAnalysisGitCommit = {
  oid: string
  shortOid: string
  timestamp: number
  authorName: string
  authorEmail: string
  message: string
  files: RecordedAnalysisGitNumstat[]
}

export type RecordedAnalysisGitTreeEntry = {
  mode: string
  type: "blob"
  objectOid: string
  size: number
  path: string
}

export type RecordedAnalysisGitRepo = {
  name: string
  path: string
  headOid: string
  defaultBranch: string
  commits: RecordedAnalysisGitCommit[]
  treesByCommit: Record<string, RecordedAnalysisGitTreeEntry[]>
  blameByCommit: Record<string, Record<string, string>>
}

export type RecordedAnalysisGitFixture = {
  rootPath: string
  recordedAt: string
  repos: RecordedAnalysisGitRepo[]
}

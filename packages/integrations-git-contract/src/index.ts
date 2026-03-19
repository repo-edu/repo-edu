import type {
  GitProviderKind,
  RepositoryTemplateVisibility,
} from "@repo-edu/domain/types"

export const packageId = "@repo-edu/integrations-git-contract"

export const supportedGitProviders = ["github", "gitlab", "gitea"] as const

export type GitConnectionDraft = {
  provider: GitProviderKind
  baseUrl: string
  token: string
}

export type GitUsernameStatus = {
  username: string
  exists: boolean
}

export type CreateRepositoriesRequest = {
  organization: string
  repositoryNames: string[]
  visibility: RepositoryTemplateVisibility
  autoInit: boolean
}

export type CreatedRepository = {
  repositoryName: string
  repositoryUrl: string
}

export type FailedRepositoryCreate = {
  repositoryName: string
  reason: string
}

export type CreateRepositoriesResult = {
  created: CreatedRepository[]
  alreadyExisted: CreatedRepository[]
  failed: FailedRepositoryCreate[]
}

export type TeamPermission = "push" | "pull" | "admin"

export type CreateTeamRequest = {
  organization: string
  teamName: string
  memberUsernames: string[]
  permission: TeamPermission
}

export type CreateTeamResult = {
  created: boolean
  teamSlug: string
  membersAdded: string[]
  membersNotFound: string[]
}

export type AssignRepositoriesToTeamRequest = {
  organization: string
  teamSlug: string
  repositoryNames: string[]
  permission: TeamPermission
}

export type RepositoryHeadRequest = {
  owner: string
  repositoryName: string
}

export type RepositoryHead = {
  sha: string
  branchName: string
}

export type PatchFileStatus = "added" | "modified" | "removed" | "renamed"

export type PatchFile = {
  path: string
  previousPath: string | null
  status: PatchFileStatus
  contentBase64: string | null
}

export type GetTemplateDiffRequest = {
  owner: string
  repositoryName: string
  fromSha: string
  toSha: string
}

export type GetTemplateDiffResult = {
  files: PatchFile[]
}

export type CreateBranchRequest = {
  owner: string
  repositoryName: string
  branchName: string
  baseSha: string
  commitMessage: string
  files: PatchFile[]
}

export type CreatePullRequestRequest = {
  owner: string
  repositoryName: string
  headBranch: string
  baseBranch: string
  title: string
  body: string
}

export type CreatePullRequestResult = {
  url: string
  created: boolean
}

export type ResolveRepositoryCloneUrlsRequest = {
  organization: string
  repositoryNames: string[]
}

export type ResolvedRepositoryCloneUrl = {
  repositoryName: string
  cloneUrl: string
}

export type ResolveRepositoryCloneUrlsResult = {
  resolved: ResolvedRepositoryCloneUrl[]
  missing: string[]
}

export type GitProviderClient = {
  verifyConnection(
    draft: GitConnectionDraft,
    signal?: AbortSignal,
  ): Promise<{ verified: boolean }>
  verifyGitUsernames(
    draft: GitConnectionDraft,
    usernames: string[],
    signal?: AbortSignal,
  ): Promise<GitUsernameStatus[]>
  createRepositories(
    draft: GitConnectionDraft,
    request: CreateRepositoriesRequest,
    signal?: AbortSignal,
  ): Promise<CreateRepositoriesResult>
  createTeam(
    draft: GitConnectionDraft,
    request: CreateTeamRequest,
    signal?: AbortSignal,
  ): Promise<CreateTeamResult>
  assignRepositoriesToTeam(
    draft: GitConnectionDraft,
    request: AssignRepositoriesToTeamRequest,
    signal?: AbortSignal,
  ): Promise<void>
  getRepositoryDefaultBranchHead(
    draft: GitConnectionDraft,
    request: RepositoryHeadRequest,
    signal?: AbortSignal,
  ): Promise<RepositoryHead | null>
  getTemplateDiff(
    draft: GitConnectionDraft,
    request: GetTemplateDiffRequest,
    signal?: AbortSignal,
  ): Promise<GetTemplateDiffResult | null>
  createBranch(
    draft: GitConnectionDraft,
    request: CreateBranchRequest,
    signal?: AbortSignal,
  ): Promise<void>
  createPullRequest(
    draft: GitConnectionDraft,
    request: CreatePullRequestRequest,
    signal?: AbortSignal,
  ): Promise<CreatePullRequestResult>
  resolveRepositoryCloneUrls(
    draft: GitConnectionDraft,
    request: ResolveRepositoryCloneUrlsRequest,
    signal?: AbortSignal,
  ): Promise<ResolveRepositoryCloneUrlsResult>
}

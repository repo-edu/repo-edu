import type {
  ConnectionBase,
  GitProviderKind,
} from "@repo-edu/domain/connection"
import type { RepositoryTemplateVisibility } from "@repo-edu/domain/types"

export const packageId = "@repo-edu/integrations-git-contract"

export const supportedGitProviders = ["github", "gitlab", "gitea"] as const

type GitContractProvider = (typeof supportedGitProviders)[number]
type AssertEqual<A, B> = [A] extends [B]
  ? [B] extends [A]
    ? true
    : false
  : false
const _providerKindMatchesDomain: AssertEqual<
  GitContractProvider,
  GitProviderKind
> = true
void _providerKindMatchesDomain

export type GitConnectionDraft = ConnectionBase & {
  provider: GitProviderKind
}

/** Proven at the provider operation boundary, independently of error wording. */
export type GitEffectFailure = Error & {
  readonly type: "git-effect"
  readonly disposition: "stopped" | "completed"
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
  /** Provider web URL suitable for user-facing output. */
  repositoryUrl: string
  /** Authenticated HTTP URL for immediate clone or push operations. */
  cloneUrl: string
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
  /** The group's stable ID in its course, made of lowercase letters, digits
   * and `_`. The team's name on the server carries it, so two groups never
   * share a team. */
  groupId: string
  /** Empty for a team of usernames, which has no name of its own. */
  groupName: string
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

/** `created: false` answers a provider that already has a pull request for
 * these branches or, on GitHub, no commits between them. */
export type CreatePullRequestResult =
  | { created: true; url: string }
  | { created: false }

export type ResolveRepositoryCloneUrlsRequest = {
  organization: string
  repositoryNames: string[]
}

export type ListRepositoriesRequest = {
  namespace: string
  filter?: string
  includeArchived?: boolean
}

export type ListedRepository = {
  /** Leaf repository name (final path segment), suitable for display and local folder names. */
  name: string
  /**
   * Path identifier relative to the requested namespace, used for clone URL
   * resolution. Equals `name` on providers without nested namespaces (GitHub,
   * Gitea). On GitLab, may include subgroup segments, e.g. `team-101/lab-1`.
   */
  identifier: string
  archived: boolean
}

export type ListRepositoriesResult = {
  repositories: ListedRepository[]
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
  /** `null` when the provider answers that the repository or its default
   * branch does not exist, as for an empty repository. */
  getRepositoryDefaultBranchHead(
    draft: GitConnectionDraft,
    request: RepositoryHeadRequest,
    signal?: AbortSignal,
  ): Promise<RepositoryHead | null>
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
  listRepositories(
    draft: GitConnectionDraft,
    request: ListRepositoriesRequest,
    signal?: AbortSignal,
  ): Promise<ListRepositoriesResult>
}

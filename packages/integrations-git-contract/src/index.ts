import type {
  GitProviderKind,
  RepositoryTemplate,
} from "@repo-edu/domain"

export const packageId = "@repo-edu/integrations-git-contract"

export const supportedGitProviders = ["github", "gitlab", "gitea"] as const

export type GitConnectionDraft = {
  provider: GitProviderKind
  baseUrl: string | null
  token: string
  organization: string | null
}

export type GitUsernameStatus = {
  username: string
  exists: boolean
}

export type CreateRepositoriesRequest = {
  organization: string
  repositoryNames: string[]
  template: RepositoryTemplate | null
}

export type CreateRepositoriesResult = {
  createdCount: number
  repositoryUrls: string[]
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
}

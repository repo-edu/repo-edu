import type { GitProviderKind, RepositoryTemplate } from "@repo-edu/domain";

export const packageId = "@repo-edu/integrations-git-contract";

export const supportedGitProviders = ["github", "gitlab", "gitea"] as const;

export type GitConnectionDraft = {
  provider: GitProviderKind;
  baseUrl: string | null;
  token: string;
  organization: string | null;
};

export type GitUsernameStatus = {
  username: string;
  exists: boolean;
};

export type CreateRepositoriesRequest = {
  organization: string;
  repositoryNames: string[];
  template: RepositoryTemplate | null;
};

export type CreateRepositoriesResult = {
  createdCount: number;
  repositoryUrls: string[];
};

export type ResolveRepositoryCloneUrlsRequest = {
  organization: string;
  repositoryNames: string[];
};

export type ResolvedRepositoryCloneUrl = {
  repositoryName: string;
  cloneUrl: string;
};

export type ResolveRepositoryCloneUrlsResult = {
  resolved: ResolvedRepositoryCloneUrl[];
  missing: string[];
};

export type DeleteRepositoriesRequest = {
  organization: string;
  repositoryNames: string[];
};

export type DeleteRepositoriesResult = {
  deletedCount: number;
  missing: string[];
};

export type GitProviderClient = {
  verifyConnection(
    draft: GitConnectionDraft,
    signal?: AbortSignal,
  ): Promise<{ verified: boolean }>;
  verifyGitUsernames(
    draft: GitConnectionDraft,
    usernames: string[],
    signal?: AbortSignal,
  ): Promise<GitUsernameStatus[]>;
  createRepositories(
    draft: GitConnectionDraft,
    request: CreateRepositoriesRequest,
    signal?: AbortSignal,
  ): Promise<CreateRepositoriesResult>;
  resolveRepositoryCloneUrls(
    draft: GitConnectionDraft,
    request: ResolveRepositoryCloneUrlsRequest,
    signal?: AbortSignal,
  ): Promise<ResolveRepositoryCloneUrlsResult>;
  deleteRepositories(
    draft: GitConnectionDraft,
    request: DeleteRepositoriesRequest,
    signal?: AbortSignal,
  ): Promise<DeleteRepositoriesResult>;
};

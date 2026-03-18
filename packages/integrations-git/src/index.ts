import type { GitProviderKind } from "@repo-edu/domain"
import type { HttpPort } from "@repo-edu/host-runtime-contract"
import type { GitProviderClient } from "@repo-edu/integrations-git-contract"
import { packageId as contractPackageId } from "@repo-edu/integrations-git-contract"
import { createGiteaClient } from "./gitea/index.js"
import { createGitHubClient } from "./github/index.js"
import { createGitLabClient } from "./gitlab/index.js"

export const packageId = "@repo-edu/integrations-git"
export const workspaceDependencies = [contractPackageId] as const

export { createGiteaClient } from "./gitea/index.js"
export { createGitHubClient } from "./github/index.js"
export { createGitLabClient } from "./gitlab/index.js"

export function createGitProviderClient(
  provider: GitProviderKind,
  http: HttpPort,
): GitProviderClient {
  switch (provider) {
    case "github":
      return createGitHubClient(http)
    case "gitlab":
      return createGitLabClient(http)
    case "gitea":
      return createGiteaClient(http)
  }
}

export function createGitProviderDispatch(http: HttpPort): GitProviderClient {
  const clients = new Map<GitProviderKind, GitProviderClient>()

  const resolveClient = (provider: GitProviderKind): GitProviderClient => {
    const existing = clients.get(provider)
    if (existing) {
      return existing
    }

    const next = createGitProviderClient(provider, http)
    clients.set(provider, next)
    return next
  }

  return {
    verifyConnection(draft, signal) {
      return resolveClient(draft.provider).verifyConnection(draft, signal)
    },
    verifyGitUsernames(draft, usernames, signal) {
      return resolveClient(draft.provider).verifyGitUsernames(
        draft,
        usernames,
        signal,
      )
    },
    createRepositories(draft, request, signal) {
      return resolveClient(draft.provider).createRepositories(
        draft,
        request,
        signal,
      )
    },
    createTeam(draft, request, signal) {
      return resolveClient(draft.provider).createTeam(draft, request, signal)
    },
    assignRepositoriesToTeam(draft, request, signal) {
      return resolveClient(draft.provider).assignRepositoriesToTeam(
        draft,
        request,
        signal,
      )
    },
    getRepositoryDefaultBranchHead(draft, request, signal) {
      return resolveClient(draft.provider).getRepositoryDefaultBranchHead(
        draft,
        request,
        signal,
      )
    },
    getTemplateDiff(draft, request, signal) {
      return resolveClient(draft.provider).getTemplateDiff(
        draft,
        request,
        signal,
      )
    },
    createBranch(draft, request, signal) {
      return resolveClient(draft.provider).createBranch(draft, request, signal)
    },
    createPullRequest(draft, request, signal) {
      return resolveClient(draft.provider).createPullRequest(
        draft,
        request,
        signal,
      )
    },
    resolveRepositoryCloneUrls(draft, request, signal) {
      return resolveClient(draft.provider).resolveRepositoryCloneUrls(
        draft,
        request,
        signal,
      )
    },
  }
}

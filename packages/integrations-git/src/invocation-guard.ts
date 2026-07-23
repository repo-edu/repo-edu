import type { GitProviderClient } from "@repo-edu/integrations-git-contract"

function throwIfCallerAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("The operation was aborted.", "AbortError")
  }
}

async function invoke<T>(
  signal: AbortSignal | undefined,
  operation: () => Promise<T>,
): Promise<T> {
  throwIfCallerAborted(signal)
  try {
    const result = await operation()
    throwIfCallerAborted(signal)
    return result
  } catch (error) {
    throwIfCallerAborted(signal)
    throw error
  }
}

export function guardGitProviderClient(
  client: GitProviderClient,
): GitProviderClient {
  return {
    verifyConnection: (draft, signal) =>
      invoke(signal, () => client.verifyConnection(draft, signal)),
    verifyGitUsernames: (draft, usernames, signal) =>
      invoke(signal, () => client.verifyGitUsernames(draft, usernames, signal)),
    createRepositories: (draft, request, signal) =>
      invoke(signal, () => client.createRepositories(draft, request, signal)),
    createTeam: (draft, request, signal) =>
      invoke(signal, () => client.createTeam(draft, request, signal)),
    assignRepositoriesToTeam: (draft, request, signal) =>
      invoke(signal, () =>
        client.assignRepositoriesToTeam(draft, request, signal),
      ),
    getRepositoryDefaultBranchHead: (draft, request, signal) =>
      invoke(signal, () =>
        client.getRepositoryDefaultBranchHead(draft, request, signal),
      ),
    getTemplateDiff: (draft, request, signal) =>
      invoke(signal, () => client.getTemplateDiff(draft, request, signal)),
    createBranch: (draft, request, signal) =>
      invoke(signal, () => client.createBranch(draft, request, signal)),
    createPullRequest: (draft, request, signal) =>
      invoke(signal, () => client.createPullRequest(draft, request, signal)),
    resolveRepositoryCloneUrls: (draft, request, signal) =>
      invoke(signal, () =>
        client.resolveRepositoryCloneUrls(draft, request, signal),
      ),
    listRepositories: (draft, request, signal) =>
      invoke(signal, () => client.listRepositories(draft, request, signal)),
  }
}

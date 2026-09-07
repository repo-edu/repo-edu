import type {
  GitEffectFailure,
  GitProviderClient,
} from "@repo-edu/integrations-git-contract"

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

export function gitEffectFailure(
  disposition: GitEffectFailure["disposition"],
  message: string,
): GitEffectFailure {
  return Object.assign(new Error(message), {
    type: "git-effect" as const,
    disposition,
  })
}

/** Called between sequential effects, after every earlier request has finished. */
export function throwIfGitEffectAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw gitEffectFailure("stopped", "Operation cancelled.")
}

async function invokeEffect<T>(
  signal: AbortSignal | undefined,
  operation: () => Promise<T>,
  hasResponse: (error: unknown) => boolean,
): Promise<T> {
  throwIfGitEffectAborted(signal)
  try {
    return await operation()
  } catch (error) {
    if (hasResponse(error)) {
      throw gitEffectFailure(
        "completed",
        error instanceof Error ? error.message : String(error),
      )
    }
    throw error
  }
}

export function guardGitProviderClient(
  client: GitProviderClient,
  hasResponse: (error: unknown) => boolean = () => false,
): GitProviderClient {
  return {
    verifyConnection: (draft, signal) =>
      invoke(signal, () => client.verifyConnection(draft, signal)),
    verifyGitUsernames: (draft, usernames, signal) =>
      invoke(signal, () => client.verifyGitUsernames(draft, usernames, signal)),
    createRepositories: (draft, request, signal) =>
      invokeEffect(
        signal,
        () => client.createRepositories(draft, request, signal),
        hasResponse,
      ),
    createTeam: (draft, request, signal) =>
      invokeEffect(
        signal,
        () => client.createTeam(draft, request, signal),
        hasResponse,
      ),
    assignRepositoriesToTeam: (draft, request, signal) =>
      invokeEffect(
        signal,
        () => client.assignRepositoriesToTeam(draft, request, signal),
        hasResponse,
      ),
    getRepositoryDefaultBranchHead: (draft, request, signal) =>
      invoke(signal, () =>
        client.getRepositoryDefaultBranchHead(draft, request, signal),
      ),
    getTemplateDiff: (draft, request, signal) =>
      invoke(signal, () => client.getTemplateDiff(draft, request, signal)),
    createBranch: (draft, request, signal) =>
      invokeEffect(
        signal,
        () => client.createBranch(draft, request, signal),
        hasResponse,
      ),
    createPullRequest: (draft, request, signal) =>
      invokeEffect(
        signal,
        () => client.createPullRequest(draft, request, signal),
        hasResponse,
      ),
    resolveRepositoryCloneUrls: (draft, request, signal) =>
      invoke(signal, () =>
        client.resolveRepositoryCloneUrls(draft, request, signal),
      ),
    listRepositories: (draft, request, signal) =>
      invoke(signal, () => client.listRepositories(draft, request, signal)),
  }
}

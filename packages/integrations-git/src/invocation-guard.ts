import type {
  GitEffectFailure,
  GitProviderClient,
} from "@repo-edu/integrations-git-contract"

export function gitEffectFailure(
  disposition: GitEffectFailure["disposition"],
  message: string,
): GitEffectFailure {
  return Object.assign(new Error(message), {
    type: "git-effect" as const,
    disposition,
  })
}

function isGitEffectFailure(error: unknown): error is GitEffectFailure {
  return (
    error instanceof Error && "type" in error && error.type === "git-effect"
  )
}

/** Called between sequential effects, after every earlier request has finished. */
export function throwIfGitEffectAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw gitEffectFailure("stopped", "Operation cancelled.")
}

/** A read changes nothing, so the caller's stop is proven and any other
 * failure is a known completion. */
function readFailure(
  signal: AbortSignal | undefined,
  error: unknown,
): GitEffectFailure {
  if (isGitEffectFailure(error)) return error
  if (signal?.aborted)
    return gitEffectFailure("stopped", "Operation cancelled.")
  return gitEffectFailure(
    "completed",
    error instanceof Error ? error.message : String(error),
  )
}

/** Every provider request layer sends through here, so a read inside a
 * mutating operation follows the same rule as a read-only operation. A read
 * keeps the caller's signal. A write never receives it: the write runs to its
 * response and the caller's stop is proven before the next request. A read
 * failure with a response stays raw so the capability can translate absence. */
export async function sendGitRequest<T>(
  method: string,
  signal: AbortSignal | undefined,
  send: (signal: AbortSignal | undefined) => Promise<T>,
  hasResponse: (error: unknown) => boolean = () => false,
): Promise<T> {
  if (method !== "GET" && method !== "HEAD") return send(undefined)
  try {
    return await send(signal)
  } catch (error) {
    if (hasResponse(error)) throw error
    throw readFailure(signal, error)
  }
}

async function invoke<T>(
  signal: AbortSignal | undefined,
  operation: () => Promise<T>,
): Promise<T> {
  throwIfGitEffectAborted(signal)
  let result: T
  try {
    result = await operation()
  } catch (error) {
    throw readFailure(signal, error)
  }
  throwIfGitEffectAborted(signal)
  return result
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

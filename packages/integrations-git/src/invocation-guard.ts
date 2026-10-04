import type {
  HttpPort,
  HttpRequest,
  HttpResponse,
} from "@repo-edu/host-runtime-contract"
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

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function readablePath(url: string): string {
  const path = new URL(url, "http://provider.invalid").pathname
  try {
    return decodeURIComponent(path)
  } catch {
    return path
  }
}

/** A provider answered with an error status. Every provider transport throws
 * this for a reply outside 2xx, so a call reads an error reply only by naming
 * its status as an expected answer, and an unnamed one fails the call. */
export class GitReplyError extends Error {
  readonly status: number
  /** The provider's own wording, which message-based answers match. */
  readonly detail: string

  constructor(method: string, url: string, status: number, detail: string) {
    super(
      `${method} ${readablePath(url)} answered ${status}${detail ? `: ${detail}` : ""}`,
    )
    this.name = "GitReplyError"
    this.status = status
    this.detail = detail
  }
}

/** Without statuses, any error reply matches. */
export function isGitReply(
  error: unknown,
  ...statuses: number[]
): error is GitReplyError {
  return (
    error instanceof GitReplyError &&
    (statuses.length === 0 || statuses.includes(error.status))
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
  return gitEffectFailure("completed", errorMessage(error))
}

/** Every provider request layer sends through here, so a read inside a
 * mutating operation follows the same rule as a read-only operation. A read
 * keeps the caller's signal. A write never receives it: the write runs to its
 * response and the caller's stop is proven before the next request. An error
 * reply stays raw so the capability can translate the statuses it expects. */
export async function sendGitRequest<T>(
  method: string,
  signal: AbortSignal | undefined,
  send: (signal: AbortSignal | undefined) => Promise<T>,
): Promise<T> {
  if (method !== "GET" && method !== "HEAD") return send(undefined)
  try {
    return await send(signal)
  } catch (error) {
    if (error instanceof GitReplyError) throw error
    throw readFailure(signal, error)
  }
}

/** The request rule plus the reply rule for transports that read raw HTTP
 * replies themselves. */
export async function sendGitHttpRequest(
  http: HttpPort,
  request: HttpRequest & { method: NonNullable<HttpRequest["method"]> },
  signal: AbortSignal | undefined,
  replyDetail: (response: HttpResponse) => string,
): Promise<HttpResponse> {
  const response = await sendGitRequest(request.method, signal, (signal) =>
    http.fetch({ ...request, signal }),
  )
  if (response.status < 200 || response.status >= 300) {
    throw new GitReplyError(
      request.method,
      request.url,
      response.status,
      replyDetail(response),
    )
  }
  return response
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

/** An error reply proves the provider answered, so the write's outcome is
 * known. Any other raw failure lost its response and stays unknown. */
async function invokeEffect<T>(
  signal: AbortSignal | undefined,
  operation: () => Promise<T>,
): Promise<T> {
  throwIfGitEffectAborted(signal)
  try {
    return await operation()
  } catch (error) {
    if (error instanceof GitReplyError) {
      throw gitEffectFailure("completed", error.message)
    }
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
      invokeEffect(signal, () =>
        client.createRepositories(draft, request, signal),
      ),
    createTeam: (draft, request, signal) =>
      invokeEffect(signal, () => client.createTeam(draft, request, signal)),
    assignRepositoriesToTeam: (draft, request, signal) =>
      invokeEffect(signal, () =>
        client.assignRepositoriesToTeam(draft, request, signal),
      ),
    getRepositoryDefaultBranchHead: (draft, request, signal) =>
      invoke(signal, () =>
        client.getRepositoryDefaultBranchHead(draft, request, signal),
      ),
    getTemplateDiff: (draft, request, signal) =>
      invoke(signal, () => client.getTemplateDiff(draft, request, signal)),
    createBranch: (draft, request, signal) =>
      invokeEffect(signal, () => client.createBranch(draft, request, signal)),
    createPullRequest: (draft, request, signal) =>
      invokeEffect(signal, () =>
        client.createPullRequest(draft, request, signal),
      ),
    resolveRepositoryCloneUrls: (draft, request, signal) =>
      invoke(signal, () =>
        client.resolveRepositoryCloneUrls(draft, request, signal),
      ),
    listRepositories: (draft, request, signal) =>
      invoke(signal, () => client.listRepositories(draft, request, signal)),
  }
}

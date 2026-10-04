import { GitReplyError, isGitReply } from "../invocation-guard.js"

type OctokitReplyError = Error & {
  status: number
  request: { url: string }
  response: object
}

function isOctokitReplyError(error: unknown): error is OctokitReplyError {
  return (
    error instanceof Error &&
    "status" in error &&
    typeof error.status === "number" &&
    "response" in error &&
    typeof error.response === "object" &&
    error.response !== null &&
    "request" in error &&
    typeof error.request === "object" &&
    error.request !== null &&
    "url" in error.request &&
    typeof error.request.url === "string"
  )
}

/** Octokit reads the reply itself, so its error for a reply becomes the
 * shared reply error. Octokit's message already carries the provider's
 * wording and validation errors. */
export function toGitHubReplyError(error: unknown, method: string): unknown {
  if (!isOctokitReplyError(error)) return error
  return new GitReplyError(
    method,
    error.request.url,
    error.status,
    error.message,
  )
}

export function isAlreadyExistsError(error: unknown): boolean {
  return (
    isGitReply(error, 409, 422) &&
    /already exists|name already exists/i.test(error.detail)
  )
}

export function isNoChangesError(error: unknown): boolean {
  return (
    isGitReply(error, 422) &&
    /no commits between|no changes|already exists/i.test(error.detail)
  )
}

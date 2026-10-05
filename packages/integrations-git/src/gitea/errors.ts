import { isGitReply } from "../invocation-guard.js"

/** Gitea 1.27 answers each "already exists" with its own status and wording. */
function isGiteaReply(
  error: unknown,
  status: number,
  wording: RegExp,
): boolean {
  return isGitReply(error, status) && wording.test(error.detail)
}

export function isRepositoryAlreadyExists(error: unknown): boolean {
  return isGiteaReply(
    error,
    409,
    /repository with the same name already exists/i,
  )
}

export function isTeamAlreadyExists(error: unknown): boolean {
  return isGiteaReply(error, 422, /team already exists/i)
}

/** A branch named like a tag or nested under another branch is refused with
 * other 409 wording, so only this one reuses the existing branch. */
export function isBranchAlreadyExists(error: unknown): boolean {
  return isGiteaReply(error, 409, /the branch already exists/i)
}

export function isPullRequestAlreadyExists(error: unknown): boolean {
  return isGiteaReply(error, 409, /pull request already exists/i)
}

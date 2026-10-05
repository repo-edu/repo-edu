import { isGitReply } from "../invocation-guard.js"

/** GitLab 19.4 answers each "already exists" with its own status and wording.
 * A validation reply carries the model's errors, such as
 * `{"name":["has already been taken"]}`. */
function isGitLabReply(
  error: unknown,
  status: number,
  wording: RegExp,
): boolean {
  return isGitReply(error, status) && wording.test(error.detail)
}

/** A project or group whose name or path another one already holds. */
export function isNameTaken(error: unknown): boolean {
  return isGitLabReply(error, 400, /has already been taken/i)
}

export function isBranchAlreadyExists(error: unknown): boolean {
  return isGitLabReply(error, 400, /branch already exists/i)
}

export function isMemberAlreadyExists(error: unknown): boolean {
  return isGitLabReply(error, 409, /member already exists/i)
}

export function isAlreadySharedWithGroup(error: unknown): boolean {
  return isGitLabReply(error, 409, /already shared with this group/i)
}

export function isMergeRequestAlreadyExists(error: unknown): boolean {
  return isGitLabReply(
    error,
    409,
    /another open merge request already exists for this source branch/i,
  )
}

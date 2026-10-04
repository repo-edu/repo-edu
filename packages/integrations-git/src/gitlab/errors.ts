import { isGitReply } from "../invocation-guard.js"

export function isAlreadyExistsError(error: unknown): boolean {
  return (
    isGitReply(error, 400, 409, 422) &&
    /already exists|already been taken|has already been taken/i.test(
      error.detail,
    )
  )
}

export function isNoChangesError(error: unknown): boolean {
  return (
    isGitReply(error) &&
    /already exists|no commits|no changes|branch.*exists/i.test(error.detail)
  )
}

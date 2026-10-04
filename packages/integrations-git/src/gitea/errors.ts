import { isGitReply } from "../invocation-guard.js"

export function isAlreadyExists(error: unknown): boolean {
  return (
    isGitReply(error, 409, 422) &&
    /already exists|has already been taken/i.test(error.detail)
  )
}

export function isNoChanges(error: unknown): boolean {
  return (
    isGitReply(error) &&
    /already exists|no commits|no changes|same as current/i.test(error.detail)
  )
}

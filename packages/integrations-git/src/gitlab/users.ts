import type { Gitlab } from "@gitbeaker/rest"
import { gitEffectFailure } from "../invocation-guard.js"

type GitLabUser = { id: number; usable: boolean }

/** GitLab matches the `username` filter exactly but without regard to case,
 * so it answers at most one account. Only an `active` account is usable; a
 * deactivated, blocked or banned one reads as absent. */
async function findGitLabUser(
  api: Gitlab,
  username: string,
): Promise<GitLabUser | null> {
  const users: unknown = await api.Users.all({ username })
  if (!Array.isArray(users)) {
    throw gitEffectFailure(
      "completed",
      `GitLab answered an unreadable user search for '${username}'.`,
    )
  }
  const wanted = username.toLowerCase()
  const match = users.find((entry) => {
    const name = (entry as { username?: unknown } | null)?.username
    return typeof name === "string" && name.toLowerCase() === wanted
  }) as { id?: unknown; state?: unknown } | undefined
  if (match === undefined) return null
  if (typeof match.id !== "number" || typeof match.state !== "string") {
    throw gitEffectFailure(
      "completed",
      `GitLab answered user '${username}' without its id or account state.`,
    )
  }
  return { id: match.id, usable: match.state === "active" }
}

export async function isUsableGitLabUser(
  api: Gitlab,
  username: string,
): Promise<boolean> {
  return (await findGitLabUser(api, username))?.usable === true
}

/** The id of the usable account with this username, or `null`. */
export async function resolveGitLabUserId(
  api: Gitlab,
  username: string,
): Promise<number | null> {
  const user = await findGitLabUser(api, username)
  return user?.usable ? user.id : null
}

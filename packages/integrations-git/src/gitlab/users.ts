import type { Gitlab } from "@gitbeaker/rest"

export function isActiveExactMatch(user: unknown, username: string): boolean {
  if (typeof user !== "object" || user === null) {
    return false
  }

  const record = user as {
    username?: unknown
    state?: unknown
  }

  return record.username === username && record.state !== "blocked"
}

export async function resolveGitLabUserId(
  api: Gitlab,
  username: string,
): Promise<number | null> {
  const users = await api.Users.all({ username })
  const match = users.find((user) => isActiveExactMatch(user, username))
  const id = (match as { id?: unknown } | undefined)?.id
  return typeof id === "number" ? id : null
}

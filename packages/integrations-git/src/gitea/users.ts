export function isActiveUser(data: unknown, username: string): boolean {
  if (typeof data !== "object" || data === null) {
    return false
  }

  const user = data as {
    username?: unknown
    active?: unknown
    is_active?: unknown
  }

  const matches = user.username === username
  if (!matches) {
    return false
  }

  if (user.active === false || user.is_active === false) {
    return false
  }

  return true
}

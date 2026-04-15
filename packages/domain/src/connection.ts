export type ConnectionBase = {
  baseUrl: string
  token: string
  userAgent?: string
}

export const DEFAULT_USER_AGENT = "repo-edu"

export function normalizeUserAgent(
  value: string | null | undefined,
): string | undefined {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
}

export function resolveUserAgent(draft: ConnectionBase): string {
  return normalizeUserAgent(draft.userAgent) ?? DEFAULT_USER_AGENT
}

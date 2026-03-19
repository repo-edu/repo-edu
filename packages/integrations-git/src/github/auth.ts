export function withGitHubToken(cloneUrl: string, token: string): string {
  const url = new URL(cloneUrl)
  url.username = "x-access-token"
  url.password = token
  return url.toString()
}

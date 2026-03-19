export function withGitLabToken(cloneUrl: string, token: string): string {
  const url = new URL(cloneUrl)
  url.username = "oauth2"
  url.password = token
  return url.toString()
}

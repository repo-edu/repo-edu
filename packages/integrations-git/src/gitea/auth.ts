export function withGiteaToken(cloneUrl: string, token: string): string {
  const url = new URL(cloneUrl)
  url.username = "token"
  url.password = token
  return url.toString()
}

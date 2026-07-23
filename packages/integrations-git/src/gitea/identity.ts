import type { HttpPort } from "@repo-edu/host-runtime-contract"
import type { GitProviderClient } from "@repo-edu/integrations-git-contract"
import { giteaRequest, resolveApiBase } from "./transport.js"
import { isActiveUser } from "./users.js"

type IdentityCapability = Pick<
  GitProviderClient,
  "verifyConnection" | "verifyGitUsernames"
>

export function createGiteaIdentity(http: HttpPort): IdentityCapability {
  return {
    async verifyConnection(draft, signal) {
      if (!resolveApiBase(draft)) return { verified: false }
      try {
        const { status } = await giteaRequest(
          http,
          draft,
          "GET",
          "/user",
          undefined,
          signal,
        )
        return { verified: status >= 200 && status < 300 }
      } catch {
        return { verified: false }
      }
    },
    async verifyGitUsernames(draft, usernames, signal) {
      if (!resolveApiBase(draft)) {
        return usernames.map((username) => ({ username, exists: false }))
      }
      const results = []
      for (const username of usernames) {
        if (signal?.aborted) break
        try {
          const response = await giteaRequest(
            http,
            draft,
            "GET",
            `/users/${encodeURIComponent(username)}`,
            undefined,
            signal,
          )
          results.push({
            username,
            exists:
              response.status >= 200 &&
              response.status < 300 &&
              isActiveUser(response.data, username),
          })
        } catch {
          results.push({ username, exists: false })
        }
      }
      return results
    },
  }
}

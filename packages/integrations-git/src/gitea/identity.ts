import type { HttpPort } from "@repo-edu/host-runtime-contract"
import type { GitProviderClient } from "@repo-edu/integrations-git-contract"
import { toErrorMessage } from "./errors.js"
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
      const results = []
      for (const username of usernames) {
        if (signal?.aborted) break
        const response = await giteaRequest(
          http,
          draft,
          "GET",
          `/users/${encodeURIComponent(username)}`,
          undefined,
          signal,
        )
        if (response.status === 404) {
          results.push({ username, exists: false })
          continue
        }
        if (response.status < 200 || response.status >= 300) {
          throw new Error(
            `Failed to look up Gitea user '${username}': ${toErrorMessage(response.data) || `HTTP ${response.status}`}`,
          )
        }
        results.push({
          username,
          exists: isActiveUser(response.data, username),
        })
      }
      return results
    },
  }
}

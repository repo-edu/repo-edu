import type { HttpPort } from "@repo-edu/host-runtime-contract"
import type { GitProviderClient } from "@repo-edu/integrations-git-contract"
import { isGitReply } from "../invocation-guard.js"
import { giteaRequest } from "./transport.js"
import { isUsableAccount } from "./users.js"

type IdentityCapability = Pick<
  GitProviderClient,
  "verifyConnection" | "verifyGitUsernames"
>

export function createGiteaIdentity(http: HttpPort): IdentityCapability {
  return {
    async verifyConnection(draft, signal) {
      try {
        await giteaRequest(http, draft, "GET", "/user", undefined, signal)
        return { verified: true }
      } catch {
        return { verified: false }
      }
    },
    async verifyGitUsernames(draft, usernames, signal) {
      const results = []
      for (const username of usernames) {
        if (signal?.aborted) break
        let user: unknown
        try {
          user = await giteaRequest(
            http,
            draft,
            "GET",
            `/users/${encodeURIComponent(username)}`,
            undefined,
            signal,
          )
        } catch (error) {
          if (!isGitReply(error, 404)) throw error
          results.push({ username, exists: false })
          continue
        }
        results.push({ username, exists: isUsableAccount(user, username) })
      }
      return results
    },
  }
}

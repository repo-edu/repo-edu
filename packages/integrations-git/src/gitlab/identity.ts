import type { HttpPort } from "@repo-edu/host-runtime-contract"
import type { GitProviderClient } from "@repo-edu/integrations-git-contract"
import { createGitLabApi } from "./transport.js"
import { isUsableGitLabUser } from "./users.js"

type IdentityCapability = Pick<
  GitProviderClient,
  "verifyConnection" | "verifyGitUsernames"
>

export function createGitLabIdentity(http: HttpPort): IdentityCapability {
  return {
    async verifyConnection(draft, signal) {
      try {
        const user = await createGitLabApi(
          http,
          draft,
          signal,
        ).Users.showCurrentUser()
        return { verified: user !== null && typeof user === "object" }
      } catch {
        return { verified: false }
      }
    },
    async verifyGitUsernames(draft, usernames, signal) {
      const api = createGitLabApi(http, draft, signal)
      const results = []
      for (const username of usernames) {
        if (signal?.aborted) break
        // The search answers absence with no matching account.
        results.push({
          username,
          exists: await isUsableGitLabUser(api, username),
        })
      }
      return results
    },
  }
}

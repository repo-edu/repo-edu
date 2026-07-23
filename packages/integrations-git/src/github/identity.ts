import type { HttpPort } from "@repo-edu/host-runtime-contract"
import type { GitProviderClient } from "@repo-edu/integrations-git-contract"
import { createOctokit } from "./transport.js"

type IdentityCapability = Pick<
  GitProviderClient,
  "verifyConnection" | "verifyGitUsernames"
>

export function createGitHubIdentity(http: HttpPort): IdentityCapability {
  return {
    async verifyConnection(draft, signal) {
      const octokit = createOctokit(http, draft)
      try {
        await octokit.users.getAuthenticated({ request: { signal } })
        return { verified: true }
      } catch {
        return { verified: false }
      }
    },
    async verifyGitUsernames(draft, usernames, signal) {
      const octokit = createOctokit(http, draft)
      const results = []
      for (const username of usernames) {
        if (signal?.aborted) break
        try {
          await octokit.users.getByUsername({ username, request: { signal } })
          results.push({ username, exists: true })
        } catch {
          results.push({ username, exists: false })
        }
      }
      return results
    },
  }
}

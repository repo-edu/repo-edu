import { compileRepoNamePattern } from "@repo-edu/domain/pattern-matching"
import type { HttpPort } from "@repo-edu/host-runtime-contract"
import type {
  GitProviderClient,
  ListRepositoriesResult,
} from "@repo-edu/integrations-git-contract"
import { gitEffectFailure, isGitReply } from "../invocation-guard.js"
import { giteaRequest } from "./transport.js"

type DiscoveryCapability = Pick<GitProviderClient, "listRepositories">

export function createGiteaDiscovery(http: HttpPort): DiscoveryCapability {
  return {
    async listRepositories(draft, request, signal) {
      if (!request.namespace) {
        return { repositories: [] }
      }
      const matches = compileRepoNamePattern(request.filter)
      const repositories: ListRepositoriesResult["repositories"] = []
      const namespace = encodeURIComponent(request.namespace)
      const perPage = 50
      let page = 1
      let tryingOrganization = true
      while (true) {
        if (signal?.aborted) break
        const route = tryingOrganization
          ? `/orgs/${namespace}/repos?limit=${perPage}&page=${page}`
          : `/users/${namespace}/repos?limit=${perPage}&page=${page}`
        let listed: unknown
        try {
          listed = await giteaRequest(
            http,
            draft,
            "GET",
            route,
            undefined,
            signal,
          )
        } catch (error) {
          if (!isGitReply(error, 404) || page !== 1) throw error
          if (tryingOrganization) {
            tryingOrganization = false
            continue
          }
          // An unresolved namespace has no repository result.
          break
        }
        if (!Array.isArray(listed)) {
          throw gitEffectFailure(
            "completed",
            `Gitea answered an unreadable repository list for '${request.namespace}'.`,
          )
        }
        if (listed.length === 0) break
        for (const entry of listed) {
          if (typeof entry !== "object" || entry === null) continue
          const record = entry as Record<string, unknown>
          const name = typeof record.name === "string" ? record.name : ""
          if (!name || !matches(name)) continue
          const archived = Boolean(record.archived)
          if (archived && !request.includeArchived) continue
          repositories.push({ name, identifier: name, archived })
        }
        if (listed.length < perPage) break
        page += 1
      }
      return { repositories }
    },
  }
}

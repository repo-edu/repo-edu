import { compileRepoNamePattern } from "@repo-edu/domain/pattern-matching"
import type { HttpPort } from "@repo-edu/host-runtime-contract"
import type {
  GitProviderClient,
  ListRepositoriesResult,
} from "@repo-edu/integrations-git-contract"
import { isNotFoundError } from "./errors.js"
import { createOctokit } from "./transport.js"

type DiscoveryCapability = Pick<GitProviderClient, "listRepositories">

export function createGitHubDiscovery(http: HttpPort): DiscoveryCapability {
  return {
    async listRepositories(draft, request, signal) {
      const octokit = createOctokit(http, draft)
      const matches = compileRepoNamePattern(request.filter)
      const repositories: ListRepositoriesResult["repositories"] = []
      const collect = async (
        iterator: ReturnType<typeof octokit.paginate.iterator>,
      ) => {
        for await (const page of iterator) {
          if (signal?.aborted) break
          for (const repo of page.data) {
            if (!matches(repo.name)) continue
            const archived = Boolean(repo.archived)
            if (archived && !request.includeArchived) continue
            repositories.push({
              name: repo.name,
              identifier: repo.name,
              archived,
            })
          }
        }
      }
      try {
        await collect(
          octokit.paginate.iterator(octokit.repos.listForOrg, {
            org: request.namespace,
            per_page: 100,
            request: { signal },
          }),
        )
        return { repositories }
      } catch (error) {
        if (!isNotFoundError(error)) throw error
      }
      await collect(
        octokit.paginate.iterator(octokit.repos.listForUser, {
          username: request.namespace,
          per_page: 100,
          request: { signal },
        }),
      )
      return { repositories }
    },
  }
}

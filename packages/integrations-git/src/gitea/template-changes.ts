import type { HttpPort } from "@repo-edu/host-runtime-contract"
import type { GitProviderClient } from "@repo-edu/integrations-git-contract"
import { gitEffectFailure, isGitReply } from "../invocation-guard.js"
import { giteaRequest } from "./transport.js"

type TemplateChangesCapability = Pick<
  GitProviderClient,
  "getRepositoryDefaultBranchHead"
>

export function createGiteaTemplateChanges(
  http: HttpPort,
): TemplateChangesCapability {
  return {
    async getRepositoryDefaultBranchHead(draft, request, signal) {
      const route = `/repos/${encodeURIComponent(request.owner)}/${encodeURIComponent(request.repositoryName)}`
      try {
        const repository = await giteaRequest(
          http,
          draft,
          "GET",
          route,
          undefined,
          signal,
        )
        const branchName = (repository as { default_branch?: unknown } | null)
          ?.default_branch
        if (typeof branchName !== "string") {
          throw gitEffectFailure(
            "completed",
            `Gitea answered repository '${request.owner}/${request.repositoryName}' without its default branch.`,
          )
        }
        // An empty repository answers its default branch with a 404.
        const branch = await giteaRequest(
          http,
          draft,
          "GET",
          `${route}/branches/${encodeURIComponent(branchName)}`,
          undefined,
          signal,
        )
        const commitId = (branch as { commit?: { id?: unknown } | null } | null)
          ?.commit?.id
        if (typeof commitId !== "string") {
          throw gitEffectFailure(
            "completed",
            `Gitea answered branch '${branchName}' of '${request.owner}/${request.repositoryName}' without its commit.`,
          )
        }
        return { sha: commitId, branchName }
      } catch (error) {
        if (isGitReply(error, 404)) return null
        throw error
      }
    },
  }
}

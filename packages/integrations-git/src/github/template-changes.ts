import type { HttpPort } from "@repo-edu/host-runtime-contract"
import type { GitProviderClient } from "@repo-edu/integrations-git-contract"
import { gitEffectFailure, isGitReply } from "../invocation-guard.js"
import { createOctokit } from "./transport.js"

type TemplateChangesCapability = Pick<
  GitProviderClient,
  "getRepositoryDefaultBranchHead"
>

export function createGitHubTemplateChanges(
  http: HttpPort,
): TemplateChangesCapability {
  return {
    async getRepositoryDefaultBranchHead(draft, request, signal) {
      const octokit = createOctokit(http, draft)
      try {
        const repository = await octokit.repos.get({
          owner: request.owner,
          repo: request.repositoryName,
          request: { signal },
        })
        const branchName: unknown = repository.data.default_branch
        if (typeof branchName !== "string") {
          throw gitEffectFailure(
            "completed",
            `GitHub answered repository '${request.owner}/${request.repositoryName}' without its default branch.`,
          )
        }
        // An empty repository answers its default branch with a 404.
        const branch = await octokit.repos.getBranch({
          owner: request.owner,
          repo: request.repositoryName,
          branch: branchName,
          request: { signal },
        })
        const sha: unknown = branch.data.commit?.sha
        if (typeof sha !== "string") {
          throw gitEffectFailure(
            "completed",
            `GitHub answered branch '${branchName}' of '${request.owner}/${request.repositoryName}' without its commit.`,
          )
        }
        return { sha, branchName }
      } catch (error) {
        if (isGitReply(error, 404)) return null
        throw error
      }
    },
  }
}

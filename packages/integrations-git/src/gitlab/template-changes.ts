import type { HttpPort } from "@repo-edu/host-runtime-contract"
import type { GitProviderClient } from "@repo-edu/integrations-git-contract"
import { gitEffectFailure, isGitReply } from "../invocation-guard.js"
import { createGitLabApi } from "./transport.js"

type TemplateChangesCapability = Pick<
  GitProviderClient,
  "getRepositoryDefaultBranchHead"
>

export function createGitLabTemplateChanges(
  http: HttpPort,
): TemplateChangesCapability {
  return {
    async getRepositoryDefaultBranchHead(draft, request, signal) {
      const api = createGitLabApi(http, draft, signal)
      const projectPath = `${request.owner}/${request.repositoryName}`
      try {
        const project = await api.Projects.show(projectPath)
        const projectId = (project as { id?: unknown }).id
        // GitLab leaves out the default branch without read access to code.
        const branchName = (project as { default_branch?: unknown })
          .default_branch
        if (typeof projectId !== "number" || typeof branchName !== "string") {
          throw gitEffectFailure(
            "completed",
            `GitLab answered project '${projectPath}' without its id or default branch.`,
          )
        }
        // An empty repository answers its default branch with a 404.
        const branch = await api.Branches.show(projectId, branchName)
        const commitId = (branch as { commit?: { id?: unknown } | null }).commit
          ?.id
        if (typeof commitId !== "string") {
          throw gitEffectFailure(
            "completed",
            `GitLab answered branch '${branchName}' of '${projectPath}' without its commit.`,
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

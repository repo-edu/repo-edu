import type { HttpPort } from "@repo-edu/host-runtime-contract"
import type { GitProviderClient } from "@repo-edu/integrations-git-contract"
import {
  errorMessage,
  gitEffectFailure,
  isGitReply,
  throwIfGitEffectAborted,
} from "../invocation-guard.js"
import { withGitLabToken } from "./auth.js"
import { isNameTaken } from "./errors.js"
import { resolveGroupId } from "./namespace.js"
import {
  createProject,
  extractProjectCloneUrl,
  extractProjectUrls,
} from "./repository-api.js"
import { createGitLabApi } from "./transport.js"

type RepositoriesCapability = Pick<
  GitProviderClient,
  | "createRepositories"
  | "resolveRepositoryCloneUrls"
  | "getRepositoryDefaultBranchHead"
>

export function createGitLabRepositories(
  http: HttpPort,
): RepositoriesCapability {
  return {
    async createRepositories(draft, request, signal) {
      const api = createGitLabApi(http, draft, signal)
      const namespaceId = await resolveGroupId(api, request.organization)
      if (namespaceId === null) {
        const reason = `GitLab group '${request.organization}' was not found.`
        return {
          created: [],
          alreadyExisted: [],
          failed: request.repositoryNames.map((repositoryName) => ({
            repositoryName,
            reason,
          })),
        }
      }

      const created = []
      const alreadyExisted = []
      const failed = []
      for (const repositoryName of request.repositoryNames) {
        throwIfGitEffectAborted(signal)
        try {
          const urls = await createProject(
            api,
            namespaceId,
            repositoryName,
            request.visibility,
            request.autoInit,
          )
          if (urls === null) {
            failed.push({
              repositoryName,
              reason:
                "GitLab created the repository but answered without its web or clone URL.",
            })
          } else {
            created.push({
              repositoryName,
              repositoryUrl: urls.repositoryUrl,
              cloneUrl: withGitLabToken(urls.cloneUrl, draft.token),
            })
          }
        } catch (error) {
          if (!isGitReply(error)) throw error
          if (isNameTaken(error)) {
            try {
              const project = await api.Projects.show(
                `${request.organization}/${repositoryName}`,
              )
              const urls = extractProjectUrls(project)
              if (urls === null) {
                failed.push({
                  repositoryName,
                  reason:
                    "Repository exists but GitLab answered without its web or clone URL.",
                })
              } else {
                alreadyExisted.push({
                  repositoryName,
                  repositoryUrl: urls.repositoryUrl,
                  cloneUrl: withGitLabToken(urls.cloneUrl, draft.token),
                })
              }
            } catch (lookupError) {
              if (!isGitReply(lookupError)) throw lookupError
              failed.push({
                repositoryName,
                reason: `Repository exists but lookup failed: ${errorMessage(lookupError)}`,
              })
            }
            continue
          }
          failed.push({ repositoryName, reason: error.message })
        }
      }
      return { created, alreadyExisted, failed }
    },
    async resolveRepositoryCloneUrls(draft, request, signal) {
      const api = createGitLabApi(http, draft, signal)
      const resolved = []
      const missing = []
      for (const repositoryName of request.repositoryNames) {
        if (signal?.aborted) break
        let project: unknown
        try {
          project = await api.Projects.show(
            `${request.organization}/${repositoryName}`,
          )
        } catch (error) {
          if (!isGitReply(error, 404)) throw error
          missing.push(repositoryName)
          continue
        }
        const cloneUrl = extractProjectCloneUrl(project)
        if (cloneUrl === null) {
          throw gitEffectFailure(
            "completed",
            `GitLab answered no clone URL for repository '${repositoryName}'.`,
          )
        }
        resolved.push({
          repositoryName,
          cloneUrl: withGitLabToken(cloneUrl, draft.token),
        })
      }
      return { resolved, missing }
    },
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

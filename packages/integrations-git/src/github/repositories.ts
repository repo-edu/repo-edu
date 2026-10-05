import type { HttpPort } from "@repo-edu/host-runtime-contract"
import type { GitProviderClient } from "@repo-edu/integrations-git-contract"
import {
  errorMessage,
  gitEffectFailure,
  isGitReply,
  throwIfGitEffectAborted,
} from "../invocation-guard.js"
import { withGitHubToken } from "./auth.js"
import { isAlreadyExistsError } from "./errors.js"
import { createOctokit } from "./transport.js"

type RepositoryUrls = { repositoryUrl: string; cloneUrl: string }

function readRepositoryUrls(data: {
  html_url?: unknown
  clone_url?: unknown
}): RepositoryUrls | null {
  return typeof data.html_url === "string" && typeof data.clone_url === "string"
    ? { repositoryUrl: data.html_url, cloneUrl: data.clone_url }
    : null
}

type RepositoriesCapability = Pick<
  GitProviderClient,
  | "createRepositories"
  | "resolveRepositoryCloneUrls"
  | "getRepositoryDefaultBranchHead"
>

export function createGitHubRepositories(
  http: HttpPort,
): RepositoriesCapability {
  return {
    async createRepositories(draft, request, signal) {
      const octokit = createOctokit(http, draft)
      const created = []
      const alreadyExisted = []
      const failed = []
      for (const repositoryName of request.repositoryNames) {
        throwIfGitEffectAborted(signal)
        let urls: RepositoryUrls | null
        try {
          const response = await octokit.repos.createInOrg({
            org: request.organization,
            name: repositoryName,
            private: request.visibility !== "public",
            auto_init: request.autoInit,
            request: { signal },
          })
          urls = readRepositoryUrls(response.data)
        } catch (error) {
          if (!isGitReply(error)) throw error
          if (!isAlreadyExistsError(error)) {
            failed.push({ repositoryName, reason: error.message })
            continue
          }
          let existing: RepositoryUrls | null
          try {
            const response = await octokit.repos.get({
              owner: request.organization,
              repo: repositoryName,
              request: { signal },
            })
            existing = readRepositoryUrls(response.data)
          } catch (lookupError) {
            if (!isGitReply(lookupError)) throw lookupError
            failed.push({
              repositoryName,
              reason: `Repository exists but lookup failed: ${errorMessage(lookupError)}`,
            })
            continue
          }
          if (existing === null) {
            failed.push({
              repositoryName,
              reason:
                "Repository exists but GitHub answered without its web or clone URL.",
            })
          } else {
            alreadyExisted.push({
              repositoryName,
              repositoryUrl: existing.repositoryUrl,
              cloneUrl: withGitHubToken(existing.cloneUrl, draft.token),
            })
          }
          continue
        }
        if (urls === null) {
          failed.push({
            repositoryName,
            reason:
              "GitHub created the repository but answered without its web or clone URL.",
          })
          continue
        }
        created.push({
          repositoryName,
          repositoryUrl: urls.repositoryUrl,
          cloneUrl: withGitHubToken(urls.cloneUrl, draft.token),
        })
      }
      return { created, alreadyExisted, failed }
    },
    async resolveRepositoryCloneUrls(draft, request, signal) {
      const octokit = createOctokit(http, draft)
      const resolved = []
      const missing = []
      for (const repositoryName of request.repositoryNames) {
        if (signal?.aborted) break
        let cloneUrl: unknown
        try {
          const response = await octokit.repos.get({
            owner: request.organization,
            repo: repositoryName,
            request: { signal },
          })
          cloneUrl = (response.data as { clone_url?: unknown }).clone_url
        } catch (error) {
          if (!isGitReply(error, 404)) throw error
          missing.push(repositoryName)
          continue
        }
        if (typeof cloneUrl !== "string") {
          throw gitEffectFailure(
            "completed",
            `GitHub answered no clone URL for repository '${repositoryName}'.`,
          )
        }
        resolved.push({
          repositoryName,
          cloneUrl: withGitHubToken(cloneUrl, draft.token),
        })
      }
      return { resolved, missing }
    },
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

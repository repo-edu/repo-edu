import type { HttpPort } from "@repo-edu/host-runtime-contract"
import type { GitProviderClient } from "@repo-edu/integrations-git-contract"
import { withGitHubToken } from "./auth.js"
import {
  isAlreadyExistsError,
  isNotFoundError,
  toErrorMessage,
} from "./errors.js"
import { createOctokit } from "./transport.js"

type RepositoriesCapability = Pick<
  GitProviderClient,
  "createRepositories" | "resolveRepositoryCloneUrls"
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
        if (signal?.aborted) break
        try {
          const response = await octokit.repos.createInOrg({
            org: request.organization,
            name: repositoryName,
            private: request.visibility !== "public",
            auto_init: request.autoInit,
            request: { signal },
          })
          created.push({
            repositoryName,
            repositoryUrl: response.data.html_url,
            cloneUrl: withGitHubToken(response.data.clone_url, draft.token),
          })
        } catch (error) {
          if (isAlreadyExistsError(error)) {
            try {
              const existing = await octokit.repos.get({
                owner: request.organization,
                repo: repositoryName,
                request: { signal },
              })
              alreadyExisted.push({
                repositoryName,
                repositoryUrl: existing.data.html_url,
                cloneUrl: withGitHubToken(existing.data.clone_url, draft.token),
              })
            } catch (lookupError) {
              failed.push({
                repositoryName,
                reason: `Already exists but lookup failed: ${toErrorMessage(lookupError)}`,
              })
            }
            continue
          }
          failed.push({ repositoryName, reason: toErrorMessage(error) })
        }
      }
      return { created, alreadyExisted, failed }
    },
    async resolveRepositoryCloneUrls(draft, request, signal) {
      const octokit = createOctokit(http, draft)
      const resolved = []
      const missing = []
      for (const repositoryName of request.repositoryNames) {
        if (signal?.aborted) break
        try {
          const response = await octokit.repos.get({
            owner: request.organization,
            repo: repositoryName,
            request: { signal },
          })
          resolved.push({
            repositoryName,
            cloneUrl: withGitHubToken(response.data.clone_url, draft.token),
          })
        } catch (error) {
          if (!isNotFoundError(error)) throw error
          missing.push(repositoryName)
        }
      }
      return { resolved, missing }
    },
  }
}

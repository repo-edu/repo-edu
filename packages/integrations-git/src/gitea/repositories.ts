import type { HttpPort } from "@repo-edu/host-runtime-contract"
import type { GitProviderClient } from "@repo-edu/integrations-git-contract"
import { withGiteaToken } from "./auth.js"
import { isAlreadyExists, toErrorMessage } from "./errors.js"
import {
  extractRepositoryCloneUrl,
  extractRepositoryUrls,
  resolveExistingRepositoryUrls,
} from "./repository-api.js"
import { giteaRequest, resolveApiBase } from "./transport.js"

type RepositoriesCapability = Pick<
  GitProviderClient,
  "createRepositories" | "resolveRepositoryCloneUrls"
>

export function createGiteaRepositories(
  http: HttpPort,
): RepositoriesCapability {
  return {
    async createRepositories(draft, request, signal) {
      if (!request.organization || !resolveApiBase(draft)) {
        return { created: [], alreadyExisted: [], failed: [] }
      }
      const created = []
      const alreadyExisted = []
      const failed = []
      for (const repositoryName of request.repositoryNames) {
        if (signal?.aborted) break
        try {
          const response = await giteaRequest(
            http,
            draft,
            "POST",
            `/orgs/${encodeURIComponent(request.organization)}/repos`,
            JSON.stringify({
              name: repositoryName,
              private: request.visibility !== "public",
              auto_init: request.autoInit,
            }),
            signal,
          )
          if (response.status >= 200 && response.status < 300) {
            const urls = extractRepositoryUrls(response.data)
            if (urls === null) {
              failed.push({
                repositoryName,
                reason: "Provider returned incomplete repository URLs.",
              })
            } else {
              created.push({
                repositoryName,
                repositoryUrl: urls.repositoryUrl,
                cloneUrl: withGiteaToken(urls.cloneUrl, draft.token),
              })
            }
            continue
          }
          if (isAlreadyExists(response.status, response.data)) {
            const urls = await resolveExistingRepositoryUrls(
              http,
              draft,
              request.organization,
              repositoryName,
              signal,
            )
            if (urls === null) {
              failed.push({
                repositoryName,
                reason: "Repository exists but URL lookup failed.",
              })
            } else {
              alreadyExisted.push({
                repositoryName,
                repositoryUrl: urls.repositoryUrl,
                cloneUrl: withGiteaToken(urls.cloneUrl, draft.token),
              })
            }
            continue
          }
          failed.push({
            repositoryName,
            reason: toErrorMessage(response.data) || `HTTP ${response.status}`,
          })
        } catch (error) {
          failed.push({
            repositoryName,
            reason: error instanceof Error ? error.message : String(error),
          })
        }
      }
      return { created, alreadyExisted, failed }
    },
    async resolveRepositoryCloneUrls(draft, request, signal) {
      if (!request.organization || !resolveApiBase(draft)) {
        return { resolved: [], missing: [...request.repositoryNames] }
      }
      const resolved = []
      const missing = []
      for (const repositoryName of request.repositoryNames) {
        if (signal?.aborted) break
        const response = await giteaRequest(
          http,
          draft,
          "GET",
          `/repos/${encodeURIComponent(request.organization)}/${encodeURIComponent(repositoryName)}`,
          undefined,
          signal,
        )
        if (response.status === 404) {
          missing.push(repositoryName)
          continue
        }
        if (response.status < 200 || response.status >= 300) {
          throw new Error(
            `Failed to resolve repository '${repositoryName}' (${response.status}).`,
          )
        }
        const cloneUrl = extractRepositoryCloneUrl(response.data)
        if (cloneUrl === null) {
          missing.push(repositoryName)
          continue
        }
        resolved.push({
          repositoryName,
          cloneUrl: withGiteaToken(cloneUrl, draft.token),
        })
      }
      return { resolved, missing }
    },
  }
}

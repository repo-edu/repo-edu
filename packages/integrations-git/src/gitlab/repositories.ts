import type { HttpPort } from "@repo-edu/host-runtime-contract"
import type { GitProviderClient } from "@repo-edu/integrations-git-contract"
import { withGitLabToken } from "./auth.js"
import {
  gitLabErrorMessage,
  isAlreadyExistsError,
  isNotFoundError,
} from "./errors.js"
import { resolveGroupId } from "./namespace.js"
import {
  createProject,
  extractProjectCloneUrl,
  extractProjectUrls,
} from "./repository-api.js"
import { createGitLabApi } from "./transport.js"

type RepositoriesCapability = Pick<
  GitProviderClient,
  "createRepositories" | "resolveRepositoryCloneUrls"
>

export function createGitLabRepositories(
  http: HttpPort,
): RepositoriesCapability {
  return {
    async createRepositories(draft, request, signal) {
      if (!request.organization) {
        return { created: [], alreadyExisted: [], failed: [] }
      }
      const api = createGitLabApi(http, draft, signal)
      let namespaceId: number | null
      try {
        namespaceId = await resolveGroupId(api, request.organization)
      } catch (error) {
        if (!isNotFoundError(error)) throw error
        return { created: [], alreadyExisted: [], failed: [] }
      }
      if (namespaceId === null) {
        return { created: [], alreadyExisted: [], failed: [] }
      }

      const created = []
      const alreadyExisted = []
      const failed = []
      for (const repositoryName of request.repositoryNames) {
        if (signal?.aborted) break
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
              reason: "Provider returned incomplete repository URLs.",
            })
          } else {
            created.push({
              repositoryName,
              repositoryUrl: urls.repositoryUrl,
              cloneUrl: withGitLabToken(urls.cloneUrl, draft.token),
            })
          }
        } catch (error) {
          if (isAlreadyExistsError(error)) {
            try {
              const project = await api.Projects.show(
                `${request.organization}/${repositoryName}`,
              )
              const urls = extractProjectUrls(project)
              if (urls === null) {
                failed.push({
                  repositoryName,
                  reason: "Repository exists but URLs could not be resolved.",
                })
              } else {
                alreadyExisted.push({
                  repositoryName,
                  repositoryUrl: urls.repositoryUrl,
                  cloneUrl: withGitLabToken(urls.cloneUrl, draft.token),
                })
              }
            } catch (lookupError) {
              failed.push({
                repositoryName,
                reason: `Repository exists but lookup failed: ${gitLabErrorMessage(lookupError)}`,
              })
            }
            continue
          }
          failed.push({ repositoryName, reason: gitLabErrorMessage(error) })
        }
      }
      return { created, alreadyExisted, failed }
    },
    async resolveRepositoryCloneUrls(draft, request, signal) {
      if (!request.organization) {
        return { resolved: [], missing: [...request.repositoryNames] }
      }
      const api = createGitLabApi(http, draft, signal)
      const resolved = []
      const missing = []
      for (const repositoryName of request.repositoryNames) {
        if (signal?.aborted) break
        try {
          const project = await api.Projects.show(
            `${request.organization}/${repositoryName}`,
          )
          const cloneUrl = extractProjectCloneUrl(project)
          if (cloneUrl === null) {
            missing.push(repositoryName)
            continue
          }
          resolved.push({
            repositoryName,
            cloneUrl: withGitLabToken(cloneUrl, draft.token),
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

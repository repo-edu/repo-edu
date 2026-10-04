import type { HttpPort } from "@repo-edu/host-runtime-contract"
import type { GitProviderClient } from "@repo-edu/integrations-git-contract"
import {
  errorMessage,
  gitEffectFailure,
  isGitReply,
  throwIfGitEffectAborted,
} from "../invocation-guard.js"
import { withGiteaToken } from "./auth.js"
import { isAlreadyExists } from "./errors.js"
import {
  extractRepositoryCloneUrl,
  extractRepositoryUrls,
  readExistingRepositoryUrls,
} from "./repository-api.js"
import { giteaRequest } from "./transport.js"

type RepositoriesCapability = Pick<
  GitProviderClient,
  "createRepositories" | "resolveRepositoryCloneUrls"
>

export function createGiteaRepositories(
  http: HttpPort,
): RepositoriesCapability {
  return {
    async createRepositories(draft, request, signal) {
      const created = []
      const alreadyExisted = []
      const failed = []
      for (const repositoryName of request.repositoryNames) {
        throwIfGitEffectAborted(signal)
        let repository: unknown
        try {
          repository = await giteaRequest(
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
        } catch (error) {
          if (!isGitReply(error)) throw error
          if (!isAlreadyExists(error)) {
            failed.push({ repositoryName, reason: error.message })
            continue
          }
          let urls: ReturnType<typeof extractRepositoryUrls>
          try {
            urls = await readExistingRepositoryUrls(
              http,
              draft,
              request.organization,
              repositoryName,
              signal,
            )
          } catch (lookupError) {
            if (!isGitReply(lookupError)) throw lookupError
            failed.push({
              repositoryName,
              reason: `Repository exists but lookup failed: ${errorMessage(lookupError)}`,
            })
            continue
          }
          if (urls === null) {
            failed.push({
              repositoryName,
              reason: "Repository exists but URLs could not be resolved.",
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
        const urls = extractRepositoryUrls(repository)
        if (urls === null) {
          failed.push({
            repositoryName,
            reason: "Provider returned incomplete repository URLs.",
          })
          continue
        }
        created.push({
          repositoryName,
          repositoryUrl: urls.repositoryUrl,
          cloneUrl: withGiteaToken(urls.cloneUrl, draft.token),
        })
      }
      return { created, alreadyExisted, failed }
    },
    async resolveRepositoryCloneUrls(draft, request, signal) {
      const resolved = []
      const missing = []
      for (const repositoryName of request.repositoryNames) {
        if (signal?.aborted) break
        let repository: unknown
        try {
          repository = await giteaRequest(
            http,
            draft,
            "GET",
            `/repos/${encodeURIComponent(request.organization)}/${encodeURIComponent(repositoryName)}`,
            undefined,
            signal,
          )
        } catch (error) {
          if (!isGitReply(error, 404)) throw error
          missing.push(repositoryName)
          continue
        }
        const cloneUrl = extractRepositoryCloneUrl(repository)
        if (cloneUrl === null) {
          throw gitEffectFailure(
            "completed",
            `Gitea answered no clone URL for repository '${repositoryName}'.`,
          )
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

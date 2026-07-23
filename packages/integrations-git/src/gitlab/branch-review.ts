import type { HttpPort } from "@repo-edu/host-runtime-contract"
import type { GitProviderClient } from "@repo-edu/integrations-git-contract"
import { gitLabDataMessage, isNoChangesMessage } from "./errors.js"
import { fileExistsInBranch, resolveProjectId } from "./repository-api.js"
import { createGitLabApi, gitLabRestGet, gitLabRestPost } from "./transport.js"

type BranchReviewCapability = Pick<
  GitProviderClient,
  "createBranch" | "createPullRequest"
>

export function createGitLabBranchReview(
  http: HttpPort,
): BranchReviewCapability {
  return {
    async createBranch(draft, request, signal) {
      const api = createGitLabApi(http, draft, signal)
      const projectPath = `${request.owner}/${request.repositoryName}`
      const projectId = await resolveProjectId(api, projectPath)
      if (projectId === null) {
        throw new Error(`GitLab project '${projectPath}' was not found.`)
      }
      const branch = await gitLabRestPost(
        http,
        draft,
        `/projects/${projectId}/repository/branches`,
        { branch: request.branchName, ref: request.baseSha },
        signal,
      )
      if (branch.status < 200 || branch.status >= 300) {
        const message = gitLabDataMessage(branch.data)
        if (!isNoChangesMessage(message)) {
          throw new Error(
            `Failed to create branch '${request.branchName}' (${branch.status}): ${message}`,
          )
        }
      }

      const actions: Array<Record<string, unknown>> = []
      for (const file of request.files) {
        if (signal?.aborted) break
        if (file.status === "removed") {
          if (
            await fileExistsInBranch(
              http,
              draft,
              projectId,
              file.path,
              request.branchName,
              signal,
            )
          ) {
            actions.push({ action: "delete", filePath: file.path })
          }
          continue
        }
        if (file.contentBase64 === null) continue
        const exists = await fileExistsInBranch(
          http,
          draft,
          projectId,
          file.path,
          request.branchName,
          signal,
        )
        actions.push({
          action: exists ? "update" : "create",
          filePath: file.path,
          content: file.contentBase64,
          encoding: "base64",
        })
        if (
          file.previousPath &&
          file.previousPath !== file.path &&
          (await fileExistsInBranch(
            http,
            draft,
            projectId,
            file.previousPath,
            request.branchName,
            signal,
          ))
        ) {
          actions.push({ action: "delete", filePath: file.previousPath })
        }
      }
      if (actions.length === 0) return
      const commit = await gitLabRestPost(
        http,
        draft,
        `/projects/${projectId}/repository/commits`,
        {
          branch: request.branchName,
          commitMessage: request.commitMessage,
          actions,
        },
        signal,
      )
      if (commit.status >= 200 && commit.status < 300) return
      const message = gitLabDataMessage(commit.data)
      if (isNoChangesMessage(message)) return
      throw new Error(
        `Failed to commit template update (${commit.status}): ${message}`,
      )
    },
    async createPullRequest(draft, request, signal) {
      const api = createGitLabApi(http, draft, signal)
      const projectPath = `${request.owner}/${request.repositoryName}`
      const projectId = await resolveProjectId(api, projectPath)
      if (projectId === null) {
        throw new Error(`GitLab project '${projectPath}' was not found.`)
      }
      const response = await gitLabRestPost(
        http,
        draft,
        `/projects/${projectId}/merge_requests`,
        {
          sourceBranch: request.headBranch,
          targetBranch: request.baseBranch,
          title: request.title,
          description: request.body,
        },
        signal,
      )
      if (response.status >= 200 && response.status < 300) {
        const url = (response.data as { web_url?: unknown } | null)?.web_url
        return { url: typeof url === "string" ? url : "", created: true }
      }
      const message = gitLabDataMessage(response.data)
      if (!isNoChangesMessage(message)) {
        throw new Error(
          `Failed to create merge request (${response.status}): ${message}`,
        )
      }
      const existing = await gitLabRestGet(
        http,
        draft,
        `/projects/${projectId}/merge_requests?state=opened&source_branch=${encodeURIComponent(request.headBranch)}&target_branch=${encodeURIComponent(request.baseBranch)}`,
        signal,
      )
      const first = Array.isArray(existing.data) ? existing.data[0] : null
      const url =
        typeof first === "object" && first !== null
          ? (first as { web_url?: unknown }).web_url
          : null
      return {
        url:
          existing.status >= 200 &&
          existing.status < 300 &&
          typeof url === "string"
            ? url
            : "",
        created: false,
      }
    },
  }
}

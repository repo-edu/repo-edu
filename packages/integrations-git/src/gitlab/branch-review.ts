import type { HttpPort } from "@repo-edu/host-runtime-contract"
import type { GitProviderClient } from "@repo-edu/integrations-git-contract"
import {
  gitEffectFailure,
  throwIfGitEffectAborted,
} from "../invocation-guard.js"
import { isBranchAlreadyExists, isMergeRequestAlreadyExists } from "./errors.js"
import { fileExistsInBranch, resolveProjectId } from "./repository-api.js"
import { createGitLabApi, gitLabRestPost } from "./transport.js"

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
        throw gitEffectFailure(
          "completed",
          `GitLab project '${projectPath}' was not found.`,
        )
      }
      try {
        await gitLabRestPost(
          http,
          draft,
          `/projects/${projectId}/repository/branches`,
          { branch: request.branchName, ref: request.baseSha },
          signal,
        )
      } catch (error) {
        if (!isBranchAlreadyExists(error)) throw error
      }

      const existsInBranch = (path: string) =>
        fileExistsInBranch(
          http,
          draft,
          projectId,
          path,
          request.branchName,
          signal,
        )
      const actions: Array<Record<string, unknown>> = []
      for (const file of request.files) {
        throwIfGitEffectAborted(signal)
        if (file.status === "removed") {
          if (await existsInBranch(file.path)) {
            actions.push({ action: "delete", filePath: file.path })
          }
          continue
        }
        if (file.contentBase64 === null) {
          throw gitEffectFailure(
            "completed",
            `Changed file '${file.path}' has no content to write.`,
          )
        }
        actions.push({
          action: (await existsInBranch(file.path)) ? "update" : "create",
          filePath: file.path,
          content: file.contentBase64,
          encoding: "base64",
        })
        if (
          file.previousPath &&
          file.previousPath !== file.path &&
          (await existsInBranch(file.previousPath))
        ) {
          actions.push({ action: "delete", filePath: file.previousPath })
        }
      }
      if (actions.length === 0) return
      await gitLabRestPost(
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
    },
    async createPullRequest(draft, request, signal) {
      const api = createGitLabApi(http, draft, signal)
      const projectPath = `${request.owner}/${request.repositoryName}`
      const projectId = await resolveProjectId(api, projectPath)
      if (projectId === null) {
        throw gitEffectFailure(
          "completed",
          `GitLab project '${projectPath}' was not found.`,
        )
      }
      let created: unknown
      try {
        created = await gitLabRestPost(
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
      } catch (error) {
        if (!isMergeRequestAlreadyExists(error)) throw error
        return { created: false }
      }
      const url = (created as { web_url?: unknown } | null)?.web_url
      if (typeof url !== "string") {
        throw gitEffectFailure(
          "completed",
          `GitLab opened a merge request in '${projectPath}' but answered without its URL.`,
        )
      }
      return { created: true, url }
    },
  }
}

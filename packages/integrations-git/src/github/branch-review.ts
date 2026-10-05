import type { HttpPort } from "@repo-edu/host-runtime-contract"
import type { GitProviderClient } from "@repo-edu/integrations-git-contract"
import {
  gitEffectFailure,
  throwIfGitEffectAborted,
} from "../invocation-guard.js"
import { isAlreadyExistsError, isNoChangesError } from "./errors.js"
import { readRepositoryFileSha } from "./repository-api.js"
import { createOctokit } from "./transport.js"

type BranchReviewCapability = Pick<
  GitProviderClient,
  "createBranch" | "createPullRequest"
>

export function createGitHubBranchReview(
  http: HttpPort,
): BranchReviewCapability {
  return {
    async createBranch(draft, request, signal) {
      const octokit = createOctokit(http, draft)
      const readBranchFileSha = (path: string) =>
        readRepositoryFileSha(
          octokit,
          request.owner,
          request.repositoryName,
          path,
          request.branchName,
          signal,
        )
      const deleteBranchFile = (path: string, sha: string) =>
        octokit.repos.deleteFile({
          owner: request.owner,
          repo: request.repositoryName,
          path,
          branch: request.branchName,
          message: request.commitMessage,
          sha,
          request: { signal },
        })
      try {
        await octokit.git.createRef({
          owner: request.owner,
          repo: request.repositoryName,
          ref: `refs/heads/${request.branchName}`,
          sha: request.baseSha,
          request: { signal },
        })
      } catch (error) {
        if (!isAlreadyExistsError(error)) throw error
      }

      for (const file of request.files) {
        throwIfGitEffectAborted(signal)
        if (file.status === "removed") {
          const sha = await readBranchFileSha(file.path)
          if (sha !== null) await deleteBranchFile(file.path, sha)
          continue
        }
        if (file.contentBase64 === null) {
          throw gitEffectFailure(
            "completed",
            `Changed file '${file.path}' has no content to write.`,
          )
        }
        // Without a blob the write creates the file.
        const sha = await readBranchFileSha(file.path)
        await octokit.repos.createOrUpdateFileContents({
          owner: request.owner,
          repo: request.repositoryName,
          path: file.path,
          branch: request.branchName,
          message: request.commitMessage,
          content: file.contentBase64,
          sha: sha ?? undefined,
          request: { signal },
        })
        if (file.previousPath && file.previousPath !== file.path) {
          const previousSha = await readBranchFileSha(file.previousPath)
          if (previousSha !== null) {
            await deleteBranchFile(file.previousPath, previousSha)
          }
        }
      }
    },
    async createPullRequest(draft, request, signal) {
      const octokit = createOctokit(http, draft)
      let url: unknown
      try {
        const response = await octokit.pulls.create({
          owner: request.owner,
          repo: request.repositoryName,
          title: request.title,
          body: request.body,
          head: request.headBranch,
          base: request.baseBranch,
          request: { signal },
        })
        url = response.data.html_url
      } catch (error) {
        if (!isNoChangesError(error)) throw error
        return { created: false }
      }
      if (typeof url !== "string") {
        throw gitEffectFailure(
          "completed",
          `GitHub opened a pull request in '${request.owner}/${request.repositoryName}' but answered without its URL.`,
        )
      }
      return { created: true, url }
    },
  }
}

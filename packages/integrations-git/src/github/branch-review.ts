import type { HttpPort } from "@repo-edu/host-runtime-contract"
import type { GitProviderClient } from "@repo-edu/integrations-git-contract"
import {
  isAlreadyExistsError,
  isNoChangesError,
  toErrorMessage,
} from "./errors.js"
import {
  readRepositoryFileSha,
  resolveExistingPullRequestUrl,
} from "./repository-api.js"
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
        if (signal?.aborted) break
        if (file.status === "removed") {
          const sha = await readRepositoryFileSha(
            octokit,
            request.owner,
            request.repositoryName,
            file.path,
            request.branchName,
            signal,
          )
          if (sha === null) continue
          await octokit.repos.deleteFile({
            owner: request.owner,
            repo: request.repositoryName,
            path: file.path,
            branch: request.branchName,
            message: request.commitMessage,
            sha,
            request: { signal },
          })
          continue
        }
        if (file.contentBase64 === null) continue
        const sha = await readRepositoryFileSha(
          octokit,
          request.owner,
          request.repositoryName,
          file.path,
          request.branchName,
          signal,
        )
        try {
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
        } catch (error) {
          if (!/content is unchanged/i.test(toErrorMessage(error))) throw error
        }
        if (file.previousPath && file.previousPath !== file.path) {
          const previousSha = await readRepositoryFileSha(
            octokit,
            request.owner,
            request.repositoryName,
            file.previousPath,
            request.branchName,
            signal,
          )
          if (previousSha !== null) {
            await octokit.repos.deleteFile({
              owner: request.owner,
              repo: request.repositoryName,
              path: file.previousPath,
              branch: request.branchName,
              message: request.commitMessage,
              sha: previousSha,
              request: { signal },
            })
          }
        }
      }
    },
    async createPullRequest(draft, request, signal) {
      const octokit = createOctokit(http, draft)
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
        return { url: response.data.html_url, created: true }
      } catch (error) {
        if (!isNoChangesError(error)) throw error
        const url = await resolveExistingPullRequestUrl(
          octokit,
          request.owner,
          request.repositoryName,
          request.headBranch,
          request.baseBranch,
          signal,
        )
        return { url: url ?? "", created: false }
      }
    },
  }
}

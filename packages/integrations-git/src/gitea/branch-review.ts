import type { HttpPort } from "@repo-edu/host-runtime-contract"
import type {
  GitConnectionDraft,
  GitProviderClient,
} from "@repo-edu/integrations-git-contract"
import {
  gitEffectFailure,
  isGitReply,
  throwIfGitEffectAborted,
} from "../invocation-guard.js"
import { isBranchAlreadyExists, isPullRequestAlreadyExists } from "./errors.js"
import { readFileSha } from "./repository-api.js"
import { giteaRequest } from "./transport.js"

type BranchReviewCapability = Pick<
  GitProviderClient,
  "createBranch" | "createPullRequest"
>

/** A file already gone from the branch needs no delete. */
async function deleteBranchFile(
  http: HttpPort,
  draft: GitConnectionDraft,
  route: string,
  path: string,
  sha: string,
  branchName: string,
  commitMessage: string,
  signal?: AbortSignal,
): Promise<void> {
  try {
    await giteaRequest(
      http,
      draft,
      "DELETE",
      `${route}/contents/${encodeURIComponent(path)}`,
      JSON.stringify({ branch: branchName, message: commitMessage, sha }),
      signal,
    )
  } catch (error) {
    if (!isGitReply(error, 404)) throw error
  }
}

export function createGiteaBranchReview(
  http: HttpPort,
): BranchReviewCapability {
  return {
    async createBranch(draft, request, signal) {
      const route = `/repos/${encodeURIComponent(request.owner)}/${encodeURIComponent(request.repositoryName)}`
      const readBranchFileSha = (path: string) =>
        readFileSha(
          http,
          draft,
          request.owner,
          request.repositoryName,
          path,
          request.branchName,
          signal,
        )
      try {
        await giteaRequest(
          http,
          draft,
          "POST",
          `${route}/branches`,
          JSON.stringify({
            new_branch_name: request.branchName,
            old_ref_name: request.baseSha,
          }),
          signal,
        )
      } catch (error) {
        if (!isBranchAlreadyExists(error)) throw error
      }
      for (const file of request.files) {
        throwIfGitEffectAborted(signal)
        if (file.status === "removed") {
          const sha = await readBranchFileSha(file.path)
          if (sha === null) continue
          await deleteBranchFile(
            http,
            draft,
            route,
            file.path,
            sha,
            request.branchName,
            request.commitMessage,
            signal,
          )
        } else {
          if (file.contentBase64 === null) {
            throw gitEffectFailure(
              "completed",
              `Changed file '${file.path}' has no content to write.`,
            )
          }
          // Without a blob the write creates the file.
          const sha = await readBranchFileSha(file.path)
          await giteaRequest(
            http,
            draft,
            "PUT",
            `${route}/contents/${encodeURIComponent(file.path)}`,
            JSON.stringify({
              branch: request.branchName,
              message: request.commitMessage,
              content: file.contentBase64,
              ...(sha === null ? {} : { sha }),
            }),
            signal,
          )
        }
        if (file.previousPath && file.previousPath !== file.path) {
          const previousSha = await readBranchFileSha(file.previousPath)
          if (previousSha !== null) {
            await deleteBranchFile(
              http,
              draft,
              route,
              file.previousPath,
              previousSha,
              request.branchName,
              request.commitMessage,
              signal,
            )
          }
        }
      }
    },
    async createPullRequest(draft, request, signal) {
      let created: unknown
      try {
        created = await giteaRequest(
          http,
          draft,
          "POST",
          `/repos/${encodeURIComponent(request.owner)}/${encodeURIComponent(request.repositoryName)}/pulls`,
          JSON.stringify({
            head: request.headBranch,
            base: request.baseBranch,
            title: request.title,
            body: request.body,
          }),
          signal,
        )
      } catch (error) {
        if (!isPullRequestAlreadyExists(error)) throw error
        return { created: false }
      }
      const url = (created as { html_url?: unknown } | null)?.html_url
      if (typeof url !== "string") {
        throw gitEffectFailure(
          "completed",
          `Gitea opened a pull request in '${request.owner}/${request.repositoryName}' but answered without its URL.`,
        )
      }
      return { created: true, url }
    },
  }
}

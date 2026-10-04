import type { HttpPort } from "@repo-edu/host-runtime-contract"
import type {
  GitConnectionDraft,
  GitProviderClient,
} from "@repo-edu/integrations-git-contract"
import { isGitReply, throwIfGitEffectAborted } from "../invocation-guard.js"
import { isNoChanges } from "./errors.js"
import { readRepositoryFile } from "./repository-api.js"
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
      const readBranchFile = (path: string) =>
        readRepositoryFile(
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
            old_ref: request.baseSha,
          }),
          signal,
        )
      } catch (error) {
        if (!isNoChanges(error)) throw error
      }
      for (const file of request.files) {
        throwIfGitEffectAborted(signal)
        if (file.status === "removed") {
          const existing = await readBranchFile(file.path)
          if (existing.sha === null) continue
          await deleteBranchFile(
            http,
            draft,
            route,
            file.path,
            existing.sha,
            request.branchName,
            request.commitMessage,
            signal,
          )
        } else if (file.contentBase64 !== null) {
          const existing = await readBranchFile(file.path)
          try {
            await giteaRequest(
              http,
              draft,
              "PUT",
              `${route}/contents/${encodeURIComponent(file.path)}`,
              JSON.stringify({
                branch: request.branchName,
                message: request.commitMessage,
                content: file.contentBase64,
                ...(existing.sha ? { sha: existing.sha } : {}),
              }),
              signal,
            )
          } catch (error) {
            if (!isNoChanges(error)) throw error
          }
        }
        if (file.previousPath && file.previousPath !== file.path) {
          const previous = await readBranchFile(file.previousPath)
          if (previous.sha !== null) {
            await deleteBranchFile(
              http,
              draft,
              route,
              file.previousPath,
              previous.sha,
              request.branchName,
              request.commitMessage,
              signal,
            )
          }
        }
      }
    },
    async createPullRequest(draft, request, signal) {
      const route = `/repos/${encodeURIComponent(request.owner)}/${encodeURIComponent(request.repositoryName)}/pulls`
      try {
        const created = await giteaRequest(
          http,
          draft,
          "POST",
          route,
          JSON.stringify({
            head: request.headBranch,
            base: request.baseBranch,
            title: request.title,
            body: request.body,
          }),
          signal,
        )
        const url = (created as { html_url?: unknown } | null)?.html_url
        return { url: typeof url === "string" ? url : "", created: true }
      } catch (error) {
        if (!isNoChanges(error)) throw error
      }
      const open = await giteaRequest(
        http,
        draft,
        "GET",
        `${route}?state=open`,
        undefined,
        signal,
      )
      const pullRequest = Array.isArray(open)
        ? open.find((entry) => {
            if (typeof entry !== "object" || entry === null) return false
            const candidate = entry as {
              head?: { label?: unknown } | null
              base?: { ref?: unknown } | null
            }
            return (
              candidate.base?.ref === request.baseBranch &&
              typeof candidate.head?.label === "string" &&
              candidate.head.label.endsWith(`:${request.headBranch}`)
            )
          })
        : null
      const url =
        typeof pullRequest === "object" && pullRequest !== null
          ? (pullRequest as { html_url?: unknown }).html_url
          : null
      return { url: typeof url === "string" ? url : "", created: false }
    },
  }
}

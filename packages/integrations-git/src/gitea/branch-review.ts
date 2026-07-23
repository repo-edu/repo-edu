import type { HttpPort } from "@repo-edu/host-runtime-contract"
import type { GitProviderClient } from "@repo-edu/integrations-git-contract"
import { isNoChangesMessage, toErrorMessage } from "./errors.js"
import { readRepositoryFile } from "./repository-api.js"
import { giteaRequest, resolveApiBase } from "./transport.js"

type BranchReviewCapability = Pick<
  GitProviderClient,
  "createBranch" | "createPullRequest"
>

export function createGiteaBranchReview(
  http: HttpPort,
): BranchReviewCapability {
  return {
    async createBranch(draft, request, signal) {
      if (!resolveApiBase(draft)) throw new Error("Gitea baseUrl is required.")
      const route = `/repos/${encodeURIComponent(request.owner)}/${encodeURIComponent(request.repositoryName)}`
      const branch = await giteaRequest(
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
      if (branch.status < 200 || branch.status >= 300) {
        const message = toErrorMessage(branch.data)
        if (!isNoChangesMessage(message)) {
          throw new Error(
            `Failed to create branch '${request.branchName}' (${branch.status}).`,
          )
        }
      }
      for (const file of request.files) {
        if (signal?.aborted) break
        if (file.status === "removed") {
          const existing = await readRepositoryFile(
            http,
            draft,
            request.owner,
            request.repositoryName,
            file.path,
            request.branchName,
            signal,
          )
          if (existing.sha === null) continue
          const removed = await giteaRequest(
            http,
            draft,
            "DELETE",
            `${route}/contents/${encodeURIComponent(file.path)}`,
            JSON.stringify({
              branch: request.branchName,
              message: request.commitMessage,
              sha: existing.sha,
            }),
            signal,
          )
          if (
            (removed.status < 200 || removed.status >= 300) &&
            removed.status !== 404
          ) {
            throw new Error(
              `Failed to delete '${file.path}' (${removed.status}).`,
            )
          }
        } else if (file.contentBase64 !== null) {
          const existing = await readRepositoryFile(
            http,
            draft,
            request.owner,
            request.repositoryName,
            file.path,
            request.branchName,
            signal,
          )
          const upsert = await giteaRequest(
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
          if (upsert.status < 200 || upsert.status >= 300) {
            const message = toErrorMessage(upsert.data)
            if (!isNoChangesMessage(message)) {
              throw new Error(
                `Failed to update '${file.path}' (${upsert.status}).`,
              )
            }
          }
        }
        if (file.previousPath && file.previousPath !== file.path) {
          const previous = await readRepositoryFile(
            http,
            draft,
            request.owner,
            request.repositoryName,
            file.previousPath,
            request.branchName,
            signal,
          )
          if (previous.sha !== null) {
            await giteaRequest(
              http,
              draft,
              "DELETE",
              `${route}/contents/${encodeURIComponent(file.previousPath)}`,
              JSON.stringify({
                branch: request.branchName,
                message: request.commitMessage,
                sha: previous.sha,
              }),
              signal,
            )
          }
        }
      }
    },
    async createPullRequest(draft, request, signal) {
      if (!resolveApiBase(draft)) throw new Error("Gitea baseUrl is required.")
      const route = `/repos/${encodeURIComponent(request.owner)}/${encodeURIComponent(request.repositoryName)}/pulls`
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
      if (created.status >= 200 && created.status < 300) {
        const url = (created.data as { html_url?: unknown } | null)?.html_url
        return { url: typeof url === "string" ? url : "", created: true }
      }
      const message = toErrorMessage(created.data)
      if (!isNoChangesMessage(message)) {
        throw new Error(
          `Failed to create Gitea pull request (${created.status}): ${message || "unknown error"}`,
        )
      }
      const existing = await giteaRequest(
        http,
        draft,
        "GET",
        `${route}?state=open`,
        undefined,
        signal,
      )
      const pullRequest = Array.isArray(existing.data)
        ? existing.data.find((entry) => {
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

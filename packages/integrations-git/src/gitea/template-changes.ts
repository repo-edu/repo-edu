import type { HttpPort } from "@repo-edu/host-runtime-contract"
import type {
  GitProviderClient,
  PatchFile,
} from "@repo-edu/integrations-git-contract"
import { gitEffectFailure, isGitReply } from "../invocation-guard.js"
import {
  normalizeTemplateDiffStatus,
  readRepositoryFile,
} from "./repository-api.js"
import { giteaRequest } from "./transport.js"

type TemplateChangesCapability = Pick<
  GitProviderClient,
  "getRepositoryDefaultBranchHead" | "getTemplateDiff"
>

export function createGiteaTemplateChanges(
  http: HttpPort,
): TemplateChangesCapability {
  return {
    async getRepositoryDefaultBranchHead(draft, request, signal) {
      const route = `/repos/${encodeURIComponent(request.owner)}/${encodeURIComponent(request.repositoryName)}`
      try {
        const repository = await giteaRequest(
          http,
          draft,
          "GET",
          route,
          undefined,
          signal,
        )
        const branchName = (repository as { default_branch?: unknown } | null)
          ?.default_branch
        if (typeof branchName !== "string") return null
        const branch = await giteaRequest(
          http,
          draft,
          "GET",
          `${route}/branches/${encodeURIComponent(branchName)}`,
          undefined,
          signal,
        )
        const commitId = (branch as { commit?: { id?: unknown } | null } | null)
          ?.commit?.id
        return typeof commitId === "string"
          ? { sha: commitId, branchName }
          : null
      } catch (error) {
        if (isGitReply(error, 404)) return null
        throw error
      }
    },
    async getTemplateDiff(draft, request, signal) {
      let compare: unknown
      try {
        compare = await giteaRequest(
          http,
          draft,
          "GET",
          `/repos/${encodeURIComponent(request.owner)}/${encodeURIComponent(request.repositoryName)}/compare/${encodeURIComponent(request.fromSha)}...${encodeURIComponent(request.toSha)}`,
          undefined,
          signal,
        )
      } catch (error) {
        if (isGitReply(error, 404)) return null
        throw error
      }
      const changedFiles = (compare as { files?: unknown } | null)?.files
      if (!Array.isArray(changedFiles)) {
        throw gitEffectFailure(
          "completed",
          "Gitea answered a template compare without its changed files.",
        )
      }
      const files: PatchFile[] = []
      for (const entry of changedFiles) {
        const file = (entry ?? {}) as {
          filename?: unknown
          previous_filename?: unknown
          status?: unknown
        }
        if (typeof file.filename !== "string") {
          throw gitEffectFailure(
            "completed",
            "Gitea answered a changed template file without its path.",
          )
        }
        const status = normalizeTemplateDiffStatus(String(file.status ?? ""))
        let contentBase64: string | null = null
        if (status !== "removed") {
          contentBase64 = (
            await readRepositoryFile(
              http,
              draft,
              request.owner,
              request.repositoryName,
              file.filename,
              request.toSha,
              signal,
            )
          ).contentBase64
          if (contentBase64 === null) {
            throw gitEffectFailure(
              "completed",
              `Template file '${file.filename}' has no file content at ${request.toSha.slice(0, 7)}, so the update cannot carry it.`,
            )
          }
        }
        files.push({
          path: file.filename,
          previousPath:
            typeof file.previous_filename === "string"
              ? file.previous_filename
              : null,
          status,
          contentBase64,
        })
      }
      return { files }
    },
  }
}

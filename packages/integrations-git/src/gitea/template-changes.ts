import type { HttpPort } from "@repo-edu/host-runtime-contract"
import type {
  GitProviderClient,
  PatchFile,
} from "@repo-edu/integrations-git-contract"
import {
  normalizeTemplateDiffStatus,
  readRepositoryFile,
} from "./repository-api.js"
import { giteaRequest, resolveApiBase } from "./transport.js"

type TemplateChangesCapability = Pick<
  GitProviderClient,
  "getRepositoryDefaultBranchHead" | "getTemplateDiff"
>

export function createGiteaTemplateChanges(
  http: HttpPort,
): TemplateChangesCapability {
  return {
    async getRepositoryDefaultBranchHead(draft, request, signal) {
      if (!resolveApiBase(draft)) return null
      const repository = await giteaRequest(
        http,
        draft,
        "GET",
        `/repos/${encodeURIComponent(request.owner)}/${encodeURIComponent(request.repositoryName)}`,
        undefined,
        signal,
      )
      if (repository.status === 404) return null
      if (repository.status < 200 || repository.status >= 300) {
        throw new Error(
          `Failed to resolve repository '${request.owner}/${request.repositoryName}' (${repository.status}).`,
        )
      }
      const branchName = (
        repository.data as { default_branch?: unknown } | null
      )?.default_branch
      if (typeof branchName !== "string") return null
      const branch = await giteaRequest(
        http,
        draft,
        "GET",
        `/repos/${encodeURIComponent(request.owner)}/${encodeURIComponent(request.repositoryName)}/branches/${encodeURIComponent(branchName)}`,
        undefined,
        signal,
      )
      if (branch.status === 404) return null
      if (branch.status < 200 || branch.status >= 300) {
        throw new Error(
          `Failed to resolve branch '${branchName}' (${branch.status}).`,
        )
      }
      const commitId = (
        branch.data as { commit?: { id?: unknown } | null } | null
      )?.commit?.id
      return typeof commitId === "string" ? { sha: commitId, branchName } : null
    },
    async getTemplateDiff(draft, request, signal) {
      if (!resolveApiBase(draft)) return null
      const compare = await giteaRequest(
        http,
        draft,
        "GET",
        `/repos/${encodeURIComponent(request.owner)}/${encodeURIComponent(request.repositoryName)}/compare/${encodeURIComponent(request.fromSha)}...${encodeURIComponent(request.toSha)}`,
        undefined,
        signal,
      )
      if (compare.status === 404) return null
      if (compare.status < 200 || compare.status >= 300) {
        throw new Error(
          `Failed to compare template commits (${compare.status}).`,
        )
      }
      const changedFiles = (compare.data as { files?: unknown } | null)?.files
      if (!Array.isArray(changedFiles)) return { files: [] }
      const files: PatchFile[] = []
      for (const entry of changedFiles) {
        if (typeof entry !== "object" || entry === null) continue
        const file = entry as {
          filename?: unknown
          previous_filename?: unknown
          status?: unknown
        }
        if (typeof file.filename !== "string") continue
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
          if (contentBase64 === null) continue
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

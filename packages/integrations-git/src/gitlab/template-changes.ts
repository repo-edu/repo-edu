import type { HttpPort } from "@repo-edu/host-runtime-contract"
import type {
  GitProviderClient,
  PatchFile,
} from "@repo-edu/integrations-git-contract"
import { gitLabDataMessage, isNotFoundError } from "./errors.js"
import {
  normalizeTemplateDiffStatus,
  toBase64FromGitLabFile,
} from "./repository-api.js"
import { createGitLabApi, gitLabRestGet } from "./transport.js"

type TemplateChangesCapability = Pick<
  GitProviderClient,
  "getRepositoryDefaultBranchHead" | "getTemplateDiff"
>

export function createGitLabTemplateChanges(
  http: HttpPort,
): TemplateChangesCapability {
  return {
    async getRepositoryDefaultBranchHead(draft, request, signal) {
      const api = createGitLabApi(http, draft, signal)
      const projectPath = `${request.owner}/${request.repositoryName}`
      try {
        const project = await api.Projects.show(projectPath)
        const projectId = (project as { id?: unknown }).id
        const branchName = (project as { default_branch?: unknown })
          .default_branch
        if (typeof projectId !== "number" || typeof branchName !== "string") {
          return null
        }
        const branch = await api.Branches.show(projectId, branchName)
        const commitId = (branch as { commit?: { id?: unknown } | null }).commit
          ?.id
        return typeof commitId === "string"
          ? { sha: commitId, branchName }
          : null
      } catch (error) {
        if (isNotFoundError(error)) return null
        throw error
      }
    },
    async getTemplateDiff(draft, request, signal) {
      const projectPath = `${request.owner}/${request.repositoryName}`
      const encodedProjectPath = encodeURIComponent(projectPath)
      const compare = await gitLabRestGet(
        http,
        draft,
        `/projects/${encodedProjectPath}/repository/compare?from=${encodeURIComponent(request.fromSha)}&to=${encodeURIComponent(request.toSha)}`,
        signal,
      )
      if (compare.status === 404) return null
      if (compare.status < 200 || compare.status >= 300) {
        throw new Error(
          `Failed to compare template commits (${compare.status}): ${gitLabDataMessage(compare.data)}`,
        )
      }
      const rawDiffs =
        typeof compare.data === "object" && compare.data !== null
          ? (compare.data as { diffs?: unknown }).diffs
          : null
      if (!Array.isArray(rawDiffs)) return { files: [] }
      const files: PatchFile[] = []
      for (const rawDiff of rawDiffs) {
        if (typeof rawDiff !== "object" || rawDiff === null) continue
        const diff = rawDiff as Record<string, unknown>
        const path =
          typeof diff.new_path === "string"
            ? diff.new_path
            : typeof diff.old_path === "string"
              ? diff.old_path
              : ""
        if (path === "") continue
        const status = normalizeTemplateDiffStatus(diff)
        let contentBase64: string | null = null
        if (status !== "removed") {
          const file = await gitLabRestGet(
            http,
            draft,
            `/projects/${encodedProjectPath}/repository/files/${encodeURIComponent(path)}?ref=${encodeURIComponent(request.toSha)}`,
            signal,
          )
          if (file.status === 404) continue
          if (file.status < 200 || file.status >= 300) {
            throw new Error(
              `Failed to read template file '${path}' (${file.status}).`,
            )
          }
          contentBase64 = toBase64FromGitLabFile(file.data)
          if (contentBase64 === null) continue
        }
        files.push({
          path,
          previousPath:
            typeof diff.old_path === "string" ? diff.old_path : null,
          status,
          contentBase64,
        })
      }
      return { files }
    },
  }
}

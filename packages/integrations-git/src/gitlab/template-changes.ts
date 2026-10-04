import type { HttpPort } from "@repo-edu/host-runtime-contract"
import type {
  GitProviderClient,
  PatchFile,
} from "@repo-edu/integrations-git-contract"
import { gitEffectFailure, isGitReply } from "../invocation-guard.js"
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
        if (isGitReply(error, 404)) return null
        throw error
      }
    },
    async getTemplateDiff(draft, request, signal) {
      const encodedProjectPath = encodeURIComponent(
        `${request.owner}/${request.repositoryName}`,
      )
      let compare: unknown
      try {
        compare = await gitLabRestGet(
          http,
          draft,
          `/projects/${encodedProjectPath}/repository/compare?from=${encodeURIComponent(request.fromSha)}&to=${encodeURIComponent(request.toSha)}`,
          signal,
        )
      } catch (error) {
        if (isGitReply(error, 404)) return null
        throw error
      }
      const rawDiffs = (compare as { diffs?: unknown } | null)?.diffs
      if (!Array.isArray(rawDiffs)) {
        throw gitEffectFailure(
          "completed",
          "GitLab answered a template compare without its changed files.",
        )
      }
      const files: PatchFile[] = []
      for (const rawDiff of rawDiffs) {
        const diff = (rawDiff ?? {}) as Record<string, unknown>
        const path =
          typeof diff.new_path === "string"
            ? diff.new_path
            : typeof diff.old_path === "string"
              ? diff.old_path
              : ""
        if (path === "") {
          throw gitEffectFailure(
            "completed",
            "GitLab answered a changed template file without its path.",
          )
        }
        const status = normalizeTemplateDiffStatus(diff)
        let contentBase64: string | null = null
        if (status !== "removed") {
          let file: unknown = null
          try {
            file = await gitLabRestGet(
              http,
              draft,
              `/projects/${encodedProjectPath}/repository/files/${encodeURIComponent(path)}?ref=${encodeURIComponent(request.toSha)}`,
              signal,
            )
          } catch (error) {
            if (!isGitReply(error, 404)) throw error
          }
          contentBase64 = toBase64FromGitLabFile(file)
          if (contentBase64 === null) {
            throw gitEffectFailure(
              "completed",
              `Template file '${path}' has no file content at ${request.toSha.slice(0, 7)}, so the update cannot carry it.`,
            )
          }
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

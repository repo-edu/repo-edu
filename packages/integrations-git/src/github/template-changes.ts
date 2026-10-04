import type { HttpPort } from "@repo-edu/host-runtime-contract"
import type {
  GitProviderClient,
  PatchFile,
} from "@repo-edu/integrations-git-contract"
import { gitEffectFailure, isGitReply } from "../invocation-guard.js"
import {
  normalizeTemplateDiffStatus,
  readRepositoryFileBase64,
} from "./repository-api.js"
import { createOctokit } from "./transport.js"

type TemplateChangesCapability = Pick<
  GitProviderClient,
  "getRepositoryDefaultBranchHead" | "getTemplateDiff"
>

export function createGitHubTemplateChanges(
  http: HttpPort,
): TemplateChangesCapability {
  return {
    async getRepositoryDefaultBranchHead(draft, request, signal) {
      const octokit = createOctokit(http, draft)
      try {
        const repository = await octokit.repos.get({
          owner: request.owner,
          repo: request.repositoryName,
          request: { signal },
        })
        const branchName = repository.data.default_branch
        const branch = await octokit.repos.getBranch({
          owner: request.owner,
          repo: request.repositoryName,
          branch: branchName,
          request: { signal },
        })
        return { sha: branch.data.commit.sha, branchName }
      } catch (error) {
        if (isGitReply(error, 404)) return null
        throw error
      }
    },
    async getTemplateDiff(draft, request, signal) {
      const octokit = createOctokit(http, draft)
      let changedFiles: Array<{
        filename: string
        status: string
        previous_filename?: string
      }>
      try {
        const compare = await octokit.repos.compareCommits({
          owner: request.owner,
          repo: request.repositoryName,
          base: request.fromSha,
          head: request.toSha,
          request: { signal },
        })
        if (!Array.isArray(compare.data.files)) {
          throw gitEffectFailure(
            "completed",
            "GitHub answered a template compare without its changed files.",
          )
        }
        changedFiles = compare.data.files
      } catch (error) {
        if (isGitReply(error, 404)) return null
        throw error
      }
      const files: PatchFile[] = []
      for (const changedFile of changedFiles) {
        const status = normalizeTemplateDiffStatus(changedFile.status)
        const path = changedFile.filename
        let contentBase64: string | null = null
        if (status !== "removed") {
          contentBase64 = await readRepositoryFileBase64(
            octokit,
            request.owner,
            request.repositoryName,
            path,
            request.toSha,
            signal,
          )
          if (contentBase64 === null) {
            throw gitEffectFailure(
              "completed",
              `Template file '${path}' has no file content at ${request.toSha.slice(0, 7)}, so the update cannot carry it.`,
            )
          }
        }
        files.push({
          path,
          previousPath: changedFile.previous_filename ?? null,
          status,
          contentBase64,
        })
      }
      return { files }
    },
  }
}

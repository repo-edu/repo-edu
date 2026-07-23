import type { HttpPort } from "@repo-edu/host-runtime-contract"
import type {
  GitProviderClient,
  PatchFile,
} from "@repo-edu/integrations-git-contract"
import { isNotFoundError } from "./errors.js"
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
        if (isNotFoundError(error)) return null
        throw error
      }
    },
    async getTemplateDiff(draft, request, signal) {
      const octokit = createOctokit(http, draft)
      try {
        const compare = await octokit.repos.compareCommits({
          owner: request.owner,
          repo: request.repositoryName,
          base: request.fromSha,
          head: request.toSha,
          request: { signal },
        })
        const files: PatchFile[] = []
        for (const changedFile of compare.data.files ?? []) {
          if (!changedFile.filename) continue
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
            if (contentBase64 === null) continue
          }
          files.push({
            path,
            previousPath: changedFile.previous_filename ?? null,
            status,
            contentBase64,
          })
        }
        return { files }
      } catch (error) {
        if (isNotFoundError(error)) return null
        throw error
      }
    },
  }
}

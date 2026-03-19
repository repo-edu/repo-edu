import type { HttpPort } from "@repo-edu/host-runtime-contract"
import type {
  AssignRepositoriesToTeamRequest,
  CreateBranchRequest,
  CreatePullRequestRequest,
  CreatePullRequestResult,
  CreateRepositoriesRequest,
  CreateRepositoriesResult,
  CreateTeamRequest,
  CreateTeamResult,
  GetTemplateDiffRequest,
  GetTemplateDiffResult,
  GitConnectionDraft,
  GitProviderClient,
  GitUsernameStatus,
  PatchFile,
  RepositoryHead,
  RepositoryHeadRequest,
  ResolveRepositoryCloneUrlsRequest,
  ResolveRepositoryCloneUrlsResult,
} from "@repo-edu/integrations-git-contract"
import { withGitHubToken } from "./auth.js"
import {
  isAlreadyExistsError,
  isNoChangesError,
  isNotFoundError,
  toErrorMessage,
  toErrorStatus,
} from "./errors.js"
import {
  normalizeTemplateDiffStatus,
  readRepositoryFileBase64,
  readRepositoryFileSha,
  resolveExistingPullRequestUrl,
} from "./repositories.js"
import { mapTeamPermission, mapTeamRole, teamSlugFromName } from "./teams.js"
import { createOctokit } from "./transport.js"

export function createGitHubClient(http: HttpPort): GitProviderClient {
  return {
    async verifyConnection(
      draft: GitConnectionDraft,
      signal?: AbortSignal,
    ): Promise<{ verified: boolean }> {
      const octokit = createOctokit(http, draft)

      try {
        await octokit.users.getAuthenticated({
          request: { signal },
        })
        return { verified: true }
      } catch {
        return { verified: false }
      }
    },

    async verifyGitUsernames(
      draft: GitConnectionDraft,
      usernames: string[],
      signal?: AbortSignal,
    ): Promise<GitUsernameStatus[]> {
      const octokit = createOctokit(http, draft)
      const results: GitUsernameStatus[] = []

      for (const username of usernames) {
        if (signal?.aborted) break

        try {
          await octokit.users.getByUsername({
            username,
            request: { signal },
          })
          results.push({ username, exists: true })
        } catch {
          results.push({ username, exists: false })
        }
      }

      return results
    },

    async createRepositories(
      draft: GitConnectionDraft,
      request: CreateRepositoriesRequest,
      signal?: AbortSignal,
    ): Promise<CreateRepositoriesResult> {
      const octokit = createOctokit(http, draft)
      const created: CreateRepositoriesResult["created"] = []
      const alreadyExisted: CreateRepositoriesResult["alreadyExisted"] = []
      const failed: CreateRepositoriesResult["failed"] = []

      for (const repoName of request.repositoryNames) {
        if (signal?.aborted) break

        try {
          const response = await octokit.repos.createInOrg({
            org: request.organization,
            name: repoName,
            private: request.visibility !== "public",
            auto_init: request.autoInit,
            request: { signal },
          })
          const repositoryUrl = response.data.html_url
          created.push({
            repositoryName: repoName,
            repositoryUrl,
          })
        } catch (error) {
          if (isAlreadyExistsError(error)) {
            try {
              const existing = await octokit.repos.get({
                owner: request.organization,
                repo: repoName,
                request: { signal },
              })
              alreadyExisted.push({
                repositoryName: repoName,
                repositoryUrl: existing.data.html_url,
              })
              continue
            } catch (lookupError) {
              failed.push({
                repositoryName: repoName,
                reason: `Already exists but lookup failed: ${toErrorMessage(lookupError)}`,
              })
              continue
            }
          }

          failed.push({
            repositoryName: repoName,
            reason: toErrorMessage(error),
          })
        }
      }

      return {
        created,
        alreadyExisted,
        failed,
      }
    },
    async createTeam(
      draft: GitConnectionDraft,
      request: CreateTeamRequest,
      signal?: AbortSignal,
    ): Promise<CreateTeamResult> {
      const octokit = createOctokit(http, draft)
      let created = true
      let teamSlug = ""

      try {
        const response = await octokit.teams.create({
          org: request.organization,
          name: request.teamName,
          permission: request.permission === "pull" ? "pull" : "push",
          privacy: "closed",
          request: { signal },
        })
        teamSlug = response.data.slug
      } catch (error) {
        if (toErrorStatus(error) !== 422) {
          throw error
        }

        created = false
        const response = await octokit.teams.getByName({
          org: request.organization,
          team_slug: teamSlugFromName(request.teamName),
          request: { signal },
        })
        teamSlug = response.data.slug
      }

      const membersAdded: string[] = []
      const membersNotFound: string[] = []
      for (const username of request.memberUsernames) {
        if (signal?.aborted) {
          break
        }

        try {
          await octokit.teams.addOrUpdateMembershipForUserInOrg({
            org: request.organization,
            team_slug: teamSlug,
            username,
            role: mapTeamRole(request.permission),
            request: { signal },
          })
          membersAdded.push(username)
        } catch (error) {
          if (isNotFoundError(error)) {
            membersNotFound.push(username)
            continue
          }
          throw error
        }
      }

      return {
        created,
        teamSlug,
        membersAdded,
        membersNotFound,
      }
    },
    async assignRepositoriesToTeam(
      draft: GitConnectionDraft,
      request: AssignRepositoriesToTeamRequest,
      signal?: AbortSignal,
    ): Promise<void> {
      const octokit = createOctokit(http, draft)
      for (const repositoryName of request.repositoryNames) {
        if (signal?.aborted) {
          break
        }
        await octokit.teams.addOrUpdateRepoPermissionsInOrg({
          org: request.organization,
          team_slug: request.teamSlug,
          owner: request.organization,
          repo: repositoryName,
          permission: mapTeamPermission(request.permission),
          request: { signal },
        })
      }
    },
    async getRepositoryDefaultBranchHead(
      draft: GitConnectionDraft,
      request: RepositoryHeadRequest,
      signal?: AbortSignal,
    ): Promise<RepositoryHead | null> {
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
        return {
          sha: branch.data.commit.sha,
          branchName,
        }
      } catch (error) {
        if (isNotFoundError(error)) {
          return null
        }
        throw error
      }
    },
    async getTemplateDiff(
      draft: GitConnectionDraft,
      request: GetTemplateDiffRequest,
      signal?: AbortSignal,
    ): Promise<GetTemplateDiffResult | null> {
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
          if (!changedFile.filename) {
            continue
          }
          const status = normalizeTemplateDiffStatus(changedFile.status)
          const path = changedFile.filename
          const previousPath = changedFile.previous_filename ?? null
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
              continue
            }
          }
          files.push({
            path,
            previousPath,
            status,
            contentBase64,
          })
        }
        return { files }
      } catch (error) {
        if (isNotFoundError(error)) {
          return null
        }
        throw error
      }
    },
    async createBranch(
      draft: GitConnectionDraft,
      request: CreateBranchRequest,
      signal?: AbortSignal,
    ): Promise<void> {
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
        if (!isAlreadyExistsError(error)) {
          throw error
        }
      }

      for (const file of request.files) {
        if (signal?.aborted) {
          break
        }
        if (file.status === "removed") {
          const existingSha = await readRepositoryFileSha(
            octokit,
            request.owner,
            request.repositoryName,
            file.path,
            request.branchName,
            signal,
          )
          if (existingSha === null) {
            continue
          }
          await octokit.repos.deleteFile({
            owner: request.owner,
            repo: request.repositoryName,
            path: file.path,
            branch: request.branchName,
            message: request.commitMessage,
            sha: existingSha,
            request: { signal },
          })
          continue
        }

        if (file.contentBase64 === null) {
          continue
        }
        const existingSha = await readRepositoryFileSha(
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
            sha: existingSha ?? undefined,
            request: { signal },
          })
        } catch (error) {
          if (!/content is unchanged/i.test(toErrorMessage(error))) {
            throw error
          }
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
    async createPullRequest(
      draft: GitConnectionDraft,
      request: CreatePullRequestRequest,
      signal?: AbortSignal,
    ): Promise<CreatePullRequestResult> {
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
        return {
          url: response.data.html_url,
          created: true,
        }
      } catch (error) {
        if (!isNoChangesError(error)) {
          throw error
        }
        const existingUrl = await resolveExistingPullRequestUrl(
          octokit,
          request.owner,
          request.repositoryName,
          request.headBranch,
          request.baseBranch,
          signal,
        )
        return {
          url: existingUrl ?? "",
          created: false,
        }
      }
    },
    async resolveRepositoryCloneUrls(
      draft: GitConnectionDraft,
      request: ResolveRepositoryCloneUrlsRequest,
      signal?: AbortSignal,
    ): Promise<ResolveRepositoryCloneUrlsResult> {
      const octokit = createOctokit(http, draft)
      const resolved: ResolveRepositoryCloneUrlsResult["resolved"] = []
      const missing: string[] = []

      for (const repositoryName of request.repositoryNames) {
        if (signal?.aborted) {
          break
        }

        try {
          const response = await octokit.repos.get({
            owner: request.organization,
            repo: repositoryName,
            request: { signal },
          })
          resolved.push({
            repositoryName,
            cloneUrl: withGitHubToken(response.data.clone_url, draft.token),
          })
        } catch (error) {
          if (isNotFoundError(error)) {
            missing.push(repositoryName)
            continue
          }
          throw error
        }
      }

      return {
        resolved,
        missing,
      }
    },
  }
}

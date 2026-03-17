import { Octokit } from "@octokit/rest"
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
  DeleteRepositoriesRequest,
  DeleteRepositoriesResult,
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
import { createHttpPortFetch } from "./http-port-fetch.js"

function resolveApiBaseUrl(draft: GitConnectionDraft): string {
  if (draft.baseUrl === "") {
    return "https://api.github.com"
  }
  const base = draft.baseUrl.replace(/\/+$/, "")
  if (base === "https://github.com" || base === "http://github.com") {
    return "https://api.github.com"
  }
  return `${base}/api/v3`
}

function toErrorStatus(error: unknown): number | null {
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof (error as { status?: unknown }).status === "number"
  ) {
    return (error as { status: number }).status
  }
  return null
}

function toErrorMessage(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message
  }
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

function isAlreadyExistsError(error: unknown): boolean {
  const status = toErrorStatus(error)
  if (status !== 409 && status !== 422) {
    return false
  }
  return /already exists|name already exists/i.test(toErrorMessage(error))
}

function mapTeamPermission(permission: CreateTeamRequest["permission"]) {
  if (permission === "admin") {
    return "admin" as const
  }
  if (permission === "pull") {
    return "pull" as const
  }
  return "push" as const
}

function mapTeamRole(permission: CreateTeamRequest["permission"]) {
  return permission === "push" || permission === "admin"
    ? ("maintainer" as const)
    : ("member" as const)
}

function teamSlugFromName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function createOctokit(http: HttpPort, draft: GitConnectionDraft): Octokit {
  return new Octokit({
    auth: draft.token,
    baseUrl: resolveApiBaseUrl(draft),
    request: {
      fetch: createHttpPortFetch(http),
    },
  })
}

function isNotFoundError(error: unknown): boolean {
  return toErrorStatus(error) === 404
}

function withGitHubToken(cloneUrl: string, token: string): string {
  const url = new URL(cloneUrl)
  url.username = "x-access-token"
  url.password = token
  return url.toString()
}

function toBase64FromUnknown(
  content: unknown,
  encoding: unknown,
): string | null {
  if (typeof content !== "string") {
    return null
  }
  if (encoding === "base64") {
    return content.replace(/\n/g, "")
  }
  return Buffer.from(content, "utf8").toString("base64")
}

async function readRepositoryFileBase64(
  octokit: Octokit,
  owner: string,
  repositoryName: string,
  path: string,
  ref: string,
  signal?: AbortSignal,
): Promise<string | null> {
  try {
    const response = await octokit.repos.getContent({
      owner,
      repo: repositoryName,
      path,
      ref,
      request: { signal },
    })
    if (Array.isArray(response.data)) {
      return null
    }
    if (response.data.type !== "file") {
      return null
    }
    return toBase64FromUnknown(response.data.content, response.data.encoding)
  } catch (error) {
    if (isNotFoundError(error)) {
      return null
    }
    throw error
  }
}

async function readRepositoryFileSha(
  octokit: Octokit,
  owner: string,
  repositoryName: string,
  path: string,
  ref: string,
  signal?: AbortSignal,
): Promise<string | null> {
  try {
    const response = await octokit.repos.getContent({
      owner,
      repo: repositoryName,
      path,
      ref,
      request: { signal },
    })
    if (Array.isArray(response.data)) {
      return null
    }
    if (response.data.type !== "file") {
      return null
    }
    return typeof response.data.sha === "string" ? response.data.sha : null
  } catch (error) {
    if (isNotFoundError(error)) {
      return null
    }
    throw error
  }
}

function normalizeTemplateDiffStatus(status: string): PatchFile["status"] {
  if (status === "added") {
    return "added"
  }
  if (status === "removed") {
    return "removed"
  }
  if (status === "renamed") {
    return "renamed"
  }
  return "modified"
}

function isNoChangesError(error: unknown): boolean {
  return /no commits between|no changes|already exists|unprocessable entity/i.test(
    toErrorMessage(error),
  )
}

async function resolveExistingPullRequestUrl(
  octokit: Octokit,
  owner: string,
  repositoryName: string,
  headBranch: string,
  baseBranch: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const response = await octokit.pulls.list({
    owner,
    repo: repositoryName,
    state: "open",
    head: `${owner}:${headBranch}`,
    base: baseBranch,
    request: { signal },
  })
  const first = response.data[0]
  if (!first || typeof first.html_url !== "string") {
    return null
  }
  return first.html_url
}

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
    async deleteRepositories(
      draft: GitConnectionDraft,
      request: DeleteRepositoriesRequest,
      signal?: AbortSignal,
    ): Promise<DeleteRepositoriesResult> {
      const octokit = createOctokit(http, draft)
      let deletedCount = 0
      const missing: string[] = []

      for (const repositoryName of request.repositoryNames) {
        if (signal?.aborted) {
          break
        }

        try {
          await octokit.repos.delete({
            owner: request.organization,
            repo: repositoryName,
            request: { signal },
          })
          deletedCount += 1
        } catch (error) {
          if (isNotFoundError(error)) {
            missing.push(repositoryName)
            continue
          }
          throw error
        }
      }

      return {
        deletedCount,
        missing,
      }
    },
  }
}

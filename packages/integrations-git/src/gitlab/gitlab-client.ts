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
  ListRepositoriesRequest,
  ListRepositoriesResult,
  PatchFile,
  RepositoryHead,
  RepositoryHeadRequest,
  ResolveRepositoryCloneUrlsRequest,
  ResolveRepositoryCloneUrlsResult,
} from "@repo-edu/integrations-git-contract"
import { matchesGlob } from "../glob-match.js"
import { withGitLabToken } from "./auth.js"
import {
  gitLabDataMessage,
  gitLabErrorMessage,
  isAlreadyExistsError,
  isNoChangesMessage,
  isNotFoundError,
} from "./errors.js"
import {
  createProject,
  extractProjectUrl,
  fileExistsInBranch,
  normalizeTemplateDiffStatus,
  resolveProjectId,
  toBase64FromGitLabFile,
} from "./repositories.js"
import { resolveGroupId, toTeamPathSlug } from "./teams.js"
import {
  createGitLabApi,
  gitLabRestGet,
  gitLabRestPost,
  sleep,
} from "./transport.js"
import { isActiveExactMatch, resolveGitLabUserId } from "./users.js"

function normalizeNamespacePath(namespace: string): string {
  return namespace.trim().replace(/^\/+|\/+$/g, "")
}

function resolveListedRepositoryIdentity(
  project: { path?: unknown; name?: unknown; path_with_namespace?: unknown },
  namespace: string,
): { name: string; identifier: string } | null {
  const leafName =
    typeof project.path === "string" && project.path.length > 0
      ? project.path
      : String(project.name ?? "")
  if (leafName === "") {
    return null
  }
  const fullPath =
    typeof project.path_with_namespace === "string"
      ? project.path_with_namespace
      : ""
  if (fullPath === "") {
    return { name: leafName, identifier: leafName }
  }
  const normalizedNamespace = normalizeNamespacePath(namespace)
  const namespacePrefix = `${normalizedNamespace}/`
  const identifier =
    normalizedNamespace.length > 0 &&
    fullPath.startsWith(namespacePrefix) &&
    fullPath.length > namespacePrefix.length
      ? fullPath.slice(namespacePrefix.length)
      : leafName
  return { name: leafName, identifier }
}

export function createGitLabClient(http: HttpPort): GitProviderClient {
  const recentlyCreatedProjectAtMs = new Map<string, number>()
  const recentlyCreatedWindowMs = 30_000
  const recentProjectRetryIntervalMs = 1_000
  const recentProjectRetryAttempts = 5

  function toProjectKey(organization: string, repositoryName: string): string {
    return `${organization}/${repositoryName}`
  }

  return {
    async verifyConnection(
      draft: GitConnectionDraft,
      _signal?: AbortSignal,
    ): Promise<{ verified: boolean }> {
      try {
        const api = createGitLabApi(http, draft)
        const user = await api.Users.showCurrentUser()
        return { verified: user !== null && typeof user === "object" }
      } catch {
        return { verified: false }
      }
    },

    async verifyGitUsernames(
      draft: GitConnectionDraft,
      usernames: string[],
      signal?: AbortSignal,
    ): Promise<GitUsernameStatus[]> {
      const api = createGitLabApi(http, draft)
      const results: GitUsernameStatus[] = []

      for (const username of usernames) {
        if (signal?.aborted) {
          break
        }

        try {
          const users = await api.Users.all({ username })
          results.push({
            username,
            exists: users.some((user) => isActiveExactMatch(user, username)),
          })
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
      if (!request.organization) {
        return { created: [], alreadyExisted: [], failed: [] }
      }

      const api = createGitLabApi(http, draft)
      let namespaceId: number | null
      try {
        namespaceId = await resolveGroupId(api, request.organization)
      } catch {
        return { created: [], alreadyExisted: [], failed: [] }
      }

      if (namespaceId === null) {
        return { created: [], alreadyExisted: [], failed: [] }
      }

      const created: CreateRepositoriesResult["created"] = []
      const alreadyExisted: CreateRepositoriesResult["alreadyExisted"] = []
      const failed: CreateRepositoriesResult["failed"] = []
      for (const repoName of request.repositoryNames) {
        if (signal?.aborted) {
          break
        }

        try {
          const url = await createProject(api, namespaceId, repoName, request)
          if (url !== "") {
            recentlyCreatedProjectAtMs.set(
              toProjectKey(request.organization, repoName),
              Date.now(),
            )
            created.push({
              repositoryName: repoName,
              repositoryUrl: url,
            })
          } else {
            failed.push({
              repositoryName: repoName,
              reason: "Provider returned an empty repository URL.",
            })
          }
        } catch (error) {
          if (isAlreadyExistsError(error)) {
            const projectPath = `${request.organization}/${repoName}`
            try {
              const project = await api.Projects.show(projectPath)
              const url = extractProjectUrl(project)
              if (url === "") {
                failed.push({
                  repositoryName: repoName,
                  reason: "Repository exists but URL could not be resolved.",
                })
              } else {
                alreadyExisted.push({
                  repositoryName: repoName,
                  repositoryUrl: url,
                })
              }
              continue
            } catch (lookupError) {
              failed.push({
                repositoryName: repoName,
                reason: `Repository exists but lookup failed: ${gitLabErrorMessage(lookupError)}`,
              })
              continue
            }
          }

          failed.push({
            repositoryName: repoName,
            reason: gitLabErrorMessage(error),
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
      const api = createGitLabApi(http, draft)
      const organizationId = await resolveGroupId(api, request.organization)
      if (organizationId === null) {
        throw new Error(
          `Organization '${request.organization}' was not found on GitLab.`,
        )
      }

      const teamSlug = toTeamPathSlug(request.teamName)
      const teamPath = `${request.organization}/${teamSlug}`
      let created = false
      let teamId: number | null = null

      const createdGroup = await gitLabRestPost(
        http,
        draft,
        "/groups",
        {
          name: request.teamName,
          path: teamSlug,
          parentId: organizationId,
          visibility: "private",
        },
        signal,
      )
      if (createdGroup.status >= 200 && createdGroup.status < 300) {
        const groupId = (createdGroup.data as { id?: unknown } | null)?.id
        if (typeof groupId === "number") {
          teamId = groupId
          created = true
        }
      }

      if (teamId === null) {
        if (createdGroup.status !== 400 && createdGroup.status !== 409) {
          throw new Error(
            `Failed to create team '${request.teamName}' (${createdGroup.status}).`,
          )
        }
        teamId = await resolveGroupId(api, teamPath)
      }
      if (teamId === null) {
        throw new Error(`Failed to resolve GitLab team '${teamPath}'.`)
      }

      const membersAdded: string[] = []
      const membersNotFound: string[] = []
      const accessLevel =
        request.permission === "admin"
          ? 40
          : request.permission === "pull"
            ? 20
            : 30
      for (const username of request.memberUsernames) {
        if (signal?.aborted) {
          break
        }

        const userId = await resolveGitLabUserId(api, username)
        if (userId === null) {
          membersNotFound.push(username)
          continue
        }

        const memberResponse = await gitLabRestPost(
          http,
          draft,
          `/groups/${teamId}/members`,
          {
            userId,
            accessLevel,
          },
          signal,
        )
        if (
          (memberResponse.status >= 200 && memberResponse.status < 300) ||
          memberResponse.status === 409
        ) {
          membersAdded.push(username)
          continue
        }
        throw new Error(
          `Failed to add '${username}' to team '${request.teamName}' (${memberResponse.status}).`,
        )
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
      const api = createGitLabApi(http, draft)
      const teamPath = `${request.organization}/${request.teamSlug}`
      const teamId = await resolveGroupId(api, teamPath)
      if (teamId === null) {
        throw new Error(`GitLab team '${teamPath}' not found.`)
      }

      const groupAccess =
        request.permission === "admin"
          ? 40
          : request.permission === "pull"
            ? 20
            : 30
      for (const repositoryName of request.repositoryNames) {
        if (signal?.aborted) {
          break
        }

        const projectPath = `${request.organization}/${repositoryName}`
        const projectId = await resolveProjectId(api, projectPath)
        if (projectId === null) {
          throw new Error(`GitLab project '${projectPath}' not found.`)
        }

        const shareResponse = await gitLabRestPost(
          http,
          draft,
          `/projects/${projectId}/share`,
          {
            groupId: teamId,
            groupAccess,
          },
          signal,
        )
        if (
          (shareResponse.status >= 200 && shareResponse.status < 300) ||
          shareResponse.status === 409
        ) {
          continue
        }
        throw new Error(
          `Failed to assign '${repositoryName}' to team '${request.teamSlug}' (${shareResponse.status}).`,
        )
      }
    },
    async getRepositoryDefaultBranchHead(
      draft: GitConnectionDraft,
      request: RepositoryHeadRequest,
      _signal?: AbortSignal,
    ): Promise<RepositoryHead | null> {
      const api = createGitLabApi(http, draft)
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
        const commit = branch as { commit?: { id?: unknown } | null }
        if (typeof commit.commit?.id !== "string") {
          return null
        }
        return {
          sha: commit.commit.id,
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
      const projectPath = `${request.owner}/${request.repositoryName}`
      const encodedProjectPath = encodeURIComponent(projectPath)
      const compare = await gitLabRestGet(
        http,
        draft,
        `/projects/${encodedProjectPath}/repository/compare?from=${encodeURIComponent(request.fromSha)}&to=${encodeURIComponent(request.toSha)}`,
        signal,
      )
      if (compare.status === 404) {
        return null
      }
      if (compare.status < 200 || compare.status >= 300) {
        throw new Error(
          `Failed to compare template commits (${compare.status}): ${gitLabDataMessage(compare.data)}`,
        )
      }
      if (typeof compare.data !== "object" || compare.data === null) {
        return { files: [] }
      }
      const rawDiffs = (compare.data as { diffs?: unknown }).diffs
      if (!Array.isArray(rawDiffs)) {
        return { files: [] }
      }
      const files: PatchFile[] = []
      for (const rawDiff of rawDiffs) {
        if (typeof rawDiff !== "object" || rawDiff === null) {
          continue
        }
        const diff = rawDiff as Record<string, unknown>
        const path =
          typeof diff.new_path === "string"
            ? diff.new_path
            : typeof diff.old_path === "string"
              ? diff.old_path
              : ""
        if (path === "") {
          continue
        }
        const previousPath =
          typeof diff.old_path === "string" ? diff.old_path : null
        const status = normalizeTemplateDiffStatus(diff)
        let contentBase64: string | null = null
        if (status !== "removed") {
          const file = await gitLabRestGet(
            http,
            draft,
            `/projects/${encodedProjectPath}/repository/files/${encodeURIComponent(path)}?ref=${encodeURIComponent(request.toSha)}`,
            signal,
          )
          if (file.status === 404) {
            continue
          }
          if (file.status < 200 || file.status >= 300) {
            throw new Error(
              `Failed to read template file '${path}' (${file.status}).`,
            )
          }
          contentBase64 = toBase64FromGitLabFile(file.data)
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
    },
    async createBranch(
      draft: GitConnectionDraft,
      request: CreateBranchRequest,
      signal?: AbortSignal,
    ): Promise<void> {
      const api = createGitLabApi(http, draft)
      const projectPath = `${request.owner}/${request.repositoryName}`
      const projectId = await resolveProjectId(api, projectPath)
      if (projectId === null) {
        throw new Error(`GitLab project '${projectPath}' was not found.`)
      }

      const createBranchResponse = await gitLabRestPost(
        http,
        draft,
        `/projects/${projectId}/repository/branches`,
        {
          branch: request.branchName,
          ref: request.baseSha,
        },
        signal,
      )
      if (
        createBranchResponse.status < 200 ||
        createBranchResponse.status >= 300
      ) {
        const message = gitLabDataMessage(createBranchResponse.data)
        if (!isNoChangesMessage(message)) {
          throw new Error(
            `Failed to create branch '${request.branchName}' (${createBranchResponse.status}): ${message}`,
          )
        }
      }

      const actions: Array<Record<string, unknown>> = []
      for (const file of request.files) {
        if (signal?.aborted) {
          break
        }
        if (file.status === "removed") {
          if (
            await fileExistsInBranch(
              http,
              draft,
              projectId,
              file.path,
              request.branchName,
              signal,
            )
          ) {
            actions.push({
              action: "delete",
              filePath: file.path,
            })
          }
          continue
        }
        if (file.contentBase64 === null) {
          continue
        }

        const exists = await fileExistsInBranch(
          http,
          draft,
          projectId,
          file.path,
          request.branchName,
          signal,
        )
        actions.push({
          action: exists ? "update" : "create",
          filePath: file.path,
          content: file.contentBase64,
          encoding: "base64",
        })

        if (file.previousPath && file.previousPath !== file.path) {
          if (
            await fileExistsInBranch(
              http,
              draft,
              projectId,
              file.previousPath,
              request.branchName,
              signal,
            )
          ) {
            actions.push({
              action: "delete",
              filePath: file.previousPath,
            })
          }
        }
      }

      if (actions.length === 0) {
        return
      }
      const commitResponse = await gitLabRestPost(
        http,
        draft,
        `/projects/${projectId}/repository/commits`,
        {
          branch: request.branchName,
          commitMessage: request.commitMessage,
          actions,
        },
        signal,
      )
      if (commitResponse.status >= 200 && commitResponse.status < 300) {
        return
      }
      const message = gitLabDataMessage(commitResponse.data)
      if (isNoChangesMessage(message)) {
        return
      }
      throw new Error(
        `Failed to commit template update (${commitResponse.status}): ${message}`,
      )
    },
    async createPullRequest(
      draft: GitConnectionDraft,
      request: CreatePullRequestRequest,
      signal?: AbortSignal,
    ): Promise<CreatePullRequestResult> {
      const api = createGitLabApi(http, draft)
      const projectPath = `${request.owner}/${request.repositoryName}`
      const projectId = await resolveProjectId(api, projectPath)
      if (projectId === null) {
        throw new Error(`GitLab project '${projectPath}' was not found.`)
      }

      const response = await gitLabRestPost(
        http,
        draft,
        `/projects/${projectId}/merge_requests`,
        {
          sourceBranch: request.headBranch,
          targetBranch: request.baseBranch,
          title: request.title,
          description: request.body,
        },
        signal,
      )
      if (response.status >= 200 && response.status < 300) {
        const url = (response.data as { web_url?: unknown } | null)?.web_url
        return {
          url: typeof url === "string" ? url : "",
          created: true,
        }
      }

      const message = gitLabDataMessage(response.data)
      if (!isNoChangesMessage(message)) {
        throw new Error(
          `Failed to create merge request (${response.status}): ${message}`,
        )
      }

      const existing = await gitLabRestGet(
        http,
        draft,
        `/projects/${projectId}/merge_requests?state=opened&source_branch=${encodeURIComponent(request.headBranch)}&target_branch=${encodeURIComponent(request.baseBranch)}`,
        signal,
      )
      if (existing.status >= 200 && existing.status < 300) {
        const first = Array.isArray(existing.data) ? existing.data[0] : null
        const url =
          typeof first === "object" && first !== null
            ? (first as { web_url?: unknown }).web_url
            : null
        return {
          url: typeof url === "string" ? url : "",
          created: false,
        }
      }
      return {
        url: "",
        created: false,
      }
    },
    async listRepositories(
      draft: GitConnectionDraft,
      request: ListRepositoriesRequest,
      signal?: AbortSignal,
    ): Promise<ListRepositoriesResult> {
      if (!request.namespace) {
        return { repositories: [] }
      }
      const api = createGitLabApi(http, draft)
      let groupId: number | null = null
      try {
        groupId = await resolveGroupId(api, request.namespace)
      } catch {
        groupId = null
      }
      const repositories: ListRepositoriesResult["repositories"] = []
      if (groupId !== null) {
        const projects = await api.Groups.allProjects(groupId, {
          perPage: 100,
          includeSubgroups: true,
        })
        for (const project of projects) {
          if (signal?.aborted) break
          const identity = resolveListedRepositoryIdentity(
            project as {
              path?: unknown
              name?: unknown
              path_with_namespace?: unknown
            },
            request.namespace,
          )
          if (identity === null) continue
          // Filter matches the leaf name that the user sees in the preview,
          // never the subgroup-qualified identifier. A leaf that doesn't match
          // the pattern must not appear in the results.
          if (!matchesGlob(identity.name, request.filter)) continue
          const archived = Boolean((project as { archived?: unknown }).archived)
          if (archived && !request.includeArchived) continue
          repositories.push({ ...identity, archived })
        }
        return { repositories }
      }
      try {
        const userId = await resolveGitLabUserId(api, request.namespace)
        if (userId !== null) {
          const projects = await api.Users.allProjects(userId, {
            perPage: 100,
          })
          for (const project of projects) {
            if (signal?.aborted) break
            const identity = resolveListedRepositoryIdentity(
              project as {
                path?: unknown
                name?: unknown
                path_with_namespace?: unknown
              },
              request.namespace,
            )
            if (identity === null) continue
            if (!matchesGlob(identity.name, request.filter)) continue
            const archived = Boolean(
              (project as { archived?: unknown }).archived,
            )
            if (archived && !request.includeArchived) continue
            repositories.push({ ...identity, archived })
          }
        }
      } catch {
        // Swallow: namespace simply unresolvable, return empty list.
      }
      return { repositories }
    },
    async resolveRepositoryCloneUrls(
      draft: GitConnectionDraft,
      request: ResolveRepositoryCloneUrlsRequest,
      signal?: AbortSignal,
    ): Promise<ResolveRepositoryCloneUrlsResult> {
      if (!request.organization) {
        return {
          resolved: [],
          missing: [...request.repositoryNames],
        }
      }

      const api = createGitLabApi(http, draft)
      const resolved: ResolveRepositoryCloneUrlsResult["resolved"] = []
      const missing: string[] = []

      for (const repositoryName of request.repositoryNames) {
        if (signal?.aborted) {
          break
        }

        const projectPath = `${request.organization}/${repositoryName}`
        const projectKey = toProjectKey(request.organization, repositoryName)
        const createdAtMs = recentlyCreatedProjectAtMs.get(projectKey)
        const shouldRetryRecent =
          typeof createdAtMs === "number" &&
          Date.now() - createdAtMs <= recentlyCreatedWindowMs
        const attempts = shouldRetryRecent ? recentProjectRetryAttempts : 1

        let found = false
        for (let attempt = 1; attempt <= attempts; attempt += 1) {
          try {
            const project = await api.Projects.show(projectPath)
            const cloneUrl = extractProjectUrl(project)
            if (cloneUrl === "") {
              break
            }
            resolved.push({
              repositoryName,
              cloneUrl: withGitLabToken(cloneUrl, draft.token),
            })
            recentlyCreatedProjectAtMs.delete(projectKey)
            found = true
            break
          } catch (error) {
            if (!isNotFoundError(error)) {
              throw error
            }
            if (attempt < attempts) {
              await sleep(recentProjectRetryIntervalMs)
            }
          }
        }

        if (!found) {
          missing.push(repositoryName)
        }
      }

      return {
        resolved,
        missing,
      }
    },
  }
}

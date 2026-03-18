import { GitbeakerRequestError, Gitlab } from "@gitbeaker/rest"
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

type ResponseBody =
  | Record<string, unknown>
  | Record<string, unknown>[]
  | string
  | string[]
  | number
  | undefined
  | null

type FormattedResponse<T extends ResponseBody = ResponseBody> = {
  body: T
  headers: Record<string, string>
  status: number
}

type RequestOptions = {
  body?: FormData | Record<string, unknown>
  searchParams?: Record<string, unknown>
  sudo?: string | number
  signal?: AbortSignal
}

type RequestMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"

type ResourceOptions = {
  headers: Record<string, string>
  authHeaders: Record<string, () => Promise<string>>
  url: string
}

function resolveHost(draft: GitConnectionDraft): string {
  const base = (draft.baseUrl || "https://gitlab.com").replace(/\/+$/, "")
  return base.endsWith("/api/v4") ? base.slice(0, -"/api/v4".length) : base
}

function toApiBaseUrl(draft: GitConnectionDraft): string {
  return `${resolveHost(draft)}/api/v4`
}

function toTeamSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function toTeamPathSlug(name: string): string {
  const slug = toTeamSlug(name)
  return slug.startsWith("team-") ? slug : `team-${slug}`
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function decamelizeKey(key: string): string {
  return key.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`)
}

function decamelizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => decamelizeValue(entry))
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        decamelizeKey(key),
        decamelizeValue(entry),
      ]),
    )
  }

  return value
}

function appendSearchParams(
  params: URLSearchParams,
  key: string,
  value: unknown,
): void {
  if (value === undefined) {
    return
  }

  if (value === null) {
    params.append(key, "")
    return
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      appendSearchParams(params, `${key}[]`, entry)
    }
    return
  }

  params.append(key, String(value))
}

function toQueryString(searchParams?: Record<string, unknown>): string {
  if (!searchParams) {
    return ""
  }

  const decamelized = decamelizeValue(searchParams)
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(
    decamelized as Record<string, unknown>,
  )) {
    appendSearchParams(params, key, value)
  }
  return params.toString()
}

function parseResponseBody(response: {
  status: number
  headers: Record<string, string>
  body: string
}): ResponseBody {
  if (response.status === 204) {
    return null
  }

  const contentType = (response.headers["content-type"] ?? "")
    .split(";")[0]
    .trim()

  if (contentType === "application/json") {
    return response.body === "" ? {} : JSON.parse(response.body)
  }

  if (contentType.startsWith("text/")) {
    return response.body
  }

  return response.body
}

function createErrorDescription(response: {
  headers: Record<string, string>
  body: string
}): string {
  const contentType = response.headers["content-type"] ?? ""
  if (contentType.includes("application/json")) {
    const parsed = response.body === "" ? {} : JSON.parse(response.body)
    const errorOrMessage =
      (parsed as { error?: unknown; message?: unknown }).error ??
      (parsed as { error?: unknown; message?: unknown }).message ??
      ""

    return typeof errorOrMessage === "string"
      ? errorOrMessage
      : JSON.stringify(errorOrMessage)
  }

  return response.body
}

async function executeRequest<T extends ResponseBody>(
  http: HttpPort,
  resourceOptions: ResourceOptions,
  method: RequestMethod,
  endpoint: string,
  options?: RequestOptions,
): Promise<FormattedResponse<T>> {
  const baseUrl = resourceOptions.url.endsWith("/")
    ? resourceOptions.url
    : `${resourceOptions.url}/`
  const url = new URL(endpoint, baseUrl)
  const query = toQueryString(options?.searchParams)
  if (query !== "") {
    url.search = query
  }

  const headers: Record<string, string> = { ...resourceOptions.headers }
  if (options?.sudo !== undefined) {
    headers.sudo = String(options.sudo)
  }

  const [authHeaderName, authHeaderFactory] =
    Object.entries(resourceOptions.authHeaders)[0] ?? []
  if (authHeaderName && authHeaderFactory) {
    headers[authHeaderName] = await authHeaderFactory()
  }

  let body: string | undefined
  if (options?.body instanceof FormData) {
    throw new Error("GitLab adapter does not support FormData requests.")
  }
  if (options?.body !== undefined) {
    body = JSON.stringify(decamelizeValue(options.body))
    headers["content-type"] = "application/json"
  }

  const request = new Request(url, {
    method,
    headers,
    body,
    signal: options?.signal,
  })
  const httpResponse = await http.fetch({
    url: url.toString(),
    method,
    headers,
    body,
    signal: options?.signal,
  })

  if (httpResponse.status < 200 || httpResponse.status >= 300) {
    const response = new Response(httpResponse.body, {
      status: httpResponse.status,
      statusText: httpResponse.statusText,
      headers: httpResponse.headers,
    })
    throw new GitbeakerRequestError(createErrorDescription(httpResponse), {
      cause: {
        description: createErrorDescription(httpResponse),
        request,
        response,
      },
    })
  }

  return {
    body: parseResponseBody(httpResponse) as T,
    headers: httpResponse.headers,
    status: httpResponse.status,
  }
}

function createGitLabRequester(http: HttpPort) {
  return (resourceOptions: ResourceOptions) => ({
    get<T extends ResponseBody = ResponseBody>(
      endpoint: string,
      options?: RequestOptions,
    ): Promise<FormattedResponse<T>> {
      return executeRequest<T>(http, resourceOptions, "GET", endpoint, options)
    },
    post<T extends ResponseBody = ResponseBody>(
      endpoint: string,
      options?: RequestOptions,
    ): Promise<FormattedResponse<T>> {
      return executeRequest<T>(http, resourceOptions, "POST", endpoint, options)
    },
    put<T extends ResponseBody = ResponseBody>(
      endpoint: string,
      options?: RequestOptions,
    ): Promise<FormattedResponse<T>> {
      return executeRequest<T>(http, resourceOptions, "PUT", endpoint, options)
    },
    patch<T extends ResponseBody = ResponseBody>(
      endpoint: string,
      options?: RequestOptions,
    ): Promise<FormattedResponse<T>> {
      return executeRequest<T>(
        http,
        resourceOptions,
        "PATCH",
        endpoint,
        options,
      )
    },
    delete<T extends ResponseBody = ResponseBody>(
      endpoint: string,
      options?: RequestOptions,
    ): Promise<FormattedResponse<T>> {
      return executeRequest<T>(
        http,
        resourceOptions,
        "DELETE",
        endpoint,
        options,
      )
    },
  })
}

function createGitLabApi(http: HttpPort, draft: GitConnectionDraft): Gitlab {
  return new Gitlab({
    host: resolveHost(draft),
    token: draft.token,
    requesterFn: createGitLabRequester(http) as never,
  })
}

async function resolveGroupId(
  api: Gitlab,
  groupPath: string,
): Promise<number | null> {
  const group = await api.Groups.show(groupPath)
  const id = (group as { id?: unknown }).id
  return typeof id === "number" ? id : null
}

function resolveVisibility(
  request: CreateRepositoriesRequest,
): "public" | "internal" | "private" {
  return request.visibility
}

function extractProjectUrl(project: unknown): string {
  if (typeof project !== "object" || project === null) {
    return ""
  }

  const record = project as {
    web_url?: unknown
    http_url_to_repo?: unknown
  }

  if (typeof record.web_url === "string") {
    return record.web_url
  }
  if (typeof record.http_url_to_repo === "string") {
    return record.http_url_to_repo
  }
  return ""
}

function withGitLabToken(cloneUrl: string, token: string): string {
  const url = new URL(cloneUrl)
  url.username = "oauth2"
  url.password = token
  return url.toString()
}

function isNotFoundError(error: unknown): boolean {
  if (!(error instanceof GitbeakerRequestError)) {
    return false
  }

  const cause = error.cause as
    | {
        description?: unknown
        response?: { status?: unknown }
      }
    | undefined
  if (cause?.response?.status === 404) {
    return true
  }

  const description =
    typeof cause?.description === "string" ? cause.description : error.message
  return /404|not found/i.test(description)
}

function gitLabErrorStatus(error: unknown): number | null {
  if (!(error instanceof GitbeakerRequestError)) {
    return null
  }
  const cause = error.cause as { response?: { status?: unknown } } | undefined
  if (typeof cause?.response?.status === "number") {
    return cause.response.status
  }
  return null
}

function gitLabErrorMessage(error: unknown): string {
  if (error instanceof GitbeakerRequestError) {
    const cause = error.cause as { description?: unknown } | undefined
    if (typeof cause?.description === "string") {
      return cause.description
    }
    return error.message
  }
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

function isAlreadyExistsError(error: unknown): boolean {
  const status = gitLabErrorStatus(error)
  if (status !== 400 && status !== 409 && status !== 422) {
    return false
  }
  return /already exists|already been taken|has already been taken/i.test(
    gitLabErrorMessage(error),
  )
}

async function gitLabRestRequest(
  http: HttpPort,
  draft: GitConnectionDraft,
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body: Record<string, unknown> | undefined,
  signal?: AbortSignal,
): Promise<{ status: number; data: unknown }> {
  const response = await http.fetch({
    url: `${toApiBaseUrl(draft)}${path}`,
    method,
    headers: {
      "PRIVATE-TOKEN": draft.token,
      accept: "application/json",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body:
      body === undefined ? undefined : JSON.stringify(decamelizeValue(body)),
    signal,
  })

  let data: unknown = null
  if (response.body !== "") {
    try {
      data = JSON.parse(response.body)
    } catch {
      data = response.body
    }
  }

  return {
    status: response.status,
    data,
  }
}

async function gitLabRestPost(
  http: HttpPort,
  draft: GitConnectionDraft,
  path: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<{ status: number; data: unknown }> {
  return gitLabRestRequest(http, draft, "POST", path, body, signal)
}

async function gitLabRestGet(
  http: HttpPort,
  draft: GitConnectionDraft,
  path: string,
  signal?: AbortSignal,
): Promise<{ status: number; data: unknown }> {
  return gitLabRestRequest(http, draft, "GET", path, undefined, signal)
}

function toBase64FromGitLabFile(data: unknown): string | null {
  if (typeof data !== "object" || data === null) {
    return null
  }
  const record = data as { content?: unknown; encoding?: unknown }
  if (typeof record.content !== "string") {
    return null
  }
  if (record.encoding === "base64") {
    return record.content.replace(/\n/g, "")
  }
  return Buffer.from(record.content, "utf8").toString("base64")
}

function isActiveExactMatch(user: unknown, username: string): boolean {
  if (typeof user !== "object" || user === null) {
    return false
  }

  const record = user as {
    username?: unknown
    state?: unknown
  }

  return record.username === username && record.state !== "blocked"
}

async function createProject(
  api: Gitlab,
  namespaceId: number,
  repoName: string,
  request: CreateRepositoriesRequest,
): Promise<string> {
  const options: {
    name: string
    path: string
    namespaceId: number
    visibility: "public" | "internal" | "private"
    initializeWithReadme?: boolean
  } = {
    name: repoName,
    path: repoName,
    namespaceId,
    visibility: resolveVisibility(request),
  }

  if (request.autoInit) {
    options.initializeWithReadme = true
  }

  const project = await api.Projects.create(options)
  return extractProjectUrl(project)
}

async function resolveProjectId(
  api: Gitlab,
  projectPath: string,
): Promise<number | null> {
  const project = await api.Projects.show(projectPath)
  const id = (project as { id?: unknown }).id
  return typeof id === "number" ? id : null
}

async function resolveGitLabUserId(
  api: Gitlab,
  username: string,
): Promise<number | null> {
  const users = await api.Users.all({ username })
  const match = users.find((user) => isActiveExactMatch(user, username))
  const id = (match as { id?: unknown } | undefined)?.id
  return typeof id === "number" ? id : null
}

function normalizeTemplateDiffStatus(
  diff: Record<string, unknown>,
): PatchFile["status"] {
  if (diff.deleted_file === true) {
    return "removed"
  }
  if (diff.renamed_file === true) {
    return "renamed"
  }
  if (diff.new_file === true) {
    return "added"
  }
  return "modified"
}

function gitLabDataMessage(data: unknown): string {
  if (typeof data === "string") {
    return data
  }
  if (typeof data !== "object" || data === null) {
    return ""
  }
  const record = data as { message?: unknown; error?: unknown }
  if (typeof record.message === "string") {
    return record.message
  }
  if (typeof record.error === "string") {
    return record.error
  }
  try {
    return JSON.stringify(record.message ?? record.error ?? "")
  } catch {
    return ""
  }
}

function isNoChangesMessage(message: string): boolean {
  return /already exists|no commits|no changes|branch.*exists/i.test(message)
}

async function fileExistsInBranch(
  http: HttpPort,
  draft: GitConnectionDraft,
  projectId: number,
  path: string,
  branchName: string,
  signal?: AbortSignal,
): Promise<boolean> {
  const response = await gitLabRestGet(
    http,
    draft,
    `/projects/${projectId}/repository/files/${encodeURIComponent(path)}?ref=${encodeURIComponent(branchName)}`,
    signal,
  )
  if (response.status === 404) {
    return false
  }
  if (response.status < 200 || response.status >= 300) {
    throw new Error(
      `Failed to inspect file '${path}' on '${branchName}' (${response.status}).`,
    )
  }
  return true
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

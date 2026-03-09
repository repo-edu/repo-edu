import { GitbeakerRequestError, Gitlab } from "@gitbeaker/rest"
import type { HttpPort } from "@repo-edu/host-runtime-contract"
import type {
  CreateRepositoriesRequest,
  CreateRepositoriesResult,
  DeleteRepositoriesRequest,
  DeleteRepositoriesResult,
  GitConnectionDraft,
  GitProviderClient,
  GitUsernameStatus,
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
  const base = (draft.baseUrl ?? "https://gitlab.com").replace(/\/+$/, "")
  return base.endsWith("/api/v4") ? base.slice(0, -"/api/v4".length) : base
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
  if (request.template?.visibility === "public") {
    return "public"
  }
  if (request.template?.visibility === "internal") {
    return "internal"
  }
  return "private"
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
    useCustomTemplate?: boolean
    templateName?: string
    groupWithProjectTemplatesId?: number
  } = {
    name: repoName,
    path: repoName,
    namespaceId,
    visibility: resolveVisibility(request),
  }

  if (request.template) {
    const templateGroupId = await resolveGroupId(api, request.template.owner)
    if (templateGroupId === null) {
      return ""
    }

    options.useCustomTemplate = true
    options.templateName = request.template.name
    options.groupWithProjectTemplatesId = templateGroupId
  }

  const project = await api.Projects.create(options)
  return extractProjectUrl(project)
}

export function createGitLabClient(http: HttpPort): GitProviderClient {
  return {
    async verifyConnection(
      draft: GitConnectionDraft,
      _signal?: AbortSignal,
    ): Promise<{ verified: boolean }> {
      const org = draft.organization
      if (!org) {
        return { verified: false }
      }

      try {
        const api = createGitLabApi(http, draft)
        const groupId = await resolveGroupId(api, org)
        return { verified: groupId !== null }
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
        return { createdCount: 0, repositoryUrls: [] }
      }

      const api = createGitLabApi(http, draft)
      let namespaceId: number | null
      try {
        namespaceId = await resolveGroupId(api, request.organization)
      } catch {
        return { createdCount: 0, repositoryUrls: [] }
      }

      if (namespaceId === null) {
        return { createdCount: 0, repositoryUrls: [] }
      }

      const urls: string[] = []
      for (const repoName of request.repositoryNames) {
        if (signal?.aborted) {
          break
        }

        try {
          const url = await createProject(api, namespaceId, repoName, request)
          if (url !== "") {
            urls.push(url)
          }
        } catch {
          // Individual creation failure is non-fatal
        }
      }

      return {
        createdCount: urls.length,
        repositoryUrls: urls,
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
        try {
          const project = await api.Projects.show(projectPath)
          const cloneUrl = extractProjectUrl(project)
          if (cloneUrl === "") {
            missing.push(repositoryName)
            continue
          }
          resolved.push({
            repositoryName,
            cloneUrl: withGitLabToken(cloneUrl, draft.token),
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
      if (!request.organization) {
        return {
          deletedCount: 0,
          missing: [...request.repositoryNames],
        }
      }

      const api = createGitLabApi(http, draft)
      let deletedCount = 0
      const missing: string[] = []

      for (const repositoryName of request.repositoryNames) {
        if (signal?.aborted) {
          break
        }

        const projectPath = `${request.organization}/${repositoryName}`
        try {
          await api.Projects.remove(projectPath)
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

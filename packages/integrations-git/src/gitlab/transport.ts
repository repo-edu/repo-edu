import { GitbeakerRequestError, Gitlab } from "@gitbeaker/rest"
import { resolveUserAgent } from "@repo-edu/domain/connection"
import type { HttpPort } from "@repo-edu/host-runtime-contract"
import type { GitConnectionDraft } from "@repo-edu/integrations-git-contract"

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
  resolvedUserAgent: string,
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

  const headers: Record<string, string> = {}
  for (const [key, value] of Object.entries(resourceOptions.headers)) {
    if (key.toLowerCase() === "user-agent") {
      continue
    }
    headers[key] = value
  }
  headers["User-Agent"] = resolvedUserAgent
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

function createGitLabRequester(http: HttpPort, resolvedUserAgent: string) {
  return (resourceOptions: ResourceOptions) => ({
    get<T extends ResponseBody = ResponseBody>(
      endpoint: string,
      options?: RequestOptions,
    ): Promise<FormattedResponse<T>> {
      return executeRequest<T>(
        http,
        resourceOptions,
        resolvedUserAgent,
        "GET",
        endpoint,
        options,
      )
    },
    post<T extends ResponseBody = ResponseBody>(
      endpoint: string,
      options?: RequestOptions,
    ): Promise<FormattedResponse<T>> {
      return executeRequest<T>(
        http,
        resourceOptions,
        resolvedUserAgent,
        "POST",
        endpoint,
        options,
      )
    },
    put<T extends ResponseBody = ResponseBody>(
      endpoint: string,
      options?: RequestOptions,
    ): Promise<FormattedResponse<T>> {
      return executeRequest<T>(
        http,
        resourceOptions,
        resolvedUserAgent,
        "PUT",
        endpoint,
        options,
      )
    },
    patch<T extends ResponseBody = ResponseBody>(
      endpoint: string,
      options?: RequestOptions,
    ): Promise<FormattedResponse<T>> {
      return executeRequest<T>(
        http,
        resourceOptions,
        resolvedUserAgent,
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
        resolvedUserAgent,
        "DELETE",
        endpoint,
        options,
      )
    },
  })
}

export function createGitLabApi(
  http: HttpPort,
  draft: GitConnectionDraft,
): Gitlab {
  // Frozen per createGitLabApi call: if we ever cache the Gitlab client, we must
  // invalidate whenever the draft (specifically its user-agent) changes.
  const resolvedUserAgent = resolveUserAgent(draft)
  return new Gitlab({
    host: resolveHost(draft),
    token: draft.token,
    requesterFn: createGitLabRequester(http, resolvedUserAgent) as never,
  })
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
      "User-Agent": resolveUserAgent(draft),
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

export async function gitLabRestPost(
  http: HttpPort,
  draft: GitConnectionDraft,
  path: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<{ status: number; data: unknown }> {
  return gitLabRestRequest(http, draft, "POST", path, body, signal)
}

export async function gitLabRestGet(
  http: HttpPort,
  draft: GitConnectionDraft,
  path: string,
  signal?: AbortSignal,
): Promise<{ status: number; data: unknown }> {
  return gitLabRestRequest(http, draft, "GET", path, undefined, signal)
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

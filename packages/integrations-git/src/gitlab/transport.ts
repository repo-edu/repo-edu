import { Gitlab } from "@gitbeaker/rest"
import { resolveUserAgent } from "@repo-edu/domain/connection"
import type { HttpPort, HttpResponse } from "@repo-edu/host-runtime-contract"
import type { GitConnectionDraft } from "@repo-edu/integrations-git-contract"
import { sendGitHttpRequest } from "../invocation-guard.js"

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

function parseJson(body: string): unknown {
  if (body === "") return null
  try {
    return JSON.parse(body)
  } catch {
    return body
  }
}

function parseResponseBody(response: HttpResponse): ResponseBody {
  if (response.status === 204) {
    return null
  }

  const contentType = (response.headers["content-type"] ?? "")
    .split(";")[0]
    .trim()

  if (contentType === "application/json") {
    return response.body === ""
      ? {}
      : (parseJson(response.body) as ResponseBody)
  }

  return response.body
}

function replyDetail(response: HttpResponse): string {
  const data = parseJson(response.body)
  if (typeof data === "string") return data
  if (typeof data !== "object" || data === null) return ""
  const record = data as { error?: unknown; message?: unknown }
  const detail = record.error ?? record.message ?? ""
  if (typeof detail === "string") return detail
  try {
    return JSON.stringify(detail)
  } catch {
    return ""
  }
}

async function executeRequest<T extends ResponseBody>(
  http: HttpPort,
  resourceOptions: ResourceOptions,
  resolvedUserAgent: string,
  callerSignal: AbortSignal | undefined,
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

  const signal =
    callerSignal && options?.signal
      ? AbortSignal.any([callerSignal, options.signal])
      : (callerSignal ?? options?.signal)
  const httpResponse = await sendGitHttpRequest(
    http,
    { url: url.toString(), method, headers, body },
    signal,
    replyDetail,
  )

  return {
    body: parseResponseBody(httpResponse) as T,
    headers: httpResponse.headers,
    status: httpResponse.status,
  }
}

function createGitLabRequester(
  http: HttpPort,
  resolvedUserAgent: string,
  callerSignal?: AbortSignal,
) {
  return (resourceOptions: ResourceOptions) => ({
    get<T extends ResponseBody = ResponseBody>(
      endpoint: string,
      options?: RequestOptions,
    ): Promise<FormattedResponse<T>> {
      return executeRequest<T>(
        http,
        resourceOptions,
        resolvedUserAgent,
        callerSignal,
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
        callerSignal,
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
        callerSignal,
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
        callerSignal,
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
        callerSignal,
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
  signal?: AbortSignal,
): Gitlab {
  const resolvedUserAgent = resolveUserAgent(draft)
  return new Gitlab({
    host: resolveHost(draft),
    token: draft.token,
    requesterFn: createGitLabRequester(
      http,
      resolvedUserAgent,
      signal,
    ) as never,
  })
}

/** Answers only a 2xx reply, like the Gitbeaker requester above. */
export async function gitLabRestPost(
  http: HttpPort,
  draft: GitConnectionDraft,
  path: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<unknown> {
  const response = await sendGitHttpRequest(
    http,
    {
      url: `${toApiBaseUrl(draft)}${path}`,
      method: "POST",
      headers: {
        "User-Agent": resolveUserAgent(draft),
        "PRIVATE-TOKEN": draft.token,
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(decamelizeValue(body)),
    },
    signal,
    replyDetail,
  )
  return parseJson(response.body)
}

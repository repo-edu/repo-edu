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

function resolveApiBase(draft: GitConnectionDraft): string | null {
  const baseUrl = draft.baseUrl?.trim()
  if (!baseUrl) {
    return null
  }

  const base = baseUrl.replace(/\/+$/, "")
  if (base.endsWith("/api/v1")) {
    return base
  }

  return `${base}/api/v1`
}

function createHeaders(draft: GitConnectionDraft): Record<string, string> {
  return {
    Authorization: `token ${draft.token}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  }
}

async function giteaRequest(
  http: HttpPort,
  draft: GitConnectionDraft,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: string,
  signal?: AbortSignal,
): Promise<{ status: number; data: unknown }> {
  const apiBase = resolveApiBase(draft)
  if (!apiBase) {
    throw new Error("Gitea baseUrl is required.")
  }

  const response = await http.fetch({
    url: `${apiBase}${path}`,
    method,
    headers: createHeaders(draft),
    body,
    signal,
  })

  let data: unknown = null
  if (response.body) {
    try {
      data = JSON.parse(response.body)
    } catch {
      data = response.body
    }
  }

  return { status: response.status, data }
}

function isActiveUser(data: unknown, username: string): boolean {
  if (typeof data !== "object" || data === null) {
    return false
  }

  const user = data as {
    username?: unknown
    active?: unknown
    is_active?: unknown
  }

  const matches = user.username === username
  if (!matches) {
    return false
  }

  if (user.active === false || user.is_active === false) {
    return false
  }

  return true
}

function resolvePrivateFlag(request: CreateRepositoriesRequest): boolean {
  return request.template?.visibility !== "public"
}

function withGiteaToken(cloneUrl: string, token: string): string {
  const url = new URL(cloneUrl)
  url.username = "token"
  url.password = token
  return url.toString()
}

function extractRepositoryUrl(data: unknown): string {
  if (typeof data !== "object" || data === null) {
    return ""
  }

  const repository = data as {
    html_url?: unknown
    clone_url?: unknown
    website?: unknown
  }

  if (typeof repository.html_url === "string") {
    return repository.html_url
  }
  if (typeof repository.clone_url === "string") {
    return repository.clone_url
  }
  if (typeof repository.website === "string") {
    return repository.website
  }

  return ""
}

async function createRepository(
  http: HttpPort,
  draft: GitConnectionDraft,
  request: CreateRepositoriesRequest,
  repoName: string,
  signal?: AbortSignal,
): Promise<string> {
  const body = JSON.stringify({
    name: repoName,
    private: resolvePrivateFlag(request),
  })

  if (request.template) {
    const { status, data } = await giteaRequest(
      http,
      draft,
      "POST",
      `/repos/${encodeURIComponent(request.template.owner)}/${encodeURIComponent(
        request.template.name,
      )}/generate`,
      JSON.stringify({
        owner: request.organization,
        name: repoName,
        private: resolvePrivateFlag(request),
      }),
      signal,
    )

    if (status >= 200 && status < 300) {
      return extractRepositoryUrl(data)
    }

    return ""
  }

  const { status, data } = await giteaRequest(
    http,
    draft,
    "POST",
    `/orgs/${encodeURIComponent(request.organization)}/repos`,
    body,
    signal,
  )

  if (status >= 200 && status < 300) {
    return extractRepositoryUrl(data)
  }

  return ""
}

export function createGiteaClient(http: HttpPort): GitProviderClient {
  return {
    async verifyConnection(
      draft: GitConnectionDraft,
      signal?: AbortSignal,
    ): Promise<{ verified: boolean }> {
      const org = draft.organization
      if (!org || !resolveApiBase(draft)) {
        return { verified: false }
      }

      try {
        const { status } = await giteaRequest(
          http,
          draft,
          "GET",
          `/orgs/${encodeURIComponent(org)}`,
          undefined,
          signal,
        )
        return { verified: status >= 200 && status < 300 }
      } catch {
        return { verified: false }
      }
    },

    async verifyGitUsernames(
      draft: GitConnectionDraft,
      usernames: string[],
      signal?: AbortSignal,
    ): Promise<GitUsernameStatus[]> {
      const results: GitUsernameStatus[] = []
      if (!resolveApiBase(draft)) {
        return usernames.map((username) => ({ username, exists: false }))
      }

      for (const username of usernames) {
        if (signal?.aborted) {
          break
        }

        try {
          const { status, data } = await giteaRequest(
            http,
            draft,
            "GET",
            `/users/${encodeURIComponent(username)}`,
            undefined,
            signal,
          )

          results.push({
            username,
            exists:
              status >= 200 && status < 300 && isActiveUser(data, username),
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
      if (!request.organization || !resolveApiBase(draft)) {
        return { createdCount: 0, repositoryUrls: [] }
      }

      const repositoryUrls: string[] = []

      for (const repoName of request.repositoryNames) {
        if (signal?.aborted) {
          break
        }

        try {
          const url = await createRepository(
            http,
            draft,
            request,
            repoName,
            signal,
          )
          if (url !== "") {
            repositoryUrls.push(url)
          }
        } catch {
          // Individual repository creation failure is non-fatal.
        }
      }

      return {
        createdCount: repositoryUrls.length,
        repositoryUrls,
      }
    },
    async resolveRepositoryCloneUrls(
      draft: GitConnectionDraft,
      request: ResolveRepositoryCloneUrlsRequest,
      signal?: AbortSignal,
    ): Promise<ResolveRepositoryCloneUrlsResult> {
      if (!request.organization || !resolveApiBase(draft)) {
        return {
          resolved: [],
          missing: [...request.repositoryNames],
        }
      }

      const resolved: ResolveRepositoryCloneUrlsResult["resolved"] = []
      const missing: string[] = []

      for (const repositoryName of request.repositoryNames) {
        if (signal?.aborted) {
          break
        }

        const response = await giteaRequest(
          http,
          draft,
          "GET",
          `/repos/${encodeURIComponent(request.organization)}/${encodeURIComponent(repositoryName)}`,
          undefined,
          signal,
        )

        if (response.status === 404) {
          missing.push(repositoryName)
          continue
        }

        if (response.status < 200 || response.status >= 300) {
          throw new Error(
            `Failed to resolve repository '${repositoryName}' (${response.status}).`,
          )
        }

        const cloneUrl = extractRepositoryUrl(response.data)
        if (cloneUrl === "") {
          missing.push(repositoryName)
          continue
        }
        resolved.push({
          repositoryName,
          cloneUrl: withGiteaToken(cloneUrl, draft.token),
        })
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
      if (!request.organization || !resolveApiBase(draft)) {
        return {
          deletedCount: 0,
          missing: [...request.repositoryNames],
        }
      }

      let deletedCount = 0
      const missing: string[] = []

      for (const repositoryName of request.repositoryNames) {
        if (signal?.aborted) {
          break
        }

        const response = await giteaRequest(
          http,
          draft,
          "DELETE",
          `/repos/${encodeURIComponent(request.organization)}/${encodeURIComponent(repositoryName)}`,
          undefined,
          signal,
        )

        if (response.status === 404) {
          missing.push(repositoryName)
          continue
        }

        if (response.status >= 200 && response.status < 300) {
          deletedCount += 1
          continue
        }

        throw new Error(
          `Failed to delete repository '${repositoryName}' (${response.status}).`,
        )
      }

      return {
        deletedCount,
        missing,
      }
    },
  }
}

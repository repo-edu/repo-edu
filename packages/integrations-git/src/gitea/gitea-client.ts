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

function resolveApiBase(draft: GitConnectionDraft): string | null {
  const baseUrl = draft.baseUrl.trim()
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
  return request.visibility !== "public"
}

function mapTeamPermission(
  permission: CreateTeamRequest["permission"],
): string {
  if (permission === "admin") {
    return "admin"
  }
  if (permission === "pull") {
    return "read"
  }
  return "write"
}

const defaultTeamUnits = [
  "repo.code",
  "repo.issues",
  "repo.pulls",
  "repo.actions",
  "repo.releases",
  "repo.wiki",
  "repo.projects",
  "repo.packages",
]

function toErrorMessage(data: unknown): string {
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
  return ""
}

function isAlreadyExists(status: number, data: unknown): boolean {
  if (status !== 409 && status !== 422) {
    return false
  }
  return /already exists|has already been taken/i.test(toErrorMessage(data))
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

function toBase64FromGiteaContent(data: unknown): string | null {
  if (typeof data !== "object" || data === null) {
    return null
  }
  const file = data as { content?: unknown; encoding?: unknown }
  if (typeof file.content !== "string") {
    return null
  }
  if (file.encoding === "base64") {
    return file.content.replace(/\n/g, "")
  }
  return Buffer.from(file.content, "utf8").toString("base64")
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

function isNoChangesMessage(message: string): boolean {
  return /already exists|no commits|no changes|same as current/i.test(message)
}

async function resolveExistingRepositoryUrl(
  http: HttpPort,
  draft: GitConnectionDraft,
  organization: string,
  repositoryName: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const response = await giteaRequest(
    http,
    draft,
    "GET",
    `/repos/${encodeURIComponent(organization)}/${encodeURIComponent(repositoryName)}`,
    undefined,
    signal,
  )
  if (response.status < 200 || response.status >= 300) {
    return null
  }
  const repositoryUrl = extractRepositoryUrl(response.data)
  return repositoryUrl === "" ? null : repositoryUrl
}

async function resolveTeamId(
  http: HttpPort,
  draft: GitConnectionDraft,
  organization: string,
  teamSlug: string,
  signal?: AbortSignal,
): Promise<number | null> {
  const response = await giteaRequest(
    http,
    draft,
    "GET",
    `/orgs/${encodeURIComponent(organization)}/teams`,
    undefined,
    signal,
  )
  if (response.status < 200 || response.status >= 300) {
    return null
  }
  if (!Array.isArray(response.data)) {
    return null
  }

  for (const entry of response.data) {
    if (typeof entry !== "object" || entry === null) {
      continue
    }
    const team = entry as { id?: unknown; name?: unknown }
    if (
      (String(team.name ?? "") === teamSlug ||
        String(team.name ?? "").toLowerCase() === teamSlug.toLowerCase()) &&
      typeof team.id === "number"
    ) {
      return team.id
    }
  }
  return null
}

async function readRepositoryFile(
  http: HttpPort,
  draft: GitConnectionDraft,
  owner: string,
  repositoryName: string,
  path: string,
  ref: string,
  signal?: AbortSignal,
): Promise<{ sha: string | null; contentBase64: string | null }> {
  const response = await giteaRequest(
    http,
    draft,
    "GET",
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repositoryName)}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(ref)}`,
    undefined,
    signal,
  )
  if (response.status === 404) {
    return { sha: null, contentBase64: null }
  }
  if (response.status < 200 || response.status >= 300) {
    throw new Error(
      `Failed to resolve file '${path}' on ref '${ref}' (${response.status}).`,
    )
  }
  if (typeof response.data !== "object" || response.data === null) {
    return { sha: null, contentBase64: null }
  }
  const file = response.data as { sha?: unknown }
  return {
    sha: typeof file.sha === "string" ? file.sha : null,
    contentBase64: toBase64FromGiteaContent(response.data),
  }
}

export function createGiteaClient(http: HttpPort): GitProviderClient {
  return {
    async verifyConnection(
      draft: GitConnectionDraft,
      signal?: AbortSignal,
    ): Promise<{ verified: boolean }> {
      if (!resolveApiBase(draft)) {
        return { verified: false }
      }

      try {
        const { status } = await giteaRequest(
          http,
          draft,
          "GET",
          "/user",
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
          const response = await giteaRequest(
            http,
            draft,
            "POST",
            `/orgs/${encodeURIComponent(request.organization)}/repos`,
            JSON.stringify({
              name: repoName,
              private: resolvePrivateFlag(request),
              auto_init: request.autoInit,
            }),
            signal,
          )

          if (response.status >= 200 && response.status < 300) {
            const repositoryUrl = extractRepositoryUrl(response.data)
            if (repositoryUrl === "") {
              failed.push({
                repositoryName: repoName,
                reason: "Provider returned an empty repository URL.",
              })
            } else {
              created.push({
                repositoryName: repoName,
                repositoryUrl,
              })
            }
            continue
          }

          if (isAlreadyExists(response.status, response.data)) {
            const existingUrl = await resolveExistingRepositoryUrl(
              http,
              draft,
              request.organization,
              repoName,
              signal,
            )
            if (existingUrl === null) {
              failed.push({
                repositoryName: repoName,
                reason: "Repository exists but URL lookup failed.",
              })
            } else {
              alreadyExisted.push({
                repositoryName: repoName,
                repositoryUrl: existingUrl,
              })
            }
            continue
          }

          failed.push({
            repositoryName: repoName,
            reason: toErrorMessage(response.data) || `HTTP ${response.status}`,
          })
        } catch (error) {
          failed.push({
            repositoryName: repoName,
            reason: error instanceof Error ? error.message : String(error),
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
      if (!resolveApiBase(draft)) {
        throw new Error("Gitea baseUrl is required.")
      }

      const createResponse = await giteaRequest(
        http,
        draft,
        "POST",
        `/orgs/${encodeURIComponent(request.organization)}/teams`,
        JSON.stringify({
          name: request.teamName,
          permission: mapTeamPermission(request.permission),
          units: defaultTeamUnits,
        }),
        signal,
      )

      let created = false
      let teamId: number | null = null
      if (createResponse.status >= 200 && createResponse.status < 300) {
        const id = (createResponse.data as { id?: unknown } | null)?.id
        if (typeof id === "number") {
          teamId = id
          created = true
        }
      } else if (createResponse.status === 409) {
        teamId = await resolveTeamId(
          http,
          draft,
          request.organization,
          request.teamName,
          signal,
        )
      } else {
        throw new Error(
          `Failed to create Gitea team '${request.teamName}' (${createResponse.status}).`,
        )
      }

      if (teamId === null) {
        throw new Error(`Failed to resolve Gitea team '${request.teamName}'.`)
      }

      const membersAdded: string[] = []
      const membersNotFound: string[] = []
      for (const username of request.memberUsernames) {
        if (signal?.aborted) {
          break
        }

        const response = await giteaRequest(
          http,
          draft,
          "PUT",
          `/teams/${teamId}/members/${encodeURIComponent(username)}`,
          undefined,
          signal,
        )
        if (response.status >= 200 && response.status < 300) {
          membersAdded.push(username)
          continue
        }
        if (response.status === 404) {
          membersNotFound.push(username)
          continue
        }
        throw new Error(
          `Failed to add '${username}' to Gitea team '${request.teamName}' (${response.status}).`,
        )
      }

      return {
        created,
        teamSlug: String(teamId),
        membersAdded,
        membersNotFound,
      }
    },
    async assignRepositoriesToTeam(
      draft: GitConnectionDraft,
      request: AssignRepositoriesToTeamRequest,
      signal?: AbortSignal,
    ): Promise<void> {
      if (!resolveApiBase(draft)) {
        throw new Error("Gitea baseUrl is required.")
      }

      const teamId = Number.parseInt(request.teamSlug, 10)
      if (!Number.isFinite(teamId)) {
        throw new Error(`Invalid Gitea team identifier '${request.teamSlug}'.`)
      }

      for (const repositoryName of request.repositoryNames) {
        if (signal?.aborted) {
          break
        }

        const response = await giteaRequest(
          http,
          draft,
          "PUT",
          `/teams/${teamId}/repos/${encodeURIComponent(request.organization)}/${encodeURIComponent(repositoryName)}`,
          undefined,
          signal,
        )
        if (response.status >= 200 && response.status < 300) {
          continue
        }
        if (response.status === 409) {
          continue
        }
        throw new Error(
          `Failed to assign repository '${repositoryName}' to Gitea team '${request.teamSlug}' (${response.status}).`,
        )
      }
    },
    async getRepositoryDefaultBranchHead(
      draft: GitConnectionDraft,
      request: RepositoryHeadRequest,
      signal?: AbortSignal,
    ): Promise<RepositoryHead | null> {
      if (!resolveApiBase(draft)) {
        return null
      }
      const repo = await giteaRequest(
        http,
        draft,
        "GET",
        `/repos/${encodeURIComponent(request.owner)}/${encodeURIComponent(request.repositoryName)}`,
        undefined,
        signal,
      )
      if (repo.status === 404) {
        return null
      }
      if (repo.status < 200 || repo.status >= 300) {
        throw new Error(
          `Failed to resolve repository '${request.owner}/${request.repositoryName}' (${repo.status}).`,
        )
      }
      const branchName =
        typeof (repo.data as { default_branch?: unknown } | null)
          ?.default_branch === "string"
          ? (repo.data as { default_branch: string }).default_branch
          : null
      if (branchName === null) {
        return null
      }
      const branch = await giteaRequest(
        http,
        draft,
        "GET",
        `/repos/${encodeURIComponent(request.owner)}/${encodeURIComponent(request.repositoryName)}/branches/${encodeURIComponent(branchName)}`,
        undefined,
        signal,
      )
      if (branch.status === 404) {
        return null
      }
      if (branch.status < 200 || branch.status >= 300) {
        throw new Error(
          `Failed to resolve branch '${branchName}' (${branch.status}).`,
        )
      }
      const commitId =
        typeof (branch.data as { commit?: { id?: unknown } | null } | null)
          ?.commit?.id === "string"
          ? (branch.data as { commit: { id: string } }).commit.id
          : null
      if (commitId === null) {
        return null
      }
      return {
        sha: commitId,
        branchName,
      }
    },
    async getTemplateDiff(
      draft: GitConnectionDraft,
      request: GetTemplateDiffRequest,
      signal?: AbortSignal,
    ): Promise<GetTemplateDiffResult | null> {
      if (!resolveApiBase(draft)) {
        return null
      }
      const compare = await giteaRequest(
        http,
        draft,
        "GET",
        `/repos/${encodeURIComponent(request.owner)}/${encodeURIComponent(request.repositoryName)}/compare/${encodeURIComponent(request.fromSha)}...${encodeURIComponent(request.toSha)}`,
        undefined,
        signal,
      )
      if (compare.status === 404) {
        return null
      }
      if (compare.status < 200 || compare.status >= 300) {
        throw new Error(
          `Failed to compare template commits (${compare.status}).`,
        )
      }
      const changedFiles =
        (compare.data as { files?: unknown } | null)?.files ?? []
      if (!Array.isArray(changedFiles)) {
        return { files: [] }
      }
      const files: PatchFile[] = []
      for (const entry of changedFiles) {
        if (typeof entry !== "object" || entry === null) {
          continue
        }
        const file = entry as {
          filename?: unknown
          previous_filename?: unknown
          status?: unknown
        }
        if (typeof file.filename !== "string") {
          continue
        }
        const status = normalizeTemplateDiffStatus(String(file.status ?? ""))
        let contentBase64: string | null = null
        if (status !== "removed") {
          const resolved = await readRepositoryFile(
            http,
            draft,
            request.owner,
            request.repositoryName,
            file.filename,
            request.toSha,
            signal,
          )
          contentBase64 = resolved.contentBase64
          if (contentBase64 === null) {
            continue
          }
        }
        files.push({
          path: file.filename,
          previousPath:
            typeof file.previous_filename === "string"
              ? file.previous_filename
              : null,
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
      if (!resolveApiBase(draft)) {
        throw new Error("Gitea baseUrl is required.")
      }
      const createBranchResponse = await giteaRequest(
        http,
        draft,
        "POST",
        `/repos/${encodeURIComponent(request.owner)}/${encodeURIComponent(request.repositoryName)}/branches`,
        JSON.stringify({
          new_branch_name: request.branchName,
          old_ref: request.baseSha,
        }),
        signal,
      )
      if (
        createBranchResponse.status < 200 ||
        createBranchResponse.status >= 300
      ) {
        const message = toErrorMessage(createBranchResponse.data)
        if (!isNoChangesMessage(message)) {
          throw new Error(
            `Failed to create branch '${request.branchName}' (${createBranchResponse.status}).`,
          )
        }
      }

      for (const file of request.files) {
        if (signal?.aborted) {
          break
        }
        if (file.status === "removed") {
          const existing = await readRepositoryFile(
            http,
            draft,
            request.owner,
            request.repositoryName,
            file.path,
            request.branchName,
            signal,
          )
          if (existing.sha === null) {
            continue
          }
          const removeResponse = await giteaRequest(
            http,
            draft,
            "DELETE",
            `/repos/${encodeURIComponent(request.owner)}/${encodeURIComponent(request.repositoryName)}/contents/${encodeURIComponent(file.path)}`,
            JSON.stringify({
              branch: request.branchName,
              message: request.commitMessage,
              sha: existing.sha,
            }),
            signal,
          )
          if (removeResponse.status >= 200 && removeResponse.status < 300) {
            continue
          }
          if (removeResponse.status === 404) {
            continue
          }
          throw new Error(
            `Failed to delete '${file.path}' (${removeResponse.status}).`,
          )
        } else if (file.contentBase64 !== null) {
          const existing = await readRepositoryFile(
            http,
            draft,
            request.owner,
            request.repositoryName,
            file.path,
            request.branchName,
            signal,
          )
          const upsertResponse = await giteaRequest(
            http,
            draft,
            "PUT",
            `/repos/${encodeURIComponent(request.owner)}/${encodeURIComponent(request.repositoryName)}/contents/${encodeURIComponent(file.path)}`,
            JSON.stringify({
              branch: request.branchName,
              message: request.commitMessage,
              content: file.contentBase64,
              ...(existing.sha ? { sha: existing.sha } : {}),
            }),
            signal,
          )
          if (upsertResponse.status < 200 || upsertResponse.status >= 300) {
            const message = toErrorMessage(upsertResponse.data)
            if (!isNoChangesMessage(message)) {
              throw new Error(
                `Failed to update '${file.path}' (${upsertResponse.status}).`,
              )
            }
          }
        }

        if (file.previousPath && file.previousPath !== file.path) {
          const previous = await readRepositoryFile(
            http,
            draft,
            request.owner,
            request.repositoryName,
            file.previousPath,
            request.branchName,
            signal,
          )
          if (previous.sha !== null) {
            await giteaRequest(
              http,
              draft,
              "DELETE",
              `/repos/${encodeURIComponent(request.owner)}/${encodeURIComponent(request.repositoryName)}/contents/${encodeURIComponent(file.previousPath)}`,
              JSON.stringify({
                branch: request.branchName,
                message: request.commitMessage,
                sha: previous.sha,
              }),
              signal,
            )
          }
        }
      }
    },
    async createPullRequest(
      draft: GitConnectionDraft,
      request: CreatePullRequestRequest,
      signal?: AbortSignal,
    ): Promise<CreatePullRequestResult> {
      if (!resolveApiBase(draft)) {
        throw new Error("Gitea baseUrl is required.")
      }
      const createResponse = await giteaRequest(
        http,
        draft,
        "POST",
        `/repos/${encodeURIComponent(request.owner)}/${encodeURIComponent(request.repositoryName)}/pulls`,
        JSON.stringify({
          head: request.headBranch,
          base: request.baseBranch,
          title: request.title,
          body: request.body,
        }),
        signal,
      )
      if (createResponse.status >= 200 && createResponse.status < 300) {
        const url =
          (createResponse.data as { html_url?: unknown } | null)?.html_url ?? ""
        return {
          url: typeof url === "string" ? url : "",
          created: true,
        }
      }

      const message = toErrorMessage(createResponse.data)
      if (!isNoChangesMessage(message)) {
        throw new Error(
          `Failed to create Gitea pull request (${createResponse.status}): ${message || "unknown error"}`,
        )
      }

      const existing = await giteaRequest(
        http,
        draft,
        "GET",
        `/repos/${encodeURIComponent(request.owner)}/${encodeURIComponent(request.repositoryName)}/pulls?state=open`,
        undefined,
        signal,
      )
      if (existing.status >= 200 && existing.status < 300) {
        const pr = Array.isArray(existing.data)
          ? existing.data.find((entry) => {
              if (typeof entry !== "object" || entry === null) {
                return false
              }
              const candidate = entry as {
                head?: { label?: unknown } | null
                base?: { ref?: unknown } | null
              }
              return (
                candidate.base?.ref === request.baseBranch &&
                typeof candidate.head?.label === "string" &&
                candidate.head.label.endsWith(`:${request.headBranch}`)
              )
            })
          : null
        const url =
          typeof pr === "object" && pr !== null
            ? (pr as { html_url?: unknown }).html_url
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
  }
}

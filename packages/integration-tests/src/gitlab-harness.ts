import type { GitConnectionDraft } from "@repo-edu/integrations-git-contract"
import type {
  GitProviderHarness,
  IntegrationPullRequest,
  IntegrationTeam,
} from "./git-provider-harness.js"

const TEACHER = {
  username: "integration-teacher",
  password: "S9mR4tK8qP2vX7nL5dH1cB6wF3zJ",
} as const

function resolveHost(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/+$/, "")
  return normalized.endsWith("/api/v4")
    ? normalized.slice(0, -"/api/v4".length)
    : normalized
}

type GitLabResponse = {
  status: number
  data: unknown
}

async function gitLabFetch(
  host: string,
  token: string,
  path: string,
  options?: {
    method?: string
    body?: unknown
  },
): Promise<GitLabResponse> {
  const response = await fetch(`${host}/api/v4${path}`, {
    method: options?.method ?? "GET",
    headers: {
      "private-token": token,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body:
      options?.body === undefined ? undefined : JSON.stringify(options.body),
  })

  const text = await response.text()
  if (text === "") {
    return {
      status: response.status,
      data: null,
    }
  }

  try {
    return {
      status: response.status,
      data: JSON.parse(text),
    }
  } catch {
    return {
      status: response.status,
      data: text,
    }
  }
}

async function gitLabFetchPages(
  host: string,
  token: string,
  path: string,
): Promise<unknown[]> {
  const entries: unknown[] = []
  for (let page = 1; page <= 100; page += 1) {
    const separator = path.includes("?") ? "&" : "?"
    const result = await gitLabFetch(
      host,
      token,
      `${path}${separator}per_page=100&page=${page}`,
    )
    if (result.status !== 200 || !Array.isArray(result.data)) {
      throw new Error(
        `Failed to list GitLab resources at '${path}' (${result.status}): ${JSON.stringify(result.data)}`,
      )
    }
    entries.push(...result.data)
    if (result.data.length < 100) {
      return entries
    }
  }
  throw new Error(`GitLab pagination exceeded 100 pages at '${path}'.`)
}

async function waitForGitLab(host: string, token: string): Promise<void> {
  const maxAttempts = 120
  const intervalMs = 2000

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const version = await gitLabFetch(host, token, "/version")
      if (version.status === 200) {
        return
      }
    } catch {
      // Retry while service starts.
    }

    if (attempt === maxAttempts) {
      throw new Error(
        `GitLab at ${host} did not become ready within ${(maxAttempts * intervalMs) / 1000}s.`,
      )
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function resolveGroupId(
  host: string,
  token: string,
  groupPath: string,
): Promise<number | null> {
  const result = await gitLabFetch(
    host,
    token,
    `/groups/${encodeURIComponent(groupPath)}`,
  )
  if (result.status === 404) {
    return null
  }
  if (result.status !== 200) {
    throw new Error(
      `Failed to resolve group '${groupPath}' (${result.status}): ${JSON.stringify(result.data)}`,
    )
  }
  const id = (result.data as { id?: unknown }).id
  return typeof id === "number" ? id : null
}

async function ensureParentGroup(
  host: string,
  token: string,
  groupPath: string,
): Promise<number> {
  const existing = await resolveGroupId(host, token, groupPath)
  if (existing !== null) {
    return existing
  }

  const segments = groupPath.split("/").filter(Boolean)
  if (segments.length !== 1) {
    throw new Error(
      `INTEGRATION_GITLAB_PARENT_GROUP must be a single segment when auto-creating. Received '${groupPath}'.`,
    )
  }

  const create = await gitLabFetch(host, token, "/groups", {
    method: "POST",
    body: {
      name: groupPath,
      path: groupPath,
      visibility: "private",
    },
  })

  if (create.status !== 201 && create.status !== 409 && create.status !== 400) {
    throw new Error(
      `Failed to create parent group '${groupPath}' (${create.status}): ${JSON.stringify(create.data)}`,
    )
  }

  const resolved = await resolveGroupId(host, token, groupPath)
  if (resolved === null) {
    throw new Error(`Failed to resolve parent group '${groupPath}'.`)
  }
  return resolved
}

async function findUserId(
  host: string,
  adminToken: string,
  username: string,
): Promise<number | null> {
  const users = await gitLabFetchPages(
    host,
    adminToken,
    `/users?username=${encodeURIComponent(username)}`,
  )
  const match = users.find(
    (entry) => (entry as { username?: unknown }).username === username,
  ) as { id?: unknown } | undefined
  return typeof match?.id === "number" ? match.id : null
}

async function ensureTeacher(
  host: string,
  adminToken: string,
): Promise<number> {
  const existing = await findUserId(host, adminToken, TEACHER.username)
  if (existing !== null) {
    return existing
  }

  const create = await gitLabFetch(host, adminToken, "/users", {
    method: "POST",
    body: {
      email: `${TEACHER.username}@test.local`,
      username: TEACHER.username,
      name: "Integration Teacher",
      password: TEACHER.password,
      skip_confirmation: true,
    },
  })
  if (create.status === 201) {
    const teacherId = (create.data as { id?: unknown }).id
    if (typeof teacherId !== "number") {
      throw new Error("GitLab teacher response did not contain an id.")
    }
    return teacherId
  }

  for (let attempt = 1; attempt <= 10; attempt += 1) {
    const concurrent = await findUserId(host, adminToken, TEACHER.username)
    if (concurrent !== null) {
      return concurrent
    }
    await sleep(500)
  }

  throw new Error(
    `Failed to create GitLab teacher (${create.status}): ${JSON.stringify(create.data)}`,
  )
}

async function ensureGroupOwner(
  host: string,
  adminToken: string,
  groupId: number,
  userId: number,
): Promise<void> {
  const create = await gitLabFetch(
    host,
    adminToken,
    `/groups/${groupId}/members`,
    {
      method: "POST",
      body: { user_id: userId, access_level: 50 },
    },
  )
  if (create.status === 201) {
    return
  }

  for (let attempt = 1; attempt <= 10; attempt += 1) {
    const membership = await gitLabFetch(
      host,
      adminToken,
      `/groups/${groupId}/members/${userId}`,
    )
    if (membership.status === 200) {
      if ((membership.data as { access_level?: unknown }).access_level === 50) {
        return
      }
      const update = await gitLabFetch(
        host,
        adminToken,
        `/groups/${groupId}/members/${userId}`,
        {
          method: "PUT",
          body: { access_level: 50 },
        },
      )
      if (update.status === 200) {
        return
      }
    }
    await sleep(500)
  }

  throw new Error(
    `Failed to add GitLab teacher to parent group (${create.status}): ${JSON.stringify(create.data)}`,
  )
}

async function createTeacherToken(
  host: string,
  adminToken: string,
  teacherId: number,
): Promise<string> {
  const expiresAt = new Date()
  expiresAt.setUTCFullYear(expiresAt.getUTCFullYear() + 1)
  const create = await gitLabFetch(
    host,
    adminToken,
    `/users/${teacherId}/personal_access_tokens`,
    {
      method: "POST",
      body: {
        name: `integration-teacher-${Date.now()}`,
        scopes: ["api"],
        expires_at: expiresAt.toISOString().slice(0, 10),
      },
    },
  )
  if (create.status !== 201) {
    throw new Error(
      `Failed to create GitLab teacher token (${create.status}): ${JSON.stringify(create.data)}`,
    )
  }
  const token = (create.data as { token?: unknown }).token
  if (typeof token !== "string" || token === "") {
    throw new Error("GitLab teacher token response did not contain a token.")
  }
  return token
}

async function waitForGitLabCloneEndpoint(
  host: string,
  token: string,
  projectPath: string,
): Promise<void> {
  const endpoint = new URL(`${host}/${projectPath}.git/info/refs`)
  endpoint.searchParams.set("service", "git-upload-pack")
  const authorization = `Basic ${Buffer.from(`oauth2:${token}`).toString("base64")}`
  let lastStatus: number | null = null

  for (let attempt = 1; attempt <= 40; attempt += 1) {
    const response = await fetch(endpoint, {
      headers: {
        Accept: "application/x-git-upload-pack-advertisement",
        Authorization: authorization,
      },
    })
    lastStatus = response.status
    await response.arrayBuffer()
    if (response.status === 200) {
      return
    }
    await sleep(500)
  }

  throw new Error(
    `GitLab project '${projectPath}' did not expose its clone endpoint within 20s (last status ${String(lastStatus)}).`,
  )
}

export function createGitLabHarness(): GitProviderHarness {
  const baseUrl = process.env.INTEGRATION_GITLAB_URL ?? ""
  const adminToken = process.env.INTEGRATION_GITLAB_TOKEN ?? ""
  const parentGroupPath =
    process.env.INTEGRATION_GITLAB_PARENT_GROUP ?? "integration-root"
  const host = resolveHost(baseUrl)
  let teacherToken: string | null = null

  const getTeacherToken = (): string => {
    if (teacherToken === null) {
      throw new Error("GitLab teacher token is not initialized.")
    }
    return teacherToken
  }

  const getConnectionDraft = (): GitConnectionDraft => ({
    provider: "gitlab",
    baseUrl: host,
    token: getTeacherToken(),
  })

  const getParentPath = (): string | null =>
    parentGroupPath.trim() === "" ? null : parentGroupPath.trim()

  return {
    label: "GitLab",
    missingConfiguration: [
      ...(host === "" ? ["INTEGRATION_GITLAB_URL"] : []),
      ...(adminToken === "" ? ["INTEGRATION_GITLAB_TOKEN"] : []),
    ],
    supportsUserProvisioning: true,
    fixtureGitUsernames: [],
    async ensureReady() {
      await waitForGitLab(host, adminToken)
      const parentPath = getParentPath()
      if (parentPath !== null) {
        const parentId = await ensureParentGroup(host, adminToken, parentPath)
        const teacherId = await ensureTeacher(host, adminToken)
        await ensureGroupOwner(host, adminToken, parentId, teacherId)
        teacherToken = await createTeacherToken(host, adminToken, teacherId)
        return
      }
      const teacherId = await ensureTeacher(host, adminToken)
      teacherToken = await createTeacherToken(host, adminToken, teacherId)
    },
    getConnectionDraft,
    async createOrganization(orgName: string): Promise<string> {
      const parentPath = getParentPath()
      let parentId: number | null = null
      if (parentPath !== null) {
        parentId = await ensureParentGroup(host, getTeacherToken(), parentPath)
      }

      const payload: Record<string, unknown> = {
        name: orgName,
        path: orgName,
        visibility: "private",
      }
      if (parentId !== null) {
        payload.parent_id = parentId
      }

      const create = await gitLabFetch(host, getTeacherToken(), "/groups", {
        method: "POST",
        body: payload,
      })

      if (
        create.status !== 201 &&
        create.status !== 409 &&
        create.status !== 400
      ) {
        throw new Error(
          `Failed to create group '${orgName}' (${create.status}): ${JSON.stringify(create.data)}`,
        )
      }

      const fullPath =
        parentPath === null ? orgName : `${parentPath}/${orgName}`
      const resolved = await resolveGroupId(host, getTeacherToken(), fullPath)
      if (resolved === null) {
        throw new Error(`Failed to resolve created group '${fullPath}'.`)
      }
      return fullPath
    },
    async cleanupOrganization(
      orgName: string,
      _resourcePrefix: string,
    ): Promise<void> {
      const remove = await gitLabFetch(
        host,
        adminToken,
        `/groups/${encodeURIComponent(orgName)}`,
        {
          method: "DELETE",
        },
      )

      if (
        remove.status !== 202 &&
        remove.status !== 200 &&
        remove.status !== 204 &&
        remove.status !== 404
      ) {
        throw new Error(
          `Failed to remove group '${orgName}' (${remove.status}): ${JSON.stringify(remove.data)}`,
        )
      }
    },
    async seedUsers(usernames: string[]): Promise<void> {
      for (const username of usernames) {
        const maxAttempts = 3
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
          const create = await gitLabFetch(host, adminToken, "/users", {
            method: "POST",
            body: {
              email: `${username}@test.local`,
              username,
              name: username,
              password: "S9mR4tK8qP2vX7nL5dH1cB6wF3zJ",
              skip_confirmation: true,
            },
          })

          if (
            create.status === 201 ||
            create.status === 409 ||
            create.status === 422
          ) {
            break
          }

          const lookup = await gitLabFetch(
            host,
            adminToken,
            `/users?username=${encodeURIComponent(username)}&per_page=100`,
          )
          if (lookup.status === 200 && Array.isArray(lookup.data)) {
            const exists = lookup.data.some((entry) => {
              const record = entry as { username?: unknown }
              return record.username === username
            })
            if (exists) {
              break
            }
          }

          const canRetry = create.status >= 500 || create.status === 429
          if (canRetry && attempt < maxAttempts) {
            await sleep(attempt * 1000)
            continue
          }

          throw new Error(
            `Failed to create GitLab user '${username}' (${create.status}): ${JSON.stringify(create.data)}`,
          )
        }
      }
    },
    async blockUser(username: string): Promise<void> {
      const userId = await findUserId(host, adminToken, username)
      if (userId === null) {
        throw new Error(`GitLab user '${username}' was not found.`)
      }
      const block = await gitLabFetch(
        host,
        adminToken,
        `/users/${userId}/block`,
        {
          method: "POST",
        },
      )
      if (block.status !== 201) {
        throw new Error(
          `Failed to block GitLab user '${username}' (${block.status}): ${JSON.stringify(block.data)}`,
        )
      }
    },
    async seedTemplateRepository(
      orgName: string,
      repoName: string,
    ): Promise<void> {
      await this.seedOrganizationRepository(orgName, repoName, {
        autoInit: true,
      })
    },
    async seedOrganizationRepository(
      orgName: string,
      repoName: string,
      options?: { autoInit?: boolean },
    ): Promise<void> {
      const namespaceId = await resolveGroupId(host, adminToken, orgName)
      if (namespaceId === null) {
        throw new Error(`GitLab group '${orgName}' was not found.`)
      }

      const create = await gitLabFetch(host, adminToken, "/projects", {
        method: "POST",
        body: {
          name: repoName,
          namespace_id: namespaceId,
          visibility: "private",
          initialize_with_readme: options?.autoInit ?? true,
        },
      })

      if (
        create.status !== 201 &&
        create.status !== 409 &&
        create.status !== 400
      ) {
        throw new Error(
          `Failed to create GitLab project '${orgName}/${repoName}' (${create.status}): ${JSON.stringify(create.data)}`,
        )
      }

      const projectPath = `${orgName}/${repoName}`
      if (options?.autoInit !== false) {
        let branchReady = false
        for (let attempt = 1; attempt <= 40; attempt += 1) {
          const branches = await gitLabFetch(
            host,
            adminToken,
            `/projects/${encodeURIComponent(projectPath)}/repository/branches?per_page=1`,
          )
          if (
            branches.status === 200 &&
            Array.isArray(branches.data) &&
            branches.data.length > 0
          ) {
            branchReady = true
            break
          }
          await sleep(500)
        }
        if (!branchReady) {
          throw new Error(
            `GitLab project '${projectPath}' did not publish its initial branch within 20s.`,
          )
        }
      }

      await waitForGitLabCloneEndpoint(host, getTeacherToken(), projectPath)
    },
    async readRepositoryFile(
      orgName: string,
      repoName: string,
      branchName: string,
      path: string,
    ): Promise<string | null> {
      const projectPath = `${orgName}/${repoName}`
      const result = await gitLabFetch(
        host,
        getTeacherToken(),
        `/projects/${encodeURIComponent(projectPath)}/repository/files/${encodeURIComponent(path)}?ref=${encodeURIComponent(branchName)}`,
      )
      if (result.status === 404) {
        return null
      }
      const file = result.data as {
        content?: unknown
        encoding?: unknown
      } | null
      if (
        result.status !== 200 ||
        typeof file?.content !== "string" ||
        file.encoding !== "base64"
      ) {
        throw new Error(
          `Failed to read GitLab file '${projectPath}:${branchName}:${path}' (${result.status}): ${JSON.stringify(result.data)}`,
        )
      }
      return Buffer.from(file.content, "base64").toString("utf8")
    },
    async listPullRequests(
      orgName: string,
      repoName: string,
    ): Promise<IntegrationPullRequest[]> {
      const projectPath = `${orgName}/${repoName}`
      const pulls = await gitLabFetchPages(
        host,
        getTeacherToken(),
        `/projects/${encodeURIComponent(projectPath)}/merge_requests?state=opened`,
      )
      return pulls.map((entry) => {
        const pull = entry as {
          source_branch?: unknown
          target_branch?: unknown
          web_url?: unknown
        }
        if (
          typeof pull.source_branch !== "string" ||
          typeof pull.target_branch !== "string" ||
          typeof pull.web_url !== "string"
        ) {
          throw new Error(
            `GitLab answered an unreadable merge request for '${projectPath}'.`,
          )
        }
        return {
          headBranch: pull.source_branch,
          baseBranch: pull.target_branch,
          url: pull.web_url,
        }
      })
    },
    async verifyRepositoriesExist(
      orgName: string,
      names: string[],
    ): Promise<string[]> {
      const existing: string[] = []
      for (const name of names) {
        const projectPath = `${orgName}/${name}`
        const result = await gitLabFetch(
          host,
          getTeacherToken(),
          `/projects/${encodeURIComponent(projectPath)}`,
        )
        if (result.status === 200) {
          existing.push(name)
        }
      }
      return existing
    },
    async verifyTeams(orgName: string): Promise<IntegrationTeam[]> {
      const teams = await gitLabFetchPages(
        host,
        getTeacherToken(),
        `/groups/${encodeURIComponent(orgName)}/subgroups`,
      )

      return teams
        .map((entry) => {
          const team = entry as { id?: unknown; name?: unknown }
          return {
            id: typeof team.id === "number" ? team.id : -1,
            name: typeof team.name === "string" ? team.name : "",
          }
        })
        .filter((team) => team.id !== -1 && team.name !== "")
    },
    async verifyTeamMembers(
      _orgName: string,
      team: IntegrationTeam,
    ): Promise<string[]> {
      const teamId = Number(team.id)
      if (!Number.isFinite(teamId)) {
        throw new Error(`Invalid GitLab team id '${String(team.id)}'.`)
      }

      const members = await gitLabFetchPages(
        host,
        getTeacherToken(),
        `/groups/${teamId}/members`,
      )
      return members
        .map((entry) => {
          const member = entry as { username?: unknown }
          return typeof member.username === "string" ? member.username : null
        })
        .filter((entry): entry is string => entry !== null)
    },
    async verifyTeamRepos(
      _orgName: string,
      team: IntegrationTeam,
    ): Promise<string[]> {
      const teamId = Number(team.id)
      if (!Number.isFinite(teamId)) {
        throw new Error(`Invalid GitLab team id '${String(team.id)}'.`)
      }

      let projectsPath = `/groups/${teamId}/projects/shared`
      const probe = await gitLabFetch(
        host,
        getTeacherToken(),
        `${projectsPath}?per_page=1`,
      )
      if (probe.status === 404) {
        projectsPath = `/groups/${teamId}/projects?with_shared=true&include_subgroups=true`
      } else if (probe.status !== 200 || !Array.isArray(probe.data)) {
        throw new Error(
          `Failed to list repositories for GitLab group '${teamId}' (${probe.status}).`,
        )
      }

      const projects = await gitLabFetchPages(
        host,
        getTeacherToken(),
        projectsPath,
      )
      return projects
        .map((entry) => {
          const project = entry as { path?: unknown }
          return typeof project.path === "string" ? project.path : null
        })
        .filter((entry): entry is string => entry !== null)
    },
  }
}

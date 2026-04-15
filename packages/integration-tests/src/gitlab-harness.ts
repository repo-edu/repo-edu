import type { GitConnectionDraft } from "@repo-edu/integrations-git-contract"
import type {
  GitProviderHarness,
  IntegrationTeam,
} from "./git-provider-harness.js"

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

export function createGitLabHarness(): GitProviderHarness {
  const baseUrl = process.env.INTEGRATION_GITLAB_URL ?? ""
  const token = process.env.INTEGRATION_GITLAB_TOKEN ?? ""
  const parentGroupPath =
    process.env.INTEGRATION_GITLAB_PARENT_GROUP ?? "integration-root"
  const host = resolveHost(baseUrl)

  const getConnectionDraft = (): GitConnectionDraft => ({
    provider: "gitlab",
    baseUrl: host,
    token,
  })

  const getParentPath = (): string | null =>
    parentGroupPath.trim() === "" ? null : parentGroupPath.trim()

  return {
    label: "GitLab",
    isConfigured: host !== "" && token !== "",
    supportsUserProvisioning: true,
    assertTeamMemberAssignments: true,
    fixtureGitUsernames: [],
    async ensureReady() {
      await waitForGitLab(host, token)
      const parentPath = getParentPath()
      if (parentPath !== null) {
        await ensureParentGroup(host, token, parentPath)
      }
    },
    getConnectionDraft,
    async createOrganization(orgName: string): Promise<string> {
      const parentPath = getParentPath()
      let parentId: number | null = null
      if (parentPath !== null) {
        parentId = await ensureParentGroup(host, token, parentPath)
      }

      const payload: Record<string, unknown> = {
        name: orgName,
        path: orgName,
        visibility: "private",
      }
      if (parentId !== null) {
        payload.parent_id = parentId
      }

      const create = await gitLabFetch(host, token, "/groups", {
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
      const resolved = await resolveGroupId(host, token, fullPath)
      if (resolved === null) {
        throw new Error(`Failed to resolve created group '${fullPath}'.`)
      }
      return fullPath
    },
    async cleanupOrganization(orgName: string): Promise<void> {
      const remove = await gitLabFetch(
        host,
        token,
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
          const create = await gitLabFetch(host, token, "/users", {
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
            token,
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
      const namespaceId = await resolveGroupId(host, token, orgName)
      if (namespaceId === null) {
        throw new Error(`GitLab group '${orgName}' was not found.`)
      }

      const create = await gitLabFetch(host, token, "/projects", {
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
    },
    async deleteOrganizationRepository(
      orgName: string,
      repoName: string,
    ): Promise<void> {
      const projectPath = `${orgName}/${repoName}`
      const remove = await gitLabFetch(
        host,
        token,
        `/projects/${encodeURIComponent(projectPath)}`,
        { method: "DELETE" },
      )
      if (
        remove.status !== 202 &&
        remove.status !== 200 &&
        remove.status !== 204 &&
        remove.status !== 404
      ) {
        throw new Error(
          `Failed to delete GitLab project '${projectPath}' (${remove.status}): ${JSON.stringify(remove.data)}`,
        )
      }
      // GitLab schedules project deletion asynchronously; poll until the
      // project actually disappears so the next create runs against a
      // freshly-empty slot rather than racing the background job.
      const maxAttempts = 20
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const check = await gitLabFetch(
          host,
          token,
          `/projects/${encodeURIComponent(projectPath)}`,
        )
        if (check.status === 404) {
          return
        }
        await sleep(500)
      }
      throw new Error(
        `GitLab project '${projectPath}' still present after delete poll timeout.`,
      )
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
          token,
          `/projects/${encodeURIComponent(projectPath)}`,
        )
        if (result.status === 200) {
          existing.push(name)
        }
      }
      return existing
    },
    async verifyTeams(orgName: string): Promise<IntegrationTeam[]> {
      const result = await gitLabFetch(
        host,
        token,
        `/groups/${encodeURIComponent(orgName)}/subgroups?per_page=100`,
      )
      if (result.status !== 200 || !Array.isArray(result.data)) {
        throw new Error(
          `Failed to list GitLab subgroups for '${orgName}' (${result.status}).`,
        )
      }

      return result.data
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

      const result = await gitLabFetch(
        host,
        token,
        `/groups/${teamId}/members?per_page=100`,
      )
      if (result.status !== 200 || !Array.isArray(result.data)) {
        throw new Error(
          `Failed to list members for GitLab group '${teamId}' (${result.status}).`,
        )
      }
      return result.data
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

      let result = await gitLabFetch(
        host,
        token,
        `/groups/${teamId}/projects/shared?per_page=100`,
      )
      if (result.status === 404) {
        result = await gitLabFetch(
          host,
          token,
          `/groups/${teamId}/projects?with_shared=true&include_subgroups=true&per_page=100`,
        )
      }

      if (result.status !== 200 || !Array.isArray(result.data)) {
        throw new Error(
          `Failed to list repositories for GitLab group '${teamId}' (${result.status}).`,
        )
      }
      return result.data
        .map((entry) => {
          const project = entry as { path?: unknown }
          return typeof project.path === "string" ? project.path : null
        })
        .filter((entry): entry is string => entry !== null)
    },
  }
}

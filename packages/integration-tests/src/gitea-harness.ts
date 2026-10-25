import type { GitConnectionDraft } from "@repo-edu/integrations-git-contract"
import type {
  GitProviderHarness,
  IntegrationTeam,
} from "./git-provider-harness.js"

const ADMIN_USERNAME = "test-admin"
const ADMIN_PASSWORD = "test-admin-pw"
const TEACHER = {
  username: "integration-teacher",
  password: "test-user-pw-00",
} as const

function basicAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`
}

function tokenAuthHeader(token: string): string {
  return `token ${token}`
}

async function giteaFetch(
  baseUrl: string,
  path: string,
  options: {
    method?: string
    auth: string
    body?: unknown
  },
): Promise<{ status: number; data: unknown }> {
  const response = await fetch(`${baseUrl}/api/v1${path}`, {
    method: options.method ?? "GET",
    headers: {
      Authorization: options.auth,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })

  let data: unknown = null
  const text = await response.text()
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }

  return { status: response.status, data }
}

async function ensureGiteaReady(baseUrl: string): Promise<void> {
  const maxAttempts = 30
  const intervalMs = 1000

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(`${baseUrl}/api/v1/version`)
      if (response.status === 200) {
        return
      }
    } catch {
      // Connection refused — retry.
    }
    if (attempt === maxAttempts) {
      throw new Error(
        `Gitea at ${baseUrl} did not become ready within ${maxAttempts}s.`,
      )
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
}

async function createAdminToken(baseUrl: string): Promise<string> {
  const tokenName = `integration-admin-${Date.now()}`
  const { status, data } = await giteaFetch(
    baseUrl,
    `/users/${ADMIN_USERNAME}/tokens`,
    {
      method: "POST",
      auth: basicAuthHeader(ADMIN_USERNAME, ADMIN_PASSWORD),
      body: {
        name: tokenName,
        scopes: [
          "read:admin",
          "write:admin",
          "read:organization",
          "write:organization",
          "read:repository",
          "write:repository",
          "read:user",
          "write:user",
        ],
      },
    },
  )

  if (status !== 201) {
    throw new Error(
      `Failed to create admin token (${status}): ${JSON.stringify(data)}`,
    )
  }

  const token = (data as { sha1?: string }).sha1
  if (!token) {
    throw new Error("Admin token response did not contain sha1 field.")
  }
  return token
}

async function createTeacher(
  baseUrl: string,
  adminToken: string,
): Promise<void> {
  const { status, data } = await giteaFetch(baseUrl, "/admin/users", {
    method: "POST",
    auth: tokenAuthHeader(adminToken),
    body: {
      username: TEACHER.username,
      email: `${TEACHER.username}@test.local`,
      password: TEACHER.password,
      must_change_password: false,
    },
  })

  if (status !== 201 && status !== 422) {
    throw new Error(
      `Failed to create Gitea teacher (${status}): ${JSON.stringify(data)}`,
    )
  }
}

async function createTeacherToken(baseUrl: string): Promise<string> {
  const { status, data } = await giteaFetch(
    baseUrl,
    `/users/${TEACHER.username}/tokens`,
    {
      method: "POST",
      auth: basicAuthHeader(TEACHER.username, TEACHER.password),
      body: {
        name: `integration-teacher-${Date.now()}`,
        scopes: [
          "read:organization",
          "write:organization",
          "read:repository",
          "write:repository",
          "read:user",
          "write:user",
        ],
      },
    },
  )

  if (status !== 201) {
    throw new Error(
      `Failed to create Gitea teacher token (${status}): ${JSON.stringify(data)}`,
    )
  }

  const token = (data as { sha1?: string }).sha1
  if (!token) {
    throw new Error("Gitea teacher token response did not contain sha1 field.")
  }
  return token
}

async function giteaFetchPages(
  baseUrl: string,
  path: string,
  auth: string,
): Promise<unknown[]> {
  const entries: unknown[] = []
  for (let page = 1; page <= 100; page += 1) {
    const separator = path.includes("?") ? "&" : "?"
    const result = await giteaFetch(
      baseUrl,
      `${path}${separator}limit=50&page=${page}`,
      { auth },
    )
    if (result.status !== 200 || !Array.isArray(result.data)) {
      throw new Error(
        `Failed to list Gitea resources at '${path}' (${result.status}): ${JSON.stringify(result.data)}`,
      )
    }
    entries.push(...result.data)
    if (result.data.length < 50) {
      return entries
    }
  }
  throw new Error(`Gitea pagination exceeded 100 pages at '${path}'.`)
}

export function createGiteaHarness(): GitProviderHarness {
  const baseUrl = process.env.INTEGRATION_GITEA_URL ?? ""
  let adminToken: string | null = null
  let teacherToken: string | null = null

  const getAdminToken = (): string => {
    if (adminToken === null) {
      throw new Error("Gitea admin token is not initialized.")
    }
    return adminToken
  }

  const getTeacherToken = (): string => {
    if (teacherToken === null) {
      throw new Error("Gitea teacher token is not initialized.")
    }
    return teacherToken
  }

  const getAdminAuth = (): string => tokenAuthHeader(getAdminToken())
  const getTeacherAuth = (): string => tokenAuthHeader(getTeacherToken())

  const getConnectionDraft = (): GitConnectionDraft => ({
    provider: "gitea",
    baseUrl,
    token: getTeacherToken(),
  })

  return {
    label: "Gitea",
    missingConfiguration: baseUrl === "" ? ["INTEGRATION_GITEA_URL"] : [],
    supportsUserProvisioning: true,
    assertTeamMemberAssignments: true,
    fixtureGitUsernames: [],
    async ensureReady() {
      await ensureGiteaReady(baseUrl)
      adminToken = await createAdminToken(baseUrl)
      await createTeacher(baseUrl, adminToken)
      teacherToken = await createTeacherToken(baseUrl)
    },
    getConnectionDraft,
    async createOrganization(orgName: string): Promise<string> {
      const { status } = await giteaFetch(baseUrl, "/orgs", {
        method: "POST",
        auth: getTeacherAuth(),
        body: { username: orgName, visibility: "private" },
      })

      if (status !== 201 && status !== 422) {
        throw new Error(`Failed to create org '${orgName}' (${status}).`)
      }
      return orgName
    },
    async cleanupOrganization(
      orgName: string,
      _resourcePrefix: string,
    ): Promise<void> {
      const auth = getAdminAuth()

      const repositories = await giteaFetchPages(
        baseUrl,
        `/orgs/${orgName}/repos`,
        auth,
      )
      for (const repo of repositories as Array<{ name: string }>) {
        const remove = await giteaFetch(
          baseUrl,
          `/repos/${orgName}/${repo.name}`,
          {
            method: "DELETE",
            auth,
          },
        )
        if (remove.status !== 204 && remove.status !== 404) {
          throw new Error(
            `Failed to delete Gitea repository '${orgName}/${repo.name}' (${remove.status}): ${JSON.stringify(remove.data)}`,
          )
        }
      }

      const teams = await giteaFetchPages(
        baseUrl,
        `/orgs/${orgName}/teams`,
        auth,
      )
      for (const team of teams as Array<{ id: number; name: string }>) {
        if (team.name === "Owners") {
          continue
        }
        const remove = await giteaFetch(baseUrl, `/teams/${team.id}`, {
          method: "DELETE",
          auth,
        })
        if (remove.status !== 204 && remove.status !== 404) {
          throw new Error(
            `Failed to delete Gitea team '${team.name}' (${remove.status}): ${JSON.stringify(remove.data)}`,
          )
        }
      }

      const removeOrganization = await giteaFetch(baseUrl, `/orgs/${orgName}`, {
        method: "DELETE",
        auth,
      })
      if (
        removeOrganization.status !== 204 &&
        removeOrganization.status !== 404
      ) {
        throw new Error(
          `Failed to delete Gitea organization '${orgName}' (${removeOrganization.status}): ${JSON.stringify(removeOrganization.data)}`,
        )
      }
    },
    async seedUsers(usernames: string[]): Promise<void> {
      for (const username of usernames) {
        const { status } = await giteaFetch(baseUrl, "/admin/users", {
          method: "POST",
          auth: getAdminAuth(),
          body: {
            username,
            email: `${username}@test.local`,
            password: "test-user-pw-00",
            must_change_password: false,
          },
        })

        if (status !== 201 && status !== 422) {
          throw new Error(`Failed to create user '${username}' (${status}).`)
        }
      }
    },
    async seedTemplateRepository(orgName: string, repoName: string) {
      const createResult = await giteaFetch(baseUrl, `/orgs/${orgName}/repos`, {
        method: "POST",
        auth: getAdminAuth(),
        body: {
          name: repoName,
          auto_init: true,
          private: true,
          template: false,
        },
      })

      if (createResult.status !== 201 && createResult.status !== 409) {
        throw new Error(
          `Failed to create template repo '${orgName}/${repoName}' (${createResult.status}).`,
        )
      }

      const patchResult = await giteaFetch(
        baseUrl,
        `/repos/${orgName}/${repoName}`,
        {
          method: "PATCH",
          auth: getAdminAuth(),
          body: { template: true },
        },
      )

      if (patchResult.status !== 200) {
        throw new Error(
          `Failed to mark '${orgName}/${repoName}' as template (${patchResult.status}).`,
        )
      }
    },
    async seedOrganizationRepository(
      orgName: string,
      repoName: string,
      options?: { autoInit?: boolean },
    ): Promise<void> {
      const createResult = await giteaFetch(baseUrl, `/orgs/${orgName}/repos`, {
        method: "POST",
        auth: getAdminAuth(),
        body: {
          name: repoName,
          auto_init: options?.autoInit ?? true,
          private: true,
          template: false,
        },
      })

      if (createResult.status !== 201 && createResult.status !== 409) {
        throw new Error(
          `Failed to create repo '${orgName}/${repoName}' (${createResult.status}).`,
        )
      }
    },
    async deleteOrganizationRepository(
      orgName: string,
      repoName: string,
    ): Promise<void> {
      const { status, data } = await giteaFetch(
        baseUrl,
        `/repos/${orgName}/${repoName}`,
        {
          method: "DELETE",
          auth: getAdminAuth(),
        },
      )
      if (status !== 204 && status !== 404) {
        throw new Error(
          `Failed to delete repo '${orgName}/${repoName}' (${status}): ${JSON.stringify(data)}`,
        )
      }
    },
    async verifyRepositoriesExist(
      orgName: string,
      names: string[],
    ): Promise<string[]> {
      const existing: string[] = []
      for (const name of names) {
        const { status } = await giteaFetch(
          baseUrl,
          `/repos/${orgName}/${name}`,
          {
            auth: getTeacherAuth(),
          },
        )
        if (status === 200) {
          existing.push(name)
        }
      }
      return existing
    },
    async verifyTeams(orgName: string): Promise<IntegrationTeam[]> {
      const teams = await giteaFetchPages(
        baseUrl,
        `/orgs/${orgName}/teams`,
        getTeacherAuth(),
      )

      return (teams as Array<{ id: number; name: string }>).map((team) => ({
        id: team.id,
        name: team.name,
      }))
    },
    async verifyTeamMembers(
      _orgName: string,
      team: IntegrationTeam,
    ): Promise<string[]> {
      const teamId =
        typeof team.id === "number" ? team.id : Number.parseInt(team.id, 10)
      if (!Number.isFinite(teamId)) {
        throw new Error(`Invalid Gitea team id '${String(team.id)}'.`)
      }

      const { status, data } = await giteaFetch(
        baseUrl,
        `/teams/${teamId}/members`,
        { auth: getTeacherAuth() },
      )

      if (status !== 200) {
        throw new Error(
          `Failed to list members for team ${teamId} (${status}).`,
        )
      }

      return (data as Array<{ login: string }>).map((member) => member.login)
    },
    async verifyTeamRepos(
      _orgName: string,
      team: IntegrationTeam,
    ): Promise<string[]> {
      const teamId =
        typeof team.id === "number" ? team.id : Number.parseInt(team.id, 10)
      if (!Number.isFinite(teamId)) {
        throw new Error(`Invalid Gitea team id '${String(team.id)}'.`)
      }

      const { status, data } = await giteaFetch(
        baseUrl,
        `/teams/${teamId}/repos`,
        {
          auth: getTeacherAuth(),
        },
      )

      if (status !== 200) {
        throw new Error(`Failed to list repos for team ${teamId} (${status}).`)
      }

      return (data as Array<{ name: string }>).map((repo) => repo.name)
    },
  }
}

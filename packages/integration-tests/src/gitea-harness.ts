import type { GitConnectionDraft } from "@repo-edu/integrations-git-contract"
import type {
  GitProviderHarness,
  IntegrationTeam,
} from "./git-provider-harness.js"

const ADMIN_USERNAME = "test-admin"
const ADMIN_PASSWORD = "test-admin-pw"

function basicAuthHeader(): string {
  return `Basic ${Buffer.from(`${ADMIN_USERNAME}:${ADMIN_PASSWORD}`).toString("base64")}`
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
  const tokenName = `integration-${Date.now()}`
  const { status, data } = await giteaFetch(
    baseUrl,
    `/users/${ADMIN_USERNAME}/tokens`,
    {
      method: "POST",
      auth: basicAuthHeader(),
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

export function createGiteaHarness(): GitProviderHarness {
  const baseUrl = process.env.INTEGRATION_GITEA_URL ?? ""
  let token: string | null = null

  const getToken = (): string => {
    if (token === null) {
      throw new Error("Gitea admin token is not initialized.")
    }
    return token
  }

  const getAuth = (): string => tokenAuthHeader(getToken())

  const getConnectionDraft = (): GitConnectionDraft => ({
    provider: "gitea",
    baseUrl,
    token: getToken(),
  })

  return {
    label: "Gitea",
    isConfigured: baseUrl !== "",
    supportsUserProvisioning: true,
    assertTeamMemberAssignments: true,
    fixtureGitUsernames: [],
    async ensureReady() {
      await ensureGiteaReady(baseUrl)
      token = await createAdminToken(baseUrl)
    },
    getConnectionDraft,
    async createOrganization(orgName: string): Promise<string> {
      const { status } = await giteaFetch(baseUrl, "/orgs", {
        method: "POST",
        auth: getAuth(),
        body: { username: orgName, visibility: "private" },
      })

      if (status !== 201 && status !== 422) {
        throw new Error(`Failed to create org '${orgName}' (${status}).`)
      }
      return orgName
    },
    async cleanupOrganization(orgName: string): Promise<void> {
      const auth = getAuth()

      const reposResult = await giteaFetch(
        baseUrl,
        `/orgs/${orgName}/repos?limit=50`,
        { auth },
      )
      if (reposResult.status === 200 && Array.isArray(reposResult.data)) {
        for (const repo of reposResult.data as Array<{ name: string }>) {
          await giteaFetch(baseUrl, `/repos/${orgName}/${repo.name}`, {
            method: "DELETE",
            auth,
          })
        }
      }

      const teamsResult = await giteaFetch(baseUrl, `/orgs/${orgName}/teams`, {
        auth,
      })
      if (teamsResult.status === 200 && Array.isArray(teamsResult.data)) {
        for (const team of teamsResult.data as Array<{
          id: number
          name: string
        }>) {
          if (team.name === "Owners") {
            continue
          }
          await giteaFetch(baseUrl, `/teams/${team.id}`, {
            method: "DELETE",
            auth,
          })
        }
      }

      await giteaFetch(baseUrl, `/orgs/${orgName}`, {
        method: "DELETE",
        auth,
      })
    },
    async seedUsers(usernames: string[]): Promise<void> {
      for (const username of usernames) {
        const { status } = await giteaFetch(baseUrl, "/admin/users", {
          method: "POST",
          auth: getAuth(),
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
        auth: getAuth(),
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
          auth: getAuth(),
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
        auth: getAuth(),
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
          auth: getAuth(),
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
            auth: getAuth(),
          },
        )
        if (status === 200) {
          existing.push(name)
        }
      }
      return existing
    },
    async verifyTeams(orgName: string): Promise<IntegrationTeam[]> {
      const { status, data } = await giteaFetch(
        baseUrl,
        `/orgs/${orgName}/teams`,
        {
          auth: getAuth(),
        },
      )

      if (status !== 200) {
        throw new Error(
          `Failed to list teams for org '${orgName}' (${status}).`,
        )
      }

      return (data as Array<{ id: number; name: string }>).map((team) => ({
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
        { auth: getAuth() },
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
          auth: getAuth(),
        },
      )

      if (status !== 200) {
        throw new Error(`Failed to list repos for team ${teamId} (${status}).`)
      }

      return (data as Array<{ name: string }>).map((repo) => repo.name)
    },
  }
}

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

export async function ensureGiteaReady(baseUrl: string): Promise<void> {
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

export async function createAdminToken(baseUrl: string): Promise<string> {
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

export async function seedGiteaOrganization(
  baseUrl: string,
  token: string,
  orgName: string,
): Promise<void> {
  const { status } = await giteaFetch(baseUrl, "/orgs", {
    method: "POST",
    auth: tokenAuthHeader(token),
    body: { username: orgName, visibility: "private" },
  })

  if (status !== 201 && status !== 422) {
    throw new Error(`Failed to create org '${orgName}' (${status}).`)
  }
}

export async function seedGiteaUsers(
  baseUrl: string,
  token: string,
  usernames: string[],
): Promise<void> {
  for (const username of usernames) {
    const { status } = await giteaFetch(baseUrl, "/admin/users", {
      method: "POST",
      auth: tokenAuthHeader(token),
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
}

export async function seedTemplateRepository(
  baseUrl: string,
  token: string,
  owner: string,
  repoName: string,
): Promise<void> {
  const createResult = await giteaFetch(baseUrl, `/orgs/${owner}/repos`, {
    method: "POST",
    auth: tokenAuthHeader(token),
    body: {
      name: repoName,
      auto_init: true,
      private: true,
      template: false,
    },
  })

  if (createResult.status !== 201 && createResult.status !== 409) {
    throw new Error(
      `Failed to create template repo '${owner}/${repoName}' (${createResult.status}).`,
    )
  }

  const patchResult = await giteaFetch(baseUrl, `/repos/${owner}/${repoName}`, {
    method: "PATCH",
    auth: tokenAuthHeader(token),
    body: { template: true },
  })

  if (patchResult.status !== 200) {
    throw new Error(
      `Failed to mark '${owner}/${repoName}' as template (${patchResult.status}).`,
    )
  }
}

export async function seedOrganizationRepository(
  baseUrl: string,
  token: string,
  owner: string,
  repoName: string,
  options?: {
    autoInit?: boolean
  },
): Promise<void> {
  const createResult = await giteaFetch(baseUrl, `/orgs/${owner}/repos`, {
    method: "POST",
    auth: tokenAuthHeader(token),
    body: {
      name: repoName,
      auto_init: options?.autoInit ?? true,
      private: true,
      template: false,
    },
  })

  if (createResult.status !== 201 && createResult.status !== 409) {
    throw new Error(
      `Failed to create repo '${owner}/${repoName}' (${createResult.status}).`,
    )
  }
}

export async function verifyRepositoriesExist(
  baseUrl: string,
  token: string,
  org: string,
  names: string[],
): Promise<string[]> {
  const existing: string[] = []
  for (const name of names) {
    const { status } = await giteaFetch(baseUrl, `/repos/${org}/${name}`, {
      auth: tokenAuthHeader(token),
    })
    if (status === 200) {
      existing.push(name)
    }
  }
  return existing
}

export async function verifyTeams(
  baseUrl: string,
  token: string,
  org: string,
): Promise<Array<{ id: number; name: string }>> {
  const { status, data } = await giteaFetch(baseUrl, `/orgs/${org}/teams`, {
    auth: tokenAuthHeader(token),
  })

  if (status !== 200) {
    throw new Error(`Failed to list teams for org '${org}' (${status}).`)
  }

  return (data as Array<{ id: number; name: string }>).map((team) => ({
    id: team.id,
    name: team.name,
  }))
}

export async function verifyTeamMembers(
  baseUrl: string,
  token: string,
  teamId: number,
): Promise<string[]> {
  const { status, data } = await giteaFetch(
    baseUrl,
    `/teams/${teamId}/members`,
    { auth: tokenAuthHeader(token) },
  )

  if (status !== 200) {
    throw new Error(`Failed to list members for team ${teamId} (${status}).`)
  }

  return (data as Array<{ login: string }>).map((member) => member.login)
}

export async function verifyTeamRepos(
  baseUrl: string,
  token: string,
  teamId: number,
): Promise<string[]> {
  const { status, data } = await giteaFetch(baseUrl, `/teams/${teamId}/repos`, {
    auth: tokenAuthHeader(token),
  })

  if (status !== 200) {
    throw new Error(`Failed to list repos for team ${teamId} (${status}).`)
  }

  return (data as Array<{ name: string }>).map((repo) => repo.name)
}

export async function cleanupOrganization(
  baseUrl: string,
  token: string,
  orgName: string,
): Promise<void> {
  const auth = tokenAuthHeader(token)

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
      if (team.name === "Owners") continue
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
}

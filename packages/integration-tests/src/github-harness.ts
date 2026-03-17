import type { GitConnectionDraft } from "@repo-edu/integrations-git-contract"
import type {
  GitProviderHarness,
  IntegrationTeam,
} from "./git-provider-harness.js"

function resolveApiBaseUrl(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/+$/, "")
  if (normalized === "" || normalized === "https://github.com") {
    return "https://api.github.com"
  }
  if (normalized === "http://github.com") {
    return "https://api.github.com"
  }
  return `${normalized}/api/v3`
}

type GitHubResponse = {
  status: number
  data: unknown
}

async function githubFetch(
  apiBase: string,
  token: string,
  path: string,
  options?: {
    method?: string
    body?: unknown
  },
): Promise<GitHubResponse> {
  const response = await fetch(`${apiBase}${path}`, {
    method: options?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
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

function parseUsernamePool(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
}

export function createGitHubHarness(): GitProviderHarness {
  const baseUrl = process.env.INTEGRATION_GITHUB_URL ?? "https://github.com"
  const token = process.env.INTEGRATION_GITHUB_TOKEN ?? ""
  const organization = process.env.INTEGRATION_GITHUB_ORG ?? ""
  const fixtureGitUsernames = parseUsernamePool(
    process.env.INTEGRATION_GITHUB_USERNAMES ?? "",
  )
  const apiBase = resolveApiBaseUrl(baseUrl)

  const getConnectionDraft = (): GitConnectionDraft => ({
    provider: "github",
    baseUrl,
    token,
  })

  return {
    label: "GitHub",
    isConfigured: token !== "" && organization !== "",
    supportsUserProvisioning: false,
    assertTeamMemberAssignments: fixtureGitUsernames.length > 0,
    fixtureGitUsernames,
    async ensureReady() {
      const rateLimit = await githubFetch(apiBase, token, "/rate_limit")
      if (rateLimit.status !== 200) {
        throw new Error(
          `GitHub is not ready or token is invalid (${rateLimit.status}): ${JSON.stringify(rateLimit.data)}`,
        )
      }
    },
    getConnectionDraft,
    async createOrganization(_orgName: string): Promise<string> {
      return organization
    },
    async cleanupOrganization(_orgName: string): Promise<void> {
      // Cleanup in shared GitHub orgs is intentionally best-effort/no-op.
    },
    async seedUsers(_usernames: string[]): Promise<void> {
      // GitHub.com does not provide user creation via org admin tokens.
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
      const create = await githubFetch(
        apiBase,
        token,
        `/orgs/${orgName}/repos`,
        {
          method: "POST",
          body: {
            name: repoName,
            private: true,
            auto_init: options?.autoInit ?? true,
          },
        },
      )

      if (create.status !== 201 && create.status !== 422) {
        throw new Error(
          `Failed to create GitHub repository '${orgName}/${repoName}' (${create.status}): ${JSON.stringify(create.data)}`,
        )
      }
    },
    async verifyRepositoriesExist(
      orgName: string,
      names: string[],
    ): Promise<string[]> {
      const existing: string[] = []
      for (const name of names) {
        const result = await githubFetch(
          apiBase,
          token,
          `/repos/${orgName}/${name}`,
        )
        if (result.status === 200) {
          existing.push(name)
        }
      }
      return existing
    },
    async verifyTeams(orgName: string): Promise<IntegrationTeam[]> {
      const teams = await githubFetch(
        apiBase,
        token,
        `/orgs/${orgName}/teams?per_page=100`,
      )
      if (teams.status !== 200 || !Array.isArray(teams.data)) {
        throw new Error(
          `Failed to list GitHub teams for '${orgName}' (${teams.status}).`,
        )
      }
      return teams.data
        .map((entry) => {
          const team = entry as { slug?: unknown; name?: unknown }
          return {
            id: typeof team.slug === "string" ? team.slug : "",
            name: typeof team.name === "string" ? team.name : "",
          }
        })
        .filter((team) => team.id !== "" && team.name !== "")
    },
    async verifyTeamMembers(
      orgName: string,
      team: IntegrationTeam,
    ): Promise<string[]> {
      const slug = String(team.id)
      const members = await githubFetch(
        apiBase,
        token,
        `/orgs/${orgName}/teams/${slug}/members?per_page=100`,
      )
      if (members.status !== 200 || !Array.isArray(members.data)) {
        throw new Error(
          `Failed to list GitHub team members for '${slug}' (${members.status}).`,
        )
      }

      return members.data
        .map((entry) => {
          const member = entry as { login?: unknown }
          return typeof member.login === "string" ? member.login : null
        })
        .filter((entry): entry is string => entry !== null)
    },
    async verifyTeamRepos(
      orgName: string,
      team: IntegrationTeam,
    ): Promise<string[]> {
      const slug = String(team.id)
      const repos = await githubFetch(
        apiBase,
        token,
        `/orgs/${orgName}/teams/${slug}/repos?per_page=100`,
      )
      if (repos.status !== 200 || !Array.isArray(repos.data)) {
        throw new Error(
          `Failed to list GitHub team repositories for '${slug}' (${repos.status}).`,
        )
      }

      return repos.data
        .map((entry) => {
          const repo = entry as { name?: unknown }
          return typeof repo.name === "string" ? repo.name : null
        })
        .filter((entry): entry is string => entry !== null)
    },
  }
}

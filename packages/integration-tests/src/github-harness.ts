import type { GitConnectionDraft } from "@repo-edu/integrations-git-contract"
import type {
  GitProviderHarness,
  IntegrationPullRequest,
  IntegrationTeam,
} from "./git-provider-harness.js"
import { fetchGitHubIntegration } from "./github-request-admission.js"

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
  const response = await fetchGitHubIntegration(`${apiBase}${path}`, {
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

async function githubFetchPages(
  apiBase: string,
  token: string,
  path: string,
): Promise<unknown[]> {
  const entries: unknown[] = []
  for (let page = 1; page <= 100; page += 1) {
    const separator = path.includes("?") ? "&" : "?"
    const result = await githubFetch(
      apiBase,
      token,
      `${path}${separator}per_page=100&page=${page}`,
    )
    if (result.status !== 200 || !Array.isArray(result.data)) {
      throw new Error(
        `Failed to list GitHub resources at '${path}' (${result.status}): ${JSON.stringify(result.data)}`,
      )
    }
    entries.push(...result.data)
    if (result.data.length < 100) {
      return entries
    }
  }
  throw new Error(`GitHub pagination exceeded 100 pages at '${path}'.`)
}

export function createGitHubHarness(): GitProviderHarness {
  const baseUrl = process.env.INTEGRATION_GITHUB_URL ?? "https://github.com"
  const token = process.env.INTEGRATION_GITHUB_TOKEN ?? ""
  const organization = process.env.INTEGRATION_GITHUB_ORG ?? ""
  const fixtureGitUsernames: string[] = []
  const apiBase = resolveApiBaseUrl(baseUrl)

  const getConnectionDraft = (): GitConnectionDraft => ({
    provider: "github",
    baseUrl,
    token,
  })

  return {
    label: "GitHub",
    missingConfiguration: [
      ...(token === "" ? ["INTEGRATION_GITHUB_TOKEN"] : []),
      ...(organization === "" ? ["INTEGRATION_GITHUB_ORG"] : []),
    ],
    supportsUserProvisioning: false,
    fixtureGitUsernames,
    async ensureReady() {
      const rateLimit = await githubFetch(apiBase, token, "/rate_limit")
      if (rateLimit.status !== 200) {
        throw new Error(
          `GitHub is not ready or token is invalid (${rateLimit.status}): ${JSON.stringify(rateLimit.data)}`,
        )
      }

      const account = await githubFetch(apiBase, token, "/user")
      const login = (account.data as { login?: unknown } | null)?.login
      if (account.status !== 200 || typeof login !== "string" || login === "") {
        throw new Error(
          `GitHub did not return the token owner's login (${account.status}): ${JSON.stringify(account.data)}`,
        )
      }

      const membership = await githubFetch(
        apiBase,
        token,
        `/orgs/${organization}/memberships/${login}`,
      )
      const membershipData = membership.data as {
        role?: unknown
        state?: unknown
      } | null
      if (
        membership.status !== 200 ||
        membershipData?.role !== "admin" ||
        membershipData.state !== "active"
      ) {
        throw new Error(
          `GitHub token owner '${login}' is not an active owner of '${organization}' (${membership.status}): ${JSON.stringify(membership.data)}`,
        )
      }

      fixtureGitUsernames.splice(0, fixtureGitUsernames.length, login)
    },
    getConnectionDraft,
    async createOrganization(_orgName: string): Promise<string> {
      return organization
    },
    async cleanupOrganization(
      orgName: string,
      resourcePrefix: string,
    ): Promise<void> {
      const repositories = await githubFetchPages(
        apiBase,
        token,
        `/orgs/${orgName}/repos?type=all`,
      )
      for (const entry of repositories) {
        const name = (entry as { name?: unknown }).name
        if (typeof name !== "string" || !name.startsWith(resourcePrefix)) {
          continue
        }
        const remove = await githubFetch(
          apiBase,
          token,
          `/repos/${orgName}/${name}`,
          { method: "DELETE" },
        )
        if (remove.status !== 204 && remove.status !== 404) {
          throw new Error(
            `Failed to delete GitHub repository '${orgName}/${name}' (${remove.status}): ${JSON.stringify(remove.data)}`,
          )
        }
      }

      const teams = await githubFetchPages(
        apiBase,
        token,
        `/orgs/${orgName}/teams`,
      )
      for (const entry of teams) {
        const team = entry as { name?: unknown; slug?: unknown }
        if (
          typeof team.name !== "string" ||
          typeof team.slug !== "string" ||
          !team.name.startsWith(`team-${resourcePrefix}-`)
        ) {
          continue
        }
        const remove = await githubFetch(
          apiBase,
          token,
          `/orgs/${orgName}/teams/${team.slug}`,
          { method: "DELETE" },
        )
        if (remove.status !== 204 && remove.status !== 404) {
          throw new Error(
            `Failed to delete GitHub team '${team.name}' (${remove.status}): ${JSON.stringify(remove.data)}`,
          )
        }
      }
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
    async readRepositoryFile(
      orgName: string,
      repoName: string,
      branchName: string,
      path: string,
    ): Promise<string | null> {
      const result = await githubFetch(
        apiBase,
        token,
        `/repos/${orgName}/${repoName}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branchName)}`,
      )
      if (result.status === 404) {
        return null
      }
      const file = result.data as {
        type?: unknown
        content?: unknown
        encoding?: unknown
      } | null
      if (
        result.status !== 200 ||
        file?.type !== "file" ||
        typeof file.content !== "string" ||
        file.encoding !== "base64"
      ) {
        throw new Error(
          `Failed to read GitHub file '${orgName}/${repoName}:${branchName}:${path}' (${result.status}): ${JSON.stringify(result.data)}`,
        )
      }
      return Buffer.from(file.content, "base64").toString("utf8")
    },
    async listPullRequests(
      orgName: string,
      repoName: string,
    ): Promise<IntegrationPullRequest[]> {
      const pulls = await githubFetchPages(
        apiBase,
        token,
        `/repos/${orgName}/${repoName}/pulls?state=open`,
      )
      return pulls.map((entry) => {
        const pull = entry as {
          head?: { ref?: unknown } | null
          base?: { ref?: unknown } | null
          html_url?: unknown
        }
        if (
          typeof pull.head?.ref !== "string" ||
          typeof pull.base?.ref !== "string" ||
          typeof pull.html_url !== "string"
        ) {
          throw new Error(
            `GitHub answered an unreadable pull request for '${orgName}/${repoName}'.`,
          )
        }
        return {
          headBranch: pull.head.ref,
          baseBranch: pull.base.ref,
          url: pull.html_url,
        }
      })
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
      const teams = await githubFetchPages(
        apiBase,
        token,
        `/orgs/${orgName}/teams`,
      )
      return teams
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
      const members = await githubFetchPages(
        apiBase,
        token,
        `/orgs/${orgName}/teams/${slug}/members`,
      )

      return members
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
      const repos = await githubFetchPages(
        apiBase,
        token,
        `/orgs/${orgName}/teams/${slug}/repos`,
      )

      return repos
        .map((entry) => {
          const repo = entry as { name?: unknown }
          return typeof repo.name === "string" ? repo.name : null
        })
        .filter((entry): entry is string => entry !== null)
    },
  }
}

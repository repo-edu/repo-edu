import type { HttpPort } from "@repo-edu/host-runtime-contract"
import type {
  CreateTeamRequest,
  GitProviderClient,
} from "@repo-edu/integrations-git-contract"
import { isNotFoundError, toErrorStatus } from "./errors.js"
import { createOctokit } from "./transport.js"

function mapTeamPermission(permission: CreateTeamRequest["permission"]) {
  if (permission === "admin") return "admin" as const
  if (permission === "pull") return "pull" as const
  return "push" as const
}

function mapTeamRole(permission: CreateTeamRequest["permission"]) {
  return permission === "push" || permission === "admin"
    ? ("maintainer" as const)
    : ("member" as const)
}

function teamSlugFromName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

type TeamsCapability = Pick<
  GitProviderClient,
  "createTeam" | "assignRepositoriesToTeam"
>

export function createGitHubTeams(http: HttpPort): TeamsCapability {
  return {
    async createTeam(draft, request, signal) {
      const octokit = createOctokit(http, draft)
      let created = true
      let teamSlug = ""
      try {
        const response = await octokit.teams.create({
          org: request.organization,
          name: request.teamName,
          permission: request.permission === "pull" ? "pull" : "push",
          privacy: "closed",
          request: { signal },
        })
        teamSlug = response.data.slug
      } catch (error) {
        if (toErrorStatus(error) !== 422) throw error
        created = false
        const response = await octokit.teams.getByName({
          org: request.organization,
          team_slug: teamSlugFromName(request.teamName),
          request: { signal },
        })
        teamSlug = response.data.slug
      }
      const membersAdded: string[] = []
      const membersNotFound: string[] = []
      for (const username of request.memberUsernames) {
        if (signal?.aborted) break
        try {
          await octokit.teams.addOrUpdateMembershipForUserInOrg({
            org: request.organization,
            team_slug: teamSlug,
            username,
            role: mapTeamRole(request.permission),
            request: { signal },
          })
          membersAdded.push(username)
        } catch (error) {
          if (!isNotFoundError(error)) throw error
          membersNotFound.push(username)
        }
      }
      return { created, teamSlug, membersAdded, membersNotFound }
    },
    async assignRepositoriesToTeam(draft, request, signal) {
      const octokit = createOctokit(http, draft)
      for (const repositoryName of request.repositoryNames) {
        if (signal?.aborted) break
        await octokit.teams.addOrUpdateRepoPermissionsInOrg({
          org: request.organization,
          team_slug: request.teamSlug,
          owner: request.organization,
          repo: repositoryName,
          permission: mapTeamPermission(request.permission),
          request: { signal },
        })
      }
    },
  }
}

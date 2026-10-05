import type { Octokit } from "@octokit/rest"
import type { HttpPort } from "@repo-edu/host-runtime-contract"
import type {
  CreateTeamRequest,
  GitProviderClient,
} from "@repo-edu/integrations-git-contract"
import {
  gitEffectFailure,
  isGitReply,
  throwIfGitEffectAborted,
} from "../invocation-guard.js"
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

const teamPageSize = 100

/** GitHub builds a team's slug by its own rule, so an existing team is found
 * by its name in the organisation's paged team list. Every page is read until
 * the team is found or a page comes back empty. Octokit's paginator is not
 * used, because it drops the caller's signal and reads a 409 as an empty
 * page. */
async function findTeamByName(
  octokit: Octokit,
  organization: string,
  teamName: string,
  signal?: AbortSignal,
): Promise<{ slug?: unknown } | null> {
  for (let page = 1; ; page += 1) {
    const response = await octokit.teams.list({
      org: organization,
      per_page: teamPageSize,
      page,
      request: { signal },
    })
    const teams: unknown = response.data
    if (!Array.isArray(teams)) {
      throw gitEffectFailure(
        "completed",
        `GitHub answered an unreadable team list for '${organization}'.`,
      )
    }
    if (teams.length === 0) return null
    const team = teams.find(
      (entry) => (entry as { name?: unknown } | null)?.name === teamName,
    )
    if (team !== undefined) return team
  }
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
      let team: { slug?: unknown }
      try {
        const response = await octokit.teams.create({
          org: request.organization,
          name: request.teamName,
          permission: request.permission === "pull" ? "pull" : "push",
          privacy: "closed",
          request: { signal },
        })
        team = response.data
      } catch (error) {
        // GitHub answers an existing team name with 422 "Validation Failed",
        // so the refusal names an existing team only when the list holds it.
        if (!isGitReply(error, 422)) throw error
        const existing = await findTeamByName(
          octokit,
          request.organization,
          request.teamName,
          signal,
        )
        if (existing === null) throw error
        created = false
        team = existing
      }
      if (typeof team.slug !== "string") {
        throw gitEffectFailure(
          "completed",
          `GitHub answered team '${request.teamName}' without its slug.`,
        )
      }
      const teamSlug = team.slug
      const membersAdded: string[] = []
      const membersNotFound: string[] = []
      for (const username of request.memberUsernames) {
        throwIfGitEffectAborted(signal)
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
          // GitHub answers a missing account with 404, which its REST
          // troubleshooting guide documents for every missing resource.
          if (!isGitReply(error, 404)) throw error
          membersNotFound.push(username)
        }
      }
      return { created, teamSlug, membersAdded, membersNotFound }
    },
    async assignRepositoriesToTeam(draft, request, signal) {
      const octokit = createOctokit(http, draft)
      for (const repositoryName of request.repositoryNames) {
        throwIfGitEffectAborted(signal)
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

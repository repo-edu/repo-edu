import type { HttpPort } from "@repo-edu/host-runtime-contract"
import type {
  CreateTeamRequest,
  GitConnectionDraft,
  GitProviderClient,
} from "@repo-edu/integrations-git-contract"
import {
  gitEffectFailure,
  isGitReply,
  throwIfGitEffectAborted,
} from "../invocation-guard.js"
import { isTeamAlreadyExists } from "./errors.js"
import { giteaRequest } from "./transport.js"

function mapTeamPermission(
  permission: CreateTeamRequest["permission"],
): string {
  if (permission === "admin") return "admin"
  if (permission === "pull") return "read"
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

const teamPageSize = 50

function readTeamId(team: unknown): number | null {
  const id = (team as { id?: unknown } | null)?.id
  return typeof id === "number" ? id : null
}

/** Gitea answered that the team exists. Team names are unique without regard
 * to case, and the list is paged, so every page is read until the team is
 * found or a page comes back empty. */
async function readExistingTeamId(
  http: HttpPort,
  draft: GitConnectionDraft,
  organization: string,
  teamName: string,
  signal?: AbortSignal,
): Promise<number> {
  const wanted = teamName.toLowerCase()
  for (let page = 1; ; page += 1) {
    const teams = await giteaRequest(
      http,
      draft,
      "GET",
      `/orgs/${encodeURIComponent(organization)}/teams?limit=${teamPageSize}&page=${page}`,
      undefined,
      signal,
    )
    if (!Array.isArray(teams)) {
      throw gitEffectFailure(
        "completed",
        `Gitea answered an unreadable team list for '${organization}'.`,
      )
    }
    if (teams.length === 0) break
    const team = teams.find((entry) => {
      const name = (entry as { name?: unknown } | null)?.name
      return typeof name === "string" && name.toLowerCase() === wanted
    })
    if (team === undefined) continue
    const id = readTeamId(team)
    if (id === null) {
      throw gitEffectFailure(
        "completed",
        `Gitea answered team '${teamName}' without its id.`,
      )
    }
    return id
  }
  throw gitEffectFailure(
    "completed",
    `Gitea answered that team '${teamName}' exists but does not list it.`,
  )
}

type TeamsCapability = Pick<
  GitProviderClient,
  "createTeam" | "assignRepositoriesToTeam"
>

export function createGiteaTeams(http: HttpPort): TeamsCapability {
  return {
    async createTeam(draft, request, signal) {
      let created = false
      let teamId: number
      try {
        const team = await giteaRequest(
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
        const id = readTeamId(team)
        if (id === null) {
          throw gitEffectFailure(
            "completed",
            `Gitea created team '${request.teamName}' but answered without its id.`,
          )
        }
        teamId = id
        created = true
      } catch (error) {
        if (!isTeamAlreadyExists(error)) throw error
        teamId = await readExistingTeamId(
          http,
          draft,
          request.organization,
          request.teamName,
          signal,
        )
      }
      const membersAdded: string[] = []
      const membersNotFound: string[] = []
      for (const username of request.memberUsernames) {
        throwIfGitEffectAborted(signal)
        try {
          await giteaRequest(
            http,
            draft,
            "PUT",
            `/teams/${teamId}/members/${encodeURIComponent(username)}`,
            undefined,
            signal,
          )
          membersAdded.push(username)
        } catch (error) {
          if (!isGitReply(error, 404)) throw error
          membersNotFound.push(username)
        }
      }
      return {
        created,
        teamSlug: String(teamId),
        membersAdded,
        membersNotFound,
      }
    },
    async assignRepositoriesToTeam(draft, request, signal) {
      const teamId = Number.parseInt(request.teamSlug, 10)
      if (!Number.isFinite(teamId)) {
        throw gitEffectFailure(
          "completed",
          `Invalid Gitea team identifier '${request.teamSlug}'.`,
        )
      }
      // Gitea answers an already assigned repository with success.
      for (const repositoryName of request.repositoryNames) {
        throwIfGitEffectAborted(signal)
        await giteaRequest(
          http,
          draft,
          "PUT",
          `/teams/${teamId}/repos/${encodeURIComponent(request.organization)}/${encodeURIComponent(repositoryName)}`,
          undefined,
          signal,
        )
      }
    },
  }
}

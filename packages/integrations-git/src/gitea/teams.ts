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

async function resolveTeamId(
  http: HttpPort,
  draft: GitConnectionDraft,
  organization: string,
  teamName: string,
  signal?: AbortSignal,
): Promise<number | null> {
  const teams = await giteaRequest(
    http,
    draft,
    "GET",
    `/orgs/${encodeURIComponent(organization)}/teams`,
    undefined,
    signal,
  )
  if (!Array.isArray(teams)) return null
  for (const entry of teams) {
    if (typeof entry !== "object" || entry === null) continue
    const team = entry as { id?: unknown; name?: unknown }
    if (
      String(team.name ?? "").toLowerCase() === teamName.toLowerCase() &&
      typeof team.id === "number"
    ) {
      return team.id
    }
  }
  return null
}

type TeamsCapability = Pick<
  GitProviderClient,
  "createTeam" | "assignRepositoriesToTeam"
>

export function createGiteaTeams(http: HttpPort): TeamsCapability {
  return {
    async createTeam(draft, request, signal) {
      let created = false
      let teamId: number | null = null
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
        const id = (team as { id?: unknown } | null)?.id
        if (typeof id === "number") {
          teamId = id
          created = true
        }
      } catch (error) {
        if (!isGitReply(error, 409)) throw error
        teamId = await resolveTeamId(
          http,
          draft,
          request.organization,
          request.teamName,
          signal,
        )
      }
      if (teamId === null) {
        throw gitEffectFailure(
          "completed",
          `Failed to resolve Gitea team '${request.teamName}'.`,
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
      for (const repositoryName of request.repositoryNames) {
        throwIfGitEffectAborted(signal)
        try {
          await giteaRequest(
            http,
            draft,
            "PUT",
            `/teams/${teamId}/repos/${encodeURIComponent(request.organization)}/${encodeURIComponent(repositoryName)}`,
            undefined,
            signal,
          )
        } catch (error) {
          if (!isGitReply(error, 409)) throw error
        }
      }
    },
  }
}

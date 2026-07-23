import type { HttpPort } from "@repo-edu/host-runtime-contract"
import type {
  CreateTeamRequest,
  GitConnectionDraft,
  GitProviderClient,
} from "@repo-edu/integrations-git-contract"
import { giteaRequest, resolveApiBase } from "./transport.js"

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
  const response = await giteaRequest(
    http,
    draft,
    "GET",
    `/orgs/${encodeURIComponent(organization)}/teams`,
    undefined,
    signal,
  )
  if (response.status < 200 || response.status >= 300) return null
  if (!Array.isArray(response.data)) return null
  for (const entry of response.data) {
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
      if (!resolveApiBase(draft)) throw new Error("Gitea baseUrl is required.")
      const response = await giteaRequest(
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
      let created = false
      let teamId: number | null = null
      if (response.status >= 200 && response.status < 300) {
        const id = (response.data as { id?: unknown } | null)?.id
        if (typeof id === "number") {
          teamId = id
          created = true
        }
      } else if (response.status === 409) {
        teamId = await resolveTeamId(
          http,
          draft,
          request.organization,
          request.teamName,
          signal,
        )
      } else {
        throw new Error(
          `Failed to create Gitea team '${request.teamName}' (${response.status}).`,
        )
      }
      if (teamId === null) {
        throw new Error(`Failed to resolve Gitea team '${request.teamName}'.`)
      }
      const membersAdded: string[] = []
      const membersNotFound: string[] = []
      for (const username of request.memberUsernames) {
        if (signal?.aborted) break
        const member = await giteaRequest(
          http,
          draft,
          "PUT",
          `/teams/${teamId}/members/${encodeURIComponent(username)}`,
          undefined,
          signal,
        )
        if (member.status >= 200 && member.status < 300) {
          membersAdded.push(username)
        } else if (member.status === 404) {
          membersNotFound.push(username)
        } else {
          throw new Error(
            `Failed to add '${username}' to Gitea team '${request.teamName}' (${member.status}).`,
          )
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
      if (!resolveApiBase(draft)) throw new Error("Gitea baseUrl is required.")
      const teamId = Number.parseInt(request.teamSlug, 10)
      if (!Number.isFinite(teamId)) {
        throw new Error(`Invalid Gitea team identifier '${request.teamSlug}'.`)
      }
      for (const repositoryName of request.repositoryNames) {
        if (signal?.aborted) break
        const response = await giteaRequest(
          http,
          draft,
          "PUT",
          `/teams/${teamId}/repos/${encodeURIComponent(request.organization)}/${encodeURIComponent(repositoryName)}`,
          undefined,
          signal,
        )
        if (
          (response.status >= 200 && response.status < 300) ||
          response.status === 409
        ) {
          continue
        }
        throw new Error(
          `Failed to assign repository '${repositoryName}' to Gitea team '${request.teamSlug}' (${response.status}).`,
        )
      }
    },
  }
}

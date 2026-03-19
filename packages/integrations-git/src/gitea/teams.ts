import type { HttpPort } from "@repo-edu/host-runtime-contract"
import type {
  CreateTeamRequest,
  GitConnectionDraft,
} from "@repo-edu/integrations-git-contract"
import { giteaRequest } from "./transport.js"

export function mapTeamPermission(
  permission: CreateTeamRequest["permission"],
): string {
  if (permission === "admin") {
    return "admin"
  }
  if (permission === "pull") {
    return "read"
  }
  return "write"
}

export const defaultTeamUnits = [
  "repo.code",
  "repo.issues",
  "repo.pulls",
  "repo.actions",
  "repo.releases",
  "repo.wiki",
  "repo.projects",
  "repo.packages",
]

export async function resolveTeamId(
  http: HttpPort,
  draft: GitConnectionDraft,
  organization: string,
  teamSlug: string,
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
  if (response.status < 200 || response.status >= 300) {
    return null
  }
  if (!Array.isArray(response.data)) {
    return null
  }

  for (const entry of response.data) {
    if (typeof entry !== "object" || entry === null) {
      continue
    }
    const team = entry as { id?: unknown; name?: unknown }
    if (
      (String(team.name ?? "") === teamSlug ||
        String(team.name ?? "").toLowerCase() === teamSlug.toLowerCase()) &&
      typeof team.id === "number"
    ) {
      return team.id
    }
  }
  return null
}

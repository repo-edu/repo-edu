import type { Gitlab } from "@gitbeaker/rest"

function toTeamSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export function toTeamPathSlug(name: string): string {
  const slug = toTeamSlug(name)
  return slug.startsWith("team-") ? slug : `team-${slug}`
}

export async function resolveGroupId(
  api: Gitlab,
  groupPath: string,
): Promise<number | null> {
  const group = await api.Groups.show(groupPath)
  const id = (group as { id?: unknown }).id
  return typeof id === "number" ? id : null
}

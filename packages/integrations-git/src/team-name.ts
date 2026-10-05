import type { CreateTeamRequest } from "@repo-edu/integrations-git-contract"

/** The name every server gives a group's team. Group names are unique only
 * inside one group set, so the group's ID ends the name and two groups never
 * share a team. Gitea team names and GitLab group paths refuse spaces and
 * most punctuation, so the group's name becomes a lowercase slug. GitLab keeps
 * team groups beside the course's projects, and the `team-` prefix keeps
 * their paths apart. */
export function buildTeamName(
  group: Pick<CreateTeamRequest, "groupId" | "groupName">,
): string {
  const slug = group.groupName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  const name = slug === "" ? group.groupId : `${slug}-${group.groupId}`
  return name.startsWith("team-") ? name : `team-${name}`
}

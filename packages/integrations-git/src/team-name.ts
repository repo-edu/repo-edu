import type { CreateTeamRequest } from "@repo-edu/integrations-git-contract"

function encodeCourseId(courseId: string): string {
  return Array.from(new TextEncoder().encode(courseId), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")
}

/** The name every server gives a group's team. Group IDs are unique only
 * inside one course, so the course and group IDs end the name. Gitea team
 * names are case-insensitive, and GitLab group paths and Gitea team names
 * refuse spaces and most punctuation, so the course ID uses lowercase
 * hexadecimal and the group's name becomes a lowercase slug. GitLab keeps team
 * groups beside the course's projects, and the `team-` prefix keeps their paths
 * apart. */
export function buildTeamName(
  group: Pick<CreateTeamRequest, "courseId" | "groupId" | "groupName">,
): string {
  const slug = group.groupName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  const stableId = `${encodeCourseId(group.courseId)}-${group.groupId}`
  const name = slug === "" ? stableId : `${slug}-${stableId}`
  return name.startsWith("team-") ? name : `team-${name}`
}

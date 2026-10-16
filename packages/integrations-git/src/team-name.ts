import type { CreateTeamRequest } from "@repo-edu/integrations-git-contract"

const maxTeamNameLength = 255
const teamPrefix = "team-"

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
 * apart. Gitea and GitLab limit the complete name to 255 characters, so only
 * the readable group slug is shortened. */
export function buildTeamName(
  group: Pick<CreateTeamRequest, "courseId" | "groupId" | "groupName">,
): string {
  const slug = group.groupName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  const stableId = `${encodeCourseId(group.courseId)}-${group.groupId}`
  const readableSlug = slug
    .slice(
      0,
      Math.max(
        0,
        maxTeamNameLength -
          stableId.length -
          1 -
          (slug.startsWith(teamPrefix) ? 0 : teamPrefix.length),
      ),
    )
    .replace(/-+$/g, "")
  const name = readableSlug === "" ? stableId : `${readableSlug}-${stableId}`
  return name.startsWith(teamPrefix) ? name : `${teamPrefix}${name}`
}

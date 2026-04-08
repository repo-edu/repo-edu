import type { AnalysisRosterContext } from "@repo-edu/domain/analysis"
import type { PersistedCourse, RosterMember } from "@repo-edu/domain/types"

function isLmsRosterConnection(
  connection: PersistedCourse["roster"]["connection"],
): boolean {
  return connection?.kind === "canvas" || connection?.kind === "moodle"
}

export function buildAnalysisRosterContext(
  course: PersistedCourse,
): AnalysisRosterContext | undefined {
  if (!isLmsRosterConnection(course.roster.connection)) {
    return undefined
  }

  const membersById = new Map<string, RosterMember>()
  for (const member of [...course.roster.students, ...course.roster.staff]) {
    if (!membersById.has(member.id)) {
      membersById.set(member.id, member)
    }
  }

  const members = [...membersById.values()]
  if (members.length === 0) {
    return undefined
  }

  return { members }
}

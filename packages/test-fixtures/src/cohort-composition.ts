import {
  type Assignment,
  type CourseBacking,
  type Group,
  type IdSequences,
  type PersistedCourse,
  persistedCourseKind,
  type RosterMember,
  type UsernameTeam,
} from "@repo-edu/domain/types"

export type CohortIdentitySource = {
  name: string
  email: string
  gitUsername?: string | null
}

export type LmsCohortMemberSource = CohortIdentitySource & {
  studentNumber?: string | null
  gitUsername?: string | null
}

export type LmsCohortStaffSource = CohortIdentitySource & {
  gitUsername?: string | null
}

export type LmsCohortSource = {
  students: Record<string, LmsCohortMemberSource>
  staff: Record<string, LmsCohortStaffSource>
  groupSets: Record<string, { name: string; groups: string[] }>
  groups: Record<string, { name: string; memberIds: string[] }>
  assignments: Record<string, { name: string; groupSetId: string }>
}

export type RepobeeCohortSource = {
  teamSets: Record<string, { name?: string; teams: string[] }>
  teams: Record<string, { members: CohortIdentitySource[] }>
  assignments: Record<string, { name?: string; teamSetId: string }>
}

export type ComposeCourseFromCohortInput =
  | { profile: "lms"; cohort: LmsCohortSource }
  | { profile: "repobee"; cohort: RepobeeCohortSource }

const generatedAt = "2026-01-01T00:00:00.000Z"

function titleizeId(id: string): string {
  return id
    .split("-")
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ")
}

function fail(source: string, message: string): never {
  throw new Error(`${source}: ${message}`)
}

function objectEntries<T>(record: Record<string, T>): Array<[string, T]> {
  return Object.entries(record)
}

function numericSuffix(id: string): number | null {
  const match = id.match(/_(\d+)$/)
  return match ? Number(match[1]) : null
}

function nextSequence(ids: Iterable<string>, fallback: number): number {
  let max = 0
  for (const id of ids) {
    const suffix = numericSuffix(id)
    if (suffix !== null && suffix > max) max = suffix
  }
  return max > 0 ? max + 1 : fallback
}

function assertUnique(
  values: Iterable<string>,
  source: string,
  label: string,
): void {
  const seen = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) fail(source, `duplicate ${label}: ${value}`)
    seen.add(value)
  }
}

function assertPresent<T>(
  value: T | undefined,
  source: string,
  label: string,
): T {
  if (value === undefined) fail(source, `missing ${label}`)
  return value
}

function rosterMember(
  id: string,
  source: LmsCohortMemberSource | LmsCohortStaffSource,
  enrollmentType: "student" | "teacher",
  index: number,
): RosterMember {
  return {
    id,
    name: source.name,
    email: source.email,
    studentNumber:
      enrollmentType === "student"
        ? ((source as LmsCohortMemberSource).studentNumber ??
          String(100000 + index))
        : null,
    gitUsername: source.gitUsername ?? null,
    gitUsernameStatus: "unknown",
    status: "active",
    lmsStatus: "active",
    lmsUserId: null,
    enrollmentType,
    enrollmentDisplay: enrollmentType === "student" ? "Student" : "Teacher",
    department: null,
    institution: null,
    source: "demo-cohort",
  }
}

function baseCourse(
  profile: CourseBacking,
  id: string,
  displayName: string,
  idSequences: IdSequences,
): Omit<PersistedCourse, "roster"> {
  return {
    kind: persistedCourseKind,
    backing: profile,
    revision: 0,
    id,
    displayName,
    lmsConnectionId: null,
    organization: "repo-edu-demo",
    lmsCourseId: null,
    idSequences,
    repositoryTemplate: {
      kind: "remote",
      owner: "repo-edu-demo",
      name: "starter-template",
      visibility: "private",
    },
    searchFolder: null,
    analysisInputs: {},
    updatedAt: generatedAt,
  }
}

function validateLmsCohort(cohort: LmsCohortSource): void {
  const source = "lms cohort"
  assertUnique(
    objectEntries(cohort.students)
      .map(([, student]) => student.email)
      .filter((email) => email.length > 0),
    source,
    "student email",
  )

  for (const [assignmentId, assignment] of objectEntries(cohort.assignments)) {
    assertPresent(
      cohort.groupSets[assignment.groupSetId],
      source,
      `group set ${assignment.groupSetId} for assignment ${assignmentId}`,
    )
  }

  for (const [groupSetId, groupSet] of objectEntries(cohort.groupSets)) {
    assertUnique(groupSet.groups, source, `group id in group set ${groupSetId}`)
    const membersInSet = new Set<string>()
    for (const groupId of groupSet.groups) {
      const group = assertPresent(
        cohort.groups[groupId],
        source,
        `group ${groupId} in group set ${groupSetId}`,
      )
      for (const memberId of group.memberIds) {
        assertPresent(
          cohort.students[memberId],
          source,
          `student ${memberId} in group ${groupId}`,
        )
        if (membersInSet.has(memberId)) {
          fail(
            source,
            `student ${memberId} appears more than once in group set ${groupSetId}`,
          )
        }
        membersInSet.add(memberId)
      }
    }
  }
}

function composeLmsCourse(cohort: LmsCohortSource): PersistedCourse {
  validateLmsCohort(cohort)

  const students = objectEntries(cohort.students).map(([id, student], index) =>
    rosterMember(id, student, "student", index + 1),
  )
  const staff = objectEntries(cohort.staff).map(([id, member], index) =>
    rosterMember(id, member, "teacher", index + 1),
  )
  const groups: Group[] = objectEntries(cohort.groups).map(([id, group]) => ({
    id,
    name: group.name,
    memberIds: [...group.memberIds],
    origin: "local",
    lmsGroupId: null,
  }))
  const groupSets = objectEntries(cohort.groupSets).map(([id, groupSet]) => ({
    id,
    nameMode: "named" as const,
    name: groupSet.name,
    groupIds: [...groupSet.groups],
    connection: null,
    repoNameTemplate: null,
    columnVisibility: {},
    columnSizing: {},
  }))
  const assignments: Assignment[] = objectEntries(cohort.assignments).map(
    ([id, assignment]) => ({
      id,
      name: assignment.name,
      groupSetId: assignment.groupSetId,
      repositories: {},
    }),
  )

  return {
    ...baseCourse("lms", "demo-lms-course", "Demo Course", {
      nextGroupSeq: nextSequence(Object.keys(cohort.groups), groups.length + 1),
      nextGroupSetSeq: nextSequence(
        Object.keys(cohort.groupSets),
        groupSets.length + 1,
      ),
      nextMemberSeq: nextSequence(
        [...Object.keys(cohort.students), ...Object.keys(cohort.staff)],
        students.length + staff.length + 1,
      ),
      nextAssignmentSeq: nextSequence(
        Object.keys(cohort.assignments),
        assignments.length + 1,
      ),
      nextTeamSeq: 1,
    }),
    roster: {
      connection: null,
      students,
      staff,
      groups,
      groupSets,
      assignments,
    },
  }
}

function validateRepobeeCohort(cohort: RepobeeCohortSource): void {
  const source = "repobee cohort"
  const allUsernames: string[] = []

  for (const [assignmentId, assignment] of objectEntries(cohort.assignments)) {
    assertPresent(
      cohort.teamSets[assignment.teamSetId],
      source,
      `team set ${assignment.teamSetId} for assignment ${assignmentId}`,
    )
  }

  for (const [teamSetId, teamSet] of objectEntries(cohort.teamSets)) {
    assertUnique(teamSet.teams, source, `team id in team set ${teamSetId}`)
    for (const teamId of teamSet.teams) {
      const team = assertPresent(
        cohort.teams[teamId],
        source,
        `team ${teamId} in team set ${teamSetId}`,
      )
      for (const member of team.members) {
        if (!member.gitUsername) {
          fail(
            source,
            `team ${teamId} member ${member.email} lacks gitUsername`,
          )
        }
        allUsernames.push(member.gitUsername)
      }
    }
  }

  assertUnique(allUsernames, source, "team git username")
}

function composeRepobeeCourse(cohort: RepobeeCohortSource): PersistedCourse {
  validateRepobeeCohort(cohort)

  const teamSetDomainIds = new Map(
    objectEntries(cohort.teamSets).map(([sourceId], index) => [
      sourceId,
      `gs_${String(index + 1).padStart(4, "0")}`,
    ]),
  )
  const teamById = new Map(
    objectEntries(cohort.teams).map(([id, team]) => {
      const projected: UsernameTeam = {
        id,
        gitUsernames: team.members.map((member) => member.gitUsername ?? ""),
      }
      return [id, projected] as const
    }),
  )
  const groupSets = objectEntries(cohort.teamSets).map(
    ([sourceId, teamSet]) => ({
      id: assertPresent(
        teamSetDomainIds.get(sourceId),
        "repobee cohort",
        `projected team set id for ${sourceId}`,
      ),
      nameMode: "unnamed" as const,
      name: teamSet.name ?? "RepoBee Teams",
      teams: teamSet.teams.map((teamId) =>
        assertPresent(teamById.get(teamId), "repobee cohort", `team ${teamId}`),
      ),
      connection: null,
      repoNameTemplate: "{assignment}-{members}",
      columnVisibility: {},
      columnSizing: {},
    }),
  )
  const assignments: Assignment[] = objectEntries(cohort.assignments).map(
    ([id, assignment]) => ({
      id,
      name: assignment.name ?? titleizeId(id),
      groupSetId: assertPresent(
        teamSetDomainIds.get(assignment.teamSetId),
        "repobee cohort",
        `projected team set id for ${assignment.teamSetId}`,
      ),
      repositories: {},
    }),
  )

  return {
    ...baseCourse("repobee", "demo-repobee-course", "Demo Course", {
      nextGroupSeq: 1,
      nextGroupSetSeq: nextSequence(
        Object.keys(cohort.teamSets),
        groupSets.length + 1,
      ),
      nextMemberSeq: 1,
      nextAssignmentSeq: nextSequence(
        Object.keys(cohort.assignments),
        assignments.length + 1,
      ),
      nextTeamSeq: nextSequence(Object.keys(cohort.teams), teamById.size + 1),
    }),
    roster: {
      connection: null,
      students: [],
      staff: [],
      groups: [],
      groupSets,
      assignments,
    },
  }
}

export function composeCourseFromCohort(
  input: ComposeCourseFromCohortInput,
): PersistedCourse {
  return input.profile === "lms"
    ? composeLmsCourse(input.cohort)
    : composeRepobeeCourse(input.cohort)
}

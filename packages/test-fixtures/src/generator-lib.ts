import { faker } from "@faker-js/faker"
import {
  defaultAppSettings,
  type PersistedAppSettings,
} from "@repo-edu/domain/settings"
import {
  type MemberStatus,
  type PersistedCourse,
  persistedCourseKind,
  type UsernameTeam,
} from "@repo-edu/domain/types"
import type { FixturePreset, FixtureTier } from "./fixture-defs.js"
import type {
  FixtureArtifact,
  FixtureMatrix,
  FixtureRecord,
} from "./fixtures.js"

export const fixtureTierCounts: Record<
  FixtureTier,
  { students: number; staff: number }
> = {
  small: { students: 24, staff: 2 },
  medium: { students: 67, staff: 3 },
  stress: { students: 180, staff: 8 },
}

const fixtureGeneratedAt = "2026-01-01T00:00:00.000Z"
const baseSeed = 20260310

function padNumber(value: number, width: number): string {
  return String(value).padStart(width, "0")
}

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function generateGitUsername(firstSlug: string, lastSlug: string): string {
  const suffix2 = faker.number.int({ min: 10, max: 99 })
  return faker.helpers.weightedArrayElement([
    { value: `${firstSlug}${lastSlug}`, weight: 3 },
    { value: `${firstSlug}-${lastSlug}`, weight: 1 },
    { value: `${firstSlug[0]}${lastSlug}`, weight: 2 },
    { value: `${lastSlug}${firstSlug[0]}`, weight: 2 },
    { value: `${firstSlug}${suffix2}`, weight: 3 },
    { value: `${firstSlug}-${lastSlug}${suffix2}`, weight: 1 },
  ])
}

function toCsvCell(value: string | null | undefined): string {
  const normalized = value ?? ""
  if (/[",\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`
  }
  return normalized
}

function toCsvLine(values: Array<string | null | undefined>): string {
  return values.map(toCsvCell).join(",")
}

function rotate<T>(items: readonly T[], offset: number): T[] {
  if (items.length === 0) {
    return []
  }
  const normalizedOffset =
    ((offset % items.length) + items.length) % items.length
  return [...items.slice(normalizedOffset), ...items.slice(0, normalizedOffset)]
}

function buildMixedTeamSizes(studentCount: number): number[] {
  const groupCount = Math.round(studentCount / 3.5)
  const groupCountOfFour = studentCount - groupCount * 3
  const groupCountOfThree = groupCount - groupCountOfFour

  const sizes: number[] = []
  let remainingFours = groupCountOfFour
  let remainingThrees = groupCountOfThree

  while (remainingFours > 0 || remainingThrees > 0) {
    if (remainingFours > 0) {
      sizes.push(4)
      remainingFours -= 1
    }
    if (remainingThrees > 0) {
      sizes.push(3)
      remainingThrees -= 1
    }
  }

  return sizes
}

function splitMembersBySizes(
  memberIds: readonly string[],
  sizes: readonly number[],
  offset: number,
): string[][] {
  const orderedIds = rotate(memberIds, offset)
  const groups: string[][] = []
  let cursor = 0

  for (const size of sizes) {
    groups.push(orderedIds.slice(cursor, cursor + size))
    cursor += size
  }

  return groups
}

function fixtureSeed(tier: FixtureTier, preset: FixturePreset): number {
  const tierIndex =
    tier === "small" ? 0 : tier === "medium" ? 1 : tier === "stress" ? 2 : 0
  const presetIndex =
    preset === "shared-teams" ? 0 : preset === "task-groups" ? 3 : 2
  return baseSeed + tierIndex * 1_000 + presetIndex * 100
}

function createStudents(count: number, startMemberSeq: number) {
  return Array.from({ length: count }, (_, index) => {
    const ordinal = index + 1
    const memberSeq = startMemberSeq + index
    const firstName = faker.person.firstName()
    const lastName = faker.person.lastName()
    const firstSlug = slugify(firstName) || `student${ordinal}`
    const lastSlug = slugify(lastName) || "member"

    return {
      id: `m_${padNumber(memberSeq, 4)}`,
      name: `${lastName}, ${firstName}`,
      email: `${firstSlug}.${lastSlug}@example.edu`,
      studentNumber: `${100000 + ordinal}`,
      gitUsername: generateGitUsername(firstSlug, lastSlug),
      gitUsernameStatus: "unknown" as const,
      status: "active" as MemberStatus,
      lmsStatus: "active" as const,
      lmsUserId: `lms-s-${padNumber(ordinal, 4)}`,
      enrollmentType: "student" as const,
      enrollmentDisplay: "Student",
      department: null,
      institution: null,
      source: "seed",
    }
  })
}

function createStaff(count: number, startMemberSeq: number) {
  return Array.from({ length: count }, (_, index) => {
    const ordinal = index + 1
    const memberSeq = startMemberSeq + index
    const firstName = faker.person.firstName()
    const lastName = faker.person.lastName()
    const firstSlug = slugify(firstName) || `staff${ordinal}`
    const lastSlug = slugify(lastName) || "member"

    return {
      id: `m_${padNumber(memberSeq, 4)}`,
      name: `${lastName}, ${firstName}`,
      email: `${firstSlug}.${lastSlug}@example.edu`,
      studentNumber: null,
      gitUsername: generateGitUsername(firstSlug, lastSlug),
      gitUsernameStatus: "unknown" as const,
      status: "active" as const,
      lmsStatus: "active" as const,
      lmsUserId: `lms-t-${padNumber(ordinal, 4)}`,
      enrollmentType: "teacher" as const,
      enrollmentDisplay: "Teacher",
      department: null,
      institution: null,
      source: "seed",
    }
  })
}

function createSharedTeamsGroupModel(
  studentIds: readonly string[],
  sizes: readonly number[],
  startGroupSeq: number,
  startGroupSetSeq: number,
) {
  const groupedMembers = splitMembersBySizes(studentIds, sizes, 0)
  const groupSetId = `gs_${padNumber(startGroupSetSeq, 4)}`
  const groups = groupedMembers.map((memberIds, index) => {
    const groupSeq = startGroupSeq + index
    return {
      id: `g_${padNumber(groupSeq, 4)}`,
      name: `Team ${index + 1}`,
      memberIds,
      origin: "local" as const,
      lmsGroupId: null,
    }
  })

  return {
    groups,
    groupSets: [
      {
        id: groupSetId,
        nameMode: "named" as const,
        name: "Project Teams",
        groupIds: groups.map((group) => group.id),
        connection: null,
        repoNameTemplate: null,
        columnVisibility: {},
        columnSizing: {},
      },
    ],
    assignments: [
      {
        id: "a1",
        name: "lab01",
        groupSetId,
      },
      {
        id: "a2",
        name: "lab02",
        groupSetId,
      },
    ],
    nextGroupSeq: startGroupSeq + groups.length,
    nextGroupSetSeq: startGroupSetSeq + 1,
  }
}

function createTaskGroupsGroupModel(
  studentIds: readonly string[],
  startGroupSeq: number,
  startGroupSetSeq: number,
) {
  const total = studentIds.length
  const task1StudentCount = Math.round(total * (2 / 3))
  const task1Sizes = buildMixedTeamSizes(task1StudentCount)
  const task2Sizes = buildMixedTeamSizes(total - task1StudentCount)

  let nextGroupSeq = startGroupSeq
  let nextGroupSetSeq = startGroupSetSeq

  const taskDefs = [
    {
      name: "Web API Teams",
      sizes: task1Sizes,
      students: studentIds.slice(0, task1StudentCount),
      assignments: [
        { id: "a1", name: "api-design" },
        { id: "a2", name: "api-implementation" },
      ],
    },
    {
      name: "Data Pipeline Teams",
      sizes: task2Sizes,
      students: studentIds.slice(task1StudentCount),
      assignments: [{ id: "a3", name: "data-pipeline" }],
    },
  ]

  const allGroups: Array<{
    id: string
    name: string
    memberIds: string[]
    origin: "local"
    lmsGroupId: null
  }> = []

  const groupSets: Array<{
    id: string
    nameMode: "named"
    name: string
    groupIds: string[]
    connection: null
    repoNameTemplate: null
    columnVisibility: Record<string, never>
    columnSizing: Record<string, never>
  }> = []

  const assignments: Array<{ id: string; name: string; groupSetId: string }> =
    []

  for (const def of taskDefs) {
    const groupedMembers = splitMembersBySizes(def.students, def.sizes, 0)

    const taskGroups = groupedMembers.map((memberIds, index) => {
      const groupSeq = nextGroupSeq + index
      return {
        id: `g_${padNumber(groupSeq, 4)}`,
        name: `Group ${index + 1}`,
        memberIds,
        origin: "local" as const,
        lmsGroupId: null,
      }
    })
    nextGroupSeq += taskGroups.length
    allGroups.push(...taskGroups)

    const groupSetId = `gs_${padNumber(nextGroupSetSeq, 4)}`
    nextGroupSetSeq += 1
    groupSets.push({
      id: groupSetId,
      nameMode: "named",
      name: def.name,
      groupIds: taskGroups.map((g) => g.id),
      connection: null,
      repoNameTemplate: null,
      columnVisibility: {},
      columnSizing: {},
    })

    for (const assignment of def.assignments) {
      assignments.push({
        id: assignment.id,
        name: assignment.name,
        groupSetId,
      })
    }
  }

  return {
    groups: allGroups,
    groupSets,
    assignments,
    nextGroupSeq,
    nextGroupSetSeq,
  }
}

function createRepobeeUsernames(count: number): string[] {
  return Array.from({ length: count }, (_, index) => {
    const ordinal = index + 1
    const firstName = faker.person.firstName()
    const lastName = faker.person.lastName()
    const firstSlug = slugify(firstName) || `student${ordinal}`
    const lastSlug = slugify(lastName) || "user"
    return generateGitUsername(firstSlug, lastSlug)
  })
}

function createRepobeeTeamsGroupModel(
  studentCount: number,
  sizes: readonly number[],
  startGroupSetSeq: number,
  startTeamSeq: number,
) {
  const gitUsernames = createRepobeeUsernames(studentCount)
  const groupedUsernames = splitMembersBySizes(gitUsernames, sizes, 0)
  const groupSetId = `gs_${padNumber(startGroupSetSeq, 4)}`

  const teams: UsernameTeam[] = groupedUsernames.map((usernames, index) => ({
    id: `ut_${padNumber(startTeamSeq + index, 4)}`,
    gitUsernames: usernames,
  }))

  return {
    teams,
    groupSets: [
      {
        id: groupSetId,
        nameMode: "unnamed" as const,
        name: "RepoBee Teams",
        teams,
        connection: null,
        repoNameTemplate: "{assignment}-{members}",
        columnVisibility: {},
        columnSizing: {},
      },
    ],
    assignments: [
      {
        id: "a1",
        name: "lab1",
        groupSetId,
      },
    ],
    nextGroupSetSeq: startGroupSetSeq + 1,
    nextTeamSeq: startTeamSeq + teams.length,
  }
}

function createArtifacts(
  course: PersistedCourse,
  preset: FixturePreset,
): FixtureArtifact[] {
  const studentsCsv = [
    toCsvLine(["name", "email", "student_number", "git_username", "status"]),
    ...course.roster.students.map((student) =>
      toCsvLine([
        student.name,
        student.email,
        student.studentNumber,
        student.gitUsername,
        student.status,
      ]),
    ),
  ].join("\n")

  const memberById = new Map(
    course.roster.students
      .concat(course.roster.staff)
      .map((member) => [member.id, member] as const),
  )

  const unnamedGroupSet = course.roster.groupSets.find(
    (gs) => gs.nameMode === "unnamed" && gs.connection?.kind !== "system",
  )
  if (unnamedGroupSet?.nameMode === "unnamed") {
    const teamsTxt = unnamedGroupSet.teams
      .map((team) => team.gitUsernames.join(" "))
      .join("\n")

    return [
      {
        artifactId: "teams-txt",
        displayName: "teams.txt",
        mediaType: "text/plain",
        text: teamsTxt,
      },
    ]
  }

  const preferredGroupSetId =
    preset === "task-groups"
      ? (course.roster.assignments[0]?.groupSetId ?? null)
      : (course.roster.groupSets.find(
          (groupSet) => groupSet.name === "Project Teams",
        )?.id ?? null)
  const fallbackGroupSet = course.roster.groupSets.find(
    (groupSet) => groupSet.connection === null,
  )
  const selectedGroupSet =
    course.roster.groupSets.find(
      (groupSet) => groupSet.id === preferredGroupSetId,
    ) ?? fallbackGroupSet

  const selectedGroupIds =
    selectedGroupSet?.nameMode === "named" ? selectedGroupSet.groupIds : []
  const selectedGroups = selectedGroupIds
    .map((groupId) =>
      course.roster.groups.find((group) => group.id === groupId),
    )
    .filter((group): group is NonNullable<typeof group> => group !== undefined)

  const groupsCsvRows = selectedGroups.flatMap((group) => {
    if (group.memberIds.length === 0) {
      return [toCsvLine([group.name, "", ""])]
    }

    return group.memberIds.map((memberId) => {
      const member = memberById.get(memberId)
      return toCsvLine([group.name, member?.name ?? "", member?.email ?? ""])
    })
  })

  const groupsCsv = [
    toCsvLine(["group_name", "name", "email"]),
    ...groupsCsvRows,
  ].join("\n")

  const groupsJson = JSON.stringify(
    {
      groupSetId: selectedGroupSet?.id ?? null,
      groups: selectedGroups.map((group) => ({
        id: group.id,
        name: group.name,
        members: group.memberIds
          .map((memberId) => memberById.get(memberId)?.email ?? null)
          .filter((email): email is string => email !== null),
      })),
    },
    null,
    2,
  )

  return [
    {
      artifactId: "students-csv",
      displayName: "students.csv",
      mediaType: "text/csv",
      text: studentsCsv,
    },
    {
      artifactId: "groups-csv",
      displayName: "groups.csv",
      mediaType: "text/csv",
      text: groupsCsv,
    },
    {
      artifactId: "groups-json",
      displayName: "groups.json",
      mediaType: "application/json",
      text: groupsJson,
    },
  ]
}

function createFixtureRecord(
  tier: FixtureTier,
  preset: FixturePreset,
): FixtureRecord {
  faker.seed(fixtureSeed(tier, preset))

  const counts = fixtureTierCounts[tier]
  const isRepobeePreset = preset === "repobee-teams"

  if (isRepobeePreset) {
    const teamSizes = buildMixedTeamSizes(counts.students)
    const repobeeGroups = createRepobeeTeamsGroupModel(
      counts.students,
      teamSizes,
      1,
      1,
    )
    const courseId = `fixture-${tier}-${preset}`
    const roster = {
      connection: null,
      students: [] as ReturnType<typeof createStudents>,
      staff: [] as ReturnType<typeof createStaff>,
      groups: [] as PersistedCourse["roster"]["groups"],
      groupSets: [...repobeeGroups.groupSets],
      assignments: repobeeGroups.assignments,
    }
    const course: PersistedCourse = {
      kind: persistedCourseKind,
      schemaVersion: 2,
      revision: 0,
      id: courseId,
      displayName: `Fixture (${tier}, ${preset})`,
      lmsConnectionName: null,
      organization: "fixture-org",
      lmsCourseId: null,
      idSequences: {
        nextGroupSeq: 1,
        nextGroupSetSeq: repobeeGroups.nextGroupSetSeq,
        nextMemberSeq: 1,
        nextAssignmentSeq: roster.assignments.length + 1,
        nextTeamSeq: repobeeGroups.nextTeamSeq,
      },
      roster,
      repositoryTemplate: {
        kind: "remote",
        owner: "fixture-org",
        name: "starter-template",
        visibility: "private",
      },
      updatedAt: fixtureGeneratedAt,
    }
    const settings: PersistedAppSettings = {
      ...defaultAppSettings,
      activeCourseId: courseId,
      lmsConnections: [],
      gitConnections: [
        {
          id: "github-demo",
          provider: "github",
          baseUrl: "https://github.com",
          token: "demo-token",
        },
      ],
      activeGitConnectionId: "github-demo",
      lastOpenedAt: fixtureGeneratedAt,
    }
    return {
      course,
      settings,
      artifacts: createArtifacts(course, preset),
    }
  }

  const students = createStudents(counts.students, 1)
  students[3].email = ""
  students[3].status = "incomplete"
  students[6].status = "dropped"
  const staff = createStaff(counts.staff, counts.students + 1)
  const studentIds = students.map((student) => student.id)
  const teamSizes = buildMixedTeamSizes(students.length)
  let nextGroupSeq = 1
  let nextGroupSetSeq = 1

  const userGroups =
    preset === "task-groups"
      ? createTaskGroupsGroupModel(studentIds, nextGroupSeq, nextGroupSetSeq)
      : createSharedTeamsGroupModel(
          studentIds,
          teamSizes,
          nextGroupSeq,
          nextGroupSetSeq,
        )
  nextGroupSeq = userGroups.nextGroupSeq
  nextGroupSetSeq = userGroups.nextGroupSetSeq

  const individualGroups = students.map((student) => ({
    id: `g_${padNumber(nextGroupSeq++, 4)}`,
    name: student.id,
    memberIds: [student.id],
    origin: "system" as const,
    lmsGroupId: null,
  }))

  const staffGroup = {
    id: `g_${padNumber(nextGroupSeq++, 4)}`,
    name: "staff",
    memberIds: staff.map((member) => member.id),
    origin: "system" as const,
    lmsGroupId: null,
  }

  const courseId = `fixture-${tier}-${preset}`
  const roster = {
    connection: null,
    students,
    staff,
    groups: [...individualGroups, staffGroup, ...userGroups.groups],
    groupSets: [
      {
        id: `gs_${padNumber(nextGroupSetSeq++, 4)}`,
        nameMode: "named" as const,
        name: "Individual Students",
        groupIds: individualGroups.map((group) => group.id),
        connection: {
          kind: "system" as const,
          systemType: "individual_students",
        },
        repoNameTemplate: null,
        columnVisibility: {},
        columnSizing: {},
      },
      {
        id: `gs_${padNumber(nextGroupSetSeq++, 4)}`,
        nameMode: "named" as const,
        name: "Staff",
        groupIds: [staffGroup.id],
        connection: {
          kind: "system" as const,
          systemType: "staff",
        },
        repoNameTemplate: null,
        columnVisibility: {},
        columnSizing: {},
      },
      ...userGroups.groupSets,
    ],
    assignments: userGroups.assignments,
  }

  const course: PersistedCourse = {
    kind: persistedCourseKind,
    schemaVersion: 2,
    revision: 0,
    id: courseId,
    displayName: `Fixture (${tier}, ${preset})`,
    lmsConnectionName: "Canvas Demo",
    organization: "fixture-org",
    lmsCourseId: courseId,
    idSequences: {
      nextGroupSeq,
      nextGroupSetSeq,
      nextMemberSeq: roster.students.length + roster.staff.length + 1,
      nextAssignmentSeq: roster.assignments.length + 1,
      nextTeamSeq: 1,
    },
    roster,
    repositoryTemplate: {
      kind: "remote",
      owner: "fixture-org",
      name: "starter-template",
      visibility: "private",
    },
    updatedAt: fixtureGeneratedAt,
  }

  const settings: PersistedAppSettings = {
    ...defaultAppSettings,
    activeCourseId: courseId,
    lmsConnections: [
      {
        name: "Canvas Demo",
        provider: "canvas",
        baseUrl: "https://canvas.example.edu",
        token: "demo-token",
      },
    ],
    gitConnections: [
      {
        id: "github-demo",
        provider: "github",
        baseUrl: "https://github.com",
        token: "demo-token",
      },
    ],
    activeGitConnectionId: "github-demo",
    lastOpenedAt: fixtureGeneratedAt,
  }

  return {
    course,
    settings,
    artifacts: createArtifacts(course, preset),
  }
}

export function buildFixtureMatrix(): FixtureMatrix {
  return {
    small: {
      "shared-teams": createFixtureRecord("small", "shared-teams"),
      "task-groups": createFixtureRecord("small", "task-groups"),
      "repobee-teams": createFixtureRecord("small", "repobee-teams"),
    },
    medium: {
      "shared-teams": createFixtureRecord("medium", "shared-teams"),
      "task-groups": createFixtureRecord("medium", "task-groups"),
      "repobee-teams": createFixtureRecord("medium", "repobee-teams"),
    },
    stress: {
      "shared-teams": createFixtureRecord("stress", "shared-teams"),
      "task-groups": createFixtureRecord("stress", "task-groups"),
      "repobee-teams": createFixtureRecord("stress", "repobee-teams"),
    },
  }
}

import { faker } from "@faker-js/faker"
import { defaultAppSettings } from "@repo-edu/domain/settings"
import {
  type PersistedAppSettings,
  type PersistedCourse,
  persistedCourseKind,
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
  medium: { students: 72, staff: 4 },
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
  const presetIndex = preset === "shared-teams" ? 0 : 1
  return baseSeed + tierIndex * 1_000 + presetIndex * 100
}

function createStudents(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const ordinal = index + 1
    const firstName = faker.person.firstName()
    const lastName = faker.person.lastName()
    const firstSlug = slugify(firstName) || `student${ordinal}`
    const lastSlug = slugify(lastName) || "member"

    return {
      id: `s-${padNumber(ordinal, 4)}`,
      name: `${firstName} ${lastName}`,
      email: `${firstSlug}.${lastSlug}.${padNumber(ordinal, 4)}@example.edu`,
      studentNumber: `${100000 + ordinal}`,
      gitUsername: `${firstSlug}${padNumber(ordinal, 3)}`,
      gitUsernameStatus: "unknown" as const,
      status: "active" as const,
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

function createStaff(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const ordinal = index + 1
    const firstName = faker.person.firstName()
    const lastName = faker.person.lastName()
    const firstSlug = slugify(firstName) || `staff${ordinal}`
    const lastSlug = slugify(lastName) || "member"

    return {
      id: `t-${padNumber(ordinal, 4)}`,
      name: `${firstName} ${lastName}`,
      email: `${firstSlug}.${lastSlug}.${padNumber(ordinal, 4)}@example.edu`,
      studentNumber: null,
      gitUsername: `${firstSlug}-staff-${padNumber(ordinal, 2)}`,
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
) {
  const groupedMembers = splitMembersBySizes(studentIds, sizes, 0)
  const groups = groupedMembers.map((memberIds, index) => {
    const groupOrdinal = index + 1
    const suffix = padNumber(groupOrdinal, 2)
    return {
      id: `g-grp${suffix}`,
      name: `grp${suffix}`,
      memberIds,
      origin: "local" as const,
      lmsGroupId: null,
    }
  })

  return {
    groups,
    groupSets: [
      {
        id: "gs-project-teams",
        name: "Project Teams",
        groupIds: groups.map((group) => group.id),
        connection: null,
        groupSelection: {
          kind: "all" as const,
          excludedGroupIds: [],
        },
        repoNameTemplate: null,
      },
    ],
    assignments: [
      {
        id: "a1",
        name: "assignment-1",
        groupSetId: "gs-project-teams",
      },
      {
        id: "a2",
        name: "assignment-2",
        groupSetId: "gs-project-teams",
      },
    ],
  }
}

function createAssignmentScopedGroupModel(
  studentIds: readonly string[],
  sizes: readonly number[],
) {
  const allGroups: Array<{
    id: string
    name: string
    memberIds: string[]
    origin: "local"
    lmsGroupId: null
  }> = []

  const groupSets: Array<{
    id: string
    name: string
    groupIds: string[]
    connection: null
    groupSelection: { kind: "all"; excludedGroupIds: [] }
    repoNameTemplate: null
  }> = []

  const assignments: Array<{ id: string; name: string; groupSetId: string }> =
    []

  for (const assignmentNumber of [1, 2] as const) {
    const assignmentPrefix = `a${assignmentNumber}`
    const groupedMembers = splitMembersBySizes(
      studentIds,
      sizes,
      (assignmentNumber - 1) * 3,
    )

    const assignmentGroups = groupedMembers.map((memberIds, index) => {
      const groupSuffix = padNumber(index + 1, 2)
      return {
        id: `g-${assignmentPrefix}-grp${groupSuffix}`,
        name: `${assignmentPrefix}-grp${groupSuffix}`,
        memberIds,
        origin: "local" as const,
        lmsGroupId: null,
      }
    })

    allGroups.push(...assignmentGroups)
    groupSets.push({
      id: `gs-${assignmentPrefix}`,
      name: `Assignment ${assignmentNumber} Teams`,
      groupIds: assignmentGroups.map((group) => group.id),
      connection: null,
      groupSelection: {
        kind: "all",
        excludedGroupIds: [],
      },
      repoNameTemplate: null,
    })
    assignments.push({
      id: assignmentPrefix,
      name: `assignment-${assignmentNumber}`,
      groupSetId: `gs-${assignmentPrefix}`,
    })
  }

  return {
    groups: allGroups,
    groupSets,
    assignments,
  }
}

function createArtifacts(
  course: PersistedCourse,
  preset: FixturePreset,
): FixtureArtifact[] {
  const studentsCsv = [
    toCsvLine([
      "id",
      "name",
      "email",
      "student_number",
      "git_username",
      "status",
    ]),
    ...course.roster.students.map((student) =>
      toCsvLine([
        student.id,
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

  const preferredGroupSetId =
    preset === "assignment-scoped" ? "gs-a1" : "gs-project-teams"
  const fallbackGroupSet = course.roster.groupSets.find(
    (groupSet) => groupSet.connection === null,
  )
  const selectedGroupSet =
    course.roster.groupSets.find(
      (groupSet) => groupSet.id === preferredGroupSetId,
    ) ?? fallbackGroupSet

  const selectedGroups = (selectedGroupSet?.groupIds ?? [])
    .map((groupId) =>
      course.roster.groups.find((group) => group.id === groupId),
    )
    .filter((group): group is NonNullable<typeof group> => group !== undefined)

  const groupsCsvRows = selectedGroups.flatMap((group) => {
    if (group.memberIds.length === 0) {
      return [toCsvLine([group.name, group.id, "", ""])]
    }

    return group.memberIds.map((memberId) => {
      const member = memberById.get(memberId)
      return toCsvLine([
        group.name,
        group.id,
        member?.name ?? "",
        member?.email ?? "",
      ])
    })
  })

  const groupsCsv = [
    toCsvLine(["group_name", "group_id", "name", "email"]),
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
  const students = createStudents(counts.students)
  const staff = createStaff(counts.staff)
  const studentIds = students.map((student) => student.id)
  const teamSizes = buildMixedTeamSizes(students.length)

  const userGroups =
    preset === "shared-teams"
      ? createSharedTeamsGroupModel(studentIds, teamSizes)
      : createAssignmentScopedGroupModel(studentIds, teamSizes)

  const individualGroups = students.map((student) => ({
    id: `g-system-${student.id}`,
    name: student.id,
    memberIds: [student.id],
    origin: "system" as const,
    lmsGroupId: null,
  }))

  const staffGroup = {
    id: "g-system-staff",
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
        id: "gs-system-individual-students",
        name: "Individual Students",
        groupIds: individualGroups.map((group) => group.id),
        connection: {
          kind: "system" as const,
          systemType: "individual_students",
        },
        groupSelection: {
          kind: "all" as const,
          excludedGroupIds: [],
        },
        repoNameTemplate: null,
      },
      {
        id: "gs-system-staff",
        name: "Staff",
        groupIds: [staffGroup.id],
        connection: {
          kind: "system" as const,
          systemType: "staff",
        },
        groupSelection: {
          kind: "all" as const,
          excludedGroupIds: [],
        },
        repoNameTemplate: null,
      },
      ...userGroups.groupSets,
    ],
    assignments: userGroups.assignments,
  }

  const course: PersistedCourse = {
    kind: persistedCourseKind,
    schemaVersion: 1,
    revision: 0,
    id: courseId,
    displayName: `Fixture (${tier}, ${preset})`,
    lmsConnectionName: "Canvas Demo",
    gitConnectionId: "github-demo",
    organization: "fixture-org",
    lmsCourseId: courseId,
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
      "assignment-scoped": createFixtureRecord("small", "assignment-scoped"),
    },
    medium: {
      "shared-teams": createFixtureRecord("medium", "shared-teams"),
      "assignment-scoped": createFixtureRecord("medium", "assignment-scoped"),
    },
    stress: {
      "shared-teams": createFixtureRecord("stress", "shared-teams"),
      "assignment-scoped": createFixtureRecord("stress", "assignment-scoped"),
    },
  }
}

export function renderFixtureModule(matrix: FixtureMatrix): string {
  return [
    "// AUTO-GENERATED BY scripts/generate-docs-fixtures.ts",
    "// DO NOT EDIT MANUALLY.",
    "",
    'import type { FixtureMatrix } from "./fixtures.js"',
    "",
    `export const fixtureMatrix: FixtureMatrix = ${JSON.stringify(matrix, null, 2)}`,
    "",
  ].join("\n")
}

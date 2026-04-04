import type {
  PersistedAppSettings,
  PersistedCourse,
} from "@repo-edu/domain/types"
import {
  type FixtureSource,
  fixtureSources,
  getFixture,
  isFixtureSource,
} from "@repo-edu/test-fixtures"

export const docsFixtureSources = fixtureSources

export type DocsFixtureSource = FixtureSource

export type DocsReadableFileSeed = {
  referenceId: string
  displayName: string
  mediaType: string | null
  text: string
}

export type DocsFixtureRecord = {
  course: PersistedCourse
  settings: PersistedAppSettings
  readableFiles: DocsReadableFileSeed[]
}

export type DocsFixtureSelection = {
  source: DocsFixtureSource
}

export const defaultDocsFixtureSelection: DocsFixtureSelection = {
  source: "canvas",
}

const fixedDocsTier = "medium" as const
const fixedDocsPreset = "assignment-scoped" as const
const repobeeReadableFilesPreset = "repobee-teams" as const

function queryFixtureSelection(search: string): Partial<DocsFixtureSelection> {
  const params = new URLSearchParams(search)
  const sourceParam = params.get("source")

  return {
    source: isFixtureSource(sourceParam) ? sourceParam : undefined,
  }
}

export function resolveDocsFixtureSelection(options?: {
  source?: DocsFixtureSource
  search?: string
}): DocsFixtureSelection {
  const defaultSearch =
    options?.search ??
    (typeof window !== "undefined" ? window.location.search : "")
  const fromQuery = queryFixtureSelection(defaultSearch)

  return {
    source:
      options?.source ?? fromQuery.source ?? defaultDocsFixtureSelection.source,
  }
}

function padNumber(value: number, width: number): string {
  return String(value).padStart(width, "0")
}

function buildGroups(
  prefix: string,
  studentIds: readonly string[],
  sizes: readonly number[],
  startGroupSeq: number,
) {
  const groups: Array<{
    id: string
    name: string
    memberIds: string[]
    origin: "local"
    lmsGroupId: null
  }> = []
  let cursor = 0
  for (let i = 0; i < sizes.length; i++) {
    const size = sizes[i]
    groups.push({
      id: `g_${padNumber(startGroupSeq + i, 4)}`,
      name: `${prefix}-grp${padNumber(i + 1, 2)}`,
      memberIds: studentIds.slice(cursor, cursor + size) as string[],
      origin: "local",
      lmsGroupId: null,
    })
    cursor += size
  }
  return groups
}

function applyFixedTaskGroupSetup(course: PersistedCourse): PersistedCourse {
  const nonSystemGroupSets = course.roster.groupSets.filter(
    (groupSet) => groupSet.connection?.kind !== "system",
  )
  if (nonSystemGroupSets.length < 2) {
    return course
  }

  const [task1GroupSet, task2GroupSet] = nonSystemGroupSets
  const studentIds = course.roster.students.map((s) => s.id)

  // Remove old non-system groups
  const oldNonSystemGroupIds = new Set(
    nonSystemGroupSets.flatMap((gs) =>
      gs.nameMode === "named" ? gs.groupIds : [],
    ),
  )
  const systemGroups = course.roster.groups.filter(
    (g) => !oldNonSystemGroupIds.has(g.id),
  )

  // Task 1: 8 groups of 4 + 4 groups of 3 = 44 students
  const task1Sizes = [
    ...Array.from<number>({ length: 8 }).fill(4),
    ...Array.from<number>({ length: 4 }).fill(3),
  ]
  const task1StudentCount = task1Sizes.reduce((a, b) => a + b, 0)

  // Task 2: 7 groups of 3 + 1 group of 2 = 23 separate students
  const task2Sizes = [
    ...Array.from<number>({ length: 7 }).fill(3),
    ...Array.from<number>({ length: 1 }).fill(2),
  ]

  let nextGroupSeq = 1
  const task1Groups = buildGroups(
    "a1",
    studentIds.slice(0, task1StudentCount),
    task1Sizes,
    nextGroupSeq,
  )
  nextGroupSeq += task1Groups.length

  const task2Groups = buildGroups(
    "a2",
    studentIds.slice(task1StudentCount),
    task2Sizes,
    nextGroupSeq,
  )
  const allGroups = [...systemGroups, ...task1Groups, ...task2Groups]
  const maxGroupSeq = allGroups.reduce((max, group) => {
    const sequence = Number.parseInt(group.id.replace(/^g_/, ""), 10)
    return Number.isNaN(sequence) ? max : Math.max(max, sequence)
  }, 0)

  const assignments = [
    { id: "task1a", name: "task1a", groupSetId: task1GroupSet.id },
    { id: "task1b", name: "task1b", groupSetId: task1GroupSet.id },
    { id: "task2", name: "task2", groupSetId: task2GroupSet.id },
  ]

  return {
    ...course,
    idSequences: {
      ...course.idSequences,
      nextGroupSeq: maxGroupSeq + 1,
      nextAssignmentSeq: assignments.length + 1,
    },
    roster: {
      ...course.roster,
      groups: allGroups,
      groupSets: course.roster.groupSets.map((groupSet) => {
        if (groupSet.id === task1GroupSet.id) {
          return {
            ...groupSet,
            name: "Task 1 Teams",
            groupIds: task1Groups.map((g) => g.id),
          }
        }
        if (groupSet.id === task2GroupSet.id) {
          return {
            ...groupSet,
            name: "Task 2 Teams",
            groupIds: task2Groups.map((g) => g.id),
          }
        }
        return groupSet
      }),
      assignments,
    },
  }
}

function toReadableFiles(
  artifacts: ReturnType<typeof getFixture>["artifacts"],
): DocsReadableFileSeed[] {
  return artifacts.map((artifact) => ({
    referenceId: artifact.artifactId,
    displayName: artifact.displayName,
    mediaType: artifact.mediaType,
    text: artifact.text,
  }))
}

function toDocsFixtureRecord(source: DocsFixtureSource): DocsFixtureRecord {
  const fixedTaskLayoutFixture = getFixture({
    tier: fixedDocsTier,
    preset: fixedDocsPreset,
  })
  const repobeeFixture = getFixture({
    tier: fixedDocsTier,
    preset: repobeeReadableFilesPreset,
  })
  const baseFixture =
    source === "file" ? repobeeFixture : fixedTaskLayoutFixture
  const course =
    source === "file"
      ? baseFixture.course
      : applyFixedTaskGroupSetup(baseFixture.course)

  return {
    course,
    settings: baseFixture.settings,
    readableFiles: toReadableFiles(repobeeFixture.artifacts),
  }
}

export function getDocsFixture(
  selection: DocsFixtureSelection,
): DocsFixtureRecord {
  return toDocsFixtureRecord(selection.source)
}

import type {
  PersistedAppSettings,
  PersistedCourse,
} from "@repo-edu/domain/types"
import {
  defaultFixtureSelection,
  type FixtureSource,
  type FixtureTier,
  fixtureSources,
  fixtureTiers,
  getFixture,
  isFixtureSource,
  isFixtureTier,
} from "@repo-edu/test-fixtures"

export const docsFixtureTiers = fixtureTiers
export const docsFixtureSources = fixtureSources

export type DocsFixtureTier = FixtureTier
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
  tier: DocsFixtureTier
  source: DocsFixtureSource
}

export const defaultDocsFixtureSelection: DocsFixtureSelection = {
  tier: defaultFixtureSelection.tier,
  source: "canvas",
}

const fixedDocsPreset = "assignment-scoped" as const
const repobeeReadableFilesPreset = "repobee-teams" as const

function queryFixtureSelection(search: string): Partial<DocsFixtureSelection> {
  const params = new URLSearchParams(search)
  const tierParam = params.get("tier")
  const sourceParam = params.get("source")

  return {
    tier: isFixtureTier(tierParam) ? tierParam : undefined,
    source: isFixtureSource(sourceParam) ? sourceParam : undefined,
  }
}

export function resolveDocsFixtureSelection(options?: {
  tier?: DocsFixtureTier
  source?: DocsFixtureSource
  search?: string
}): DocsFixtureSelection {
  const defaultSearch =
    options?.search ??
    (typeof window !== "undefined" ? window.location.search : "")
  const fromQuery = queryFixtureSelection(defaultSearch)

  return {
    tier: options?.tier ?? fromQuery.tier ?? defaultDocsFixtureSelection.tier,
    source:
      options?.source ?? fromQuery.source ?? defaultDocsFixtureSelection.source,
  }
}

function applyFixedTaskGroupSetup(course: PersistedCourse): PersistedCourse {
  const nonSystemGroupSets = course.roster.groupSets.filter(
    (groupSet) => groupSet.connection?.kind !== "system",
  )
  if (nonSystemGroupSets.length < 2) {
    return course
  }

  const [task1GroupSet, task2GroupSet] = nonSystemGroupSets
  const assignments = [
    { id: "task1a", name: "task1a", groupSetId: task1GroupSet.id },
    { id: "task1b", name: "task1b", groupSetId: task1GroupSet.id },
    { id: "task2", name: "task2", groupSetId: task2GroupSet.id },
  ]

  return {
    ...course,
    idSequences: {
      ...course.idSequences,
      nextAssignmentSeq: assignments.length + 1,
    },
    roster: {
      ...course.roster,
      groupSets: course.roster.groupSets.map((groupSet) => {
        if (groupSet.id === task1GroupSet.id) {
          return { ...groupSet, name: "Task 1 Teams" }
        }
        if (groupSet.id === task2GroupSet.id) {
          return { ...groupSet, name: "Task 2 Teams" }
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

function toDocsFixtureRecord(
  tier: DocsFixtureTier,
  source: DocsFixtureSource,
): DocsFixtureRecord {
  const fixedTaskLayoutFixture = getFixture({
    tier,
    preset: fixedDocsPreset,
  })
  const repobeeFixture = getFixture({
    tier,
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
  return toDocsFixtureRecord(selection.tier, selection.source)
}

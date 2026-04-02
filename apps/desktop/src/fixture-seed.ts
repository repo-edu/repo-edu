import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import {
  applyFixtureSourceOverlay,
  defaultFixtureSelection,
  type FixturePreset,
  type FixtureSource,
  type FixtureTier,
  getFixture,
  isFixturePreset,
  isFixtureSource,
  isFixtureTier,
} from "@repo-edu/test-fixtures"
import type { PersistedCourse } from "@repo-edu/domain/types"
import { createDesktopCourseStore } from "./course-store"
import { createDesktopAppSettingsStore } from "./settings-store"

const docsTaskGroupsPreset = "assignment-scoped" as const
const docsReadableFilesPreset = "repobee-teams" as const

export type DesktopFixtureSelection = {
  tier: FixtureTier
  preset: FixturePreset
  source: FixtureSource
}

export type SeededDesktopFixture = {
  selection: DesktopFixtureSelection
  courseEntityId: string
  artifactPaths: string[]
}

function fixtureSourceToRosterConnectionKind(source: FixtureSource) {
  if (source === "file") {
    return "import"
  }
  return source
}

function applyDocsTaskGroupSetup(course: PersistedCourse): PersistedCourse {
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

function normalizeFixtureCourseForDesktop(
  selection: DesktopFixtureSelection,
  course: PersistedCourse,
): PersistedCourse {
  if (selection.preset !== docsTaskGroupsPreset) {
    return course
  }

  const normalized = applyDocsTaskGroupSetup(course)
  normalized.id = `fixture-${selection.tier}-${selection.source}`
  normalized.displayName = `Fixture (${selection.tier}, ${selection.source})`
  return normalized
}

function fixtureArtifactPresetForDesktop(selection: DesktopFixtureSelection) {
  if (selection.preset === docsTaskGroupsPreset) {
    return docsReadableFilesPreset
  }
  return selection.preset
}

function shouldAlwaysReseedDesktopFixture(selection: DesktopFixtureSelection) {
  return (
    selection.preset === docsTaskGroupsPreset && selection.source !== "file"
  )
}

function cloneValue<TValue>(value: TValue): TValue {
  if (typeof structuredClone === "function") {
    return structuredClone(value)
  }
  return JSON.parse(JSON.stringify(value)) as TValue
}

function parseFixtureSelector(
  selector: string,
): Partial<DesktopFixtureSelection> {
  const parts = selector
    .split(/[/:,]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)

  if (parts.length < 2 || parts.length > 3) {
    throw new Error(
      "REPO_EDU_FIXTURE must be in the format '<tier>/<preset>' or '<tier>/<preset>/<source>'.",
    )
  }

  const [tier, preset, source] = parts
  if (!isFixtureTier(tier)) {
    throw new Error(`Invalid fixture tier in REPO_EDU_FIXTURE: ${tier}`)
  }
  if (!isFixturePreset(preset)) {
    throw new Error(`Invalid fixture preset in REPO_EDU_FIXTURE: ${preset}`)
  }
  if (source !== undefined && !isFixtureSource(source)) {
    throw new Error(`Invalid fixture source in REPO_EDU_FIXTURE: ${source}`)
  }

  return {
    tier,
    preset,
    source,
  }
}

export function resolveDesktopFixtureSelectionFromEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): DesktopFixtureSelection | null {
  const hasFixtureConfig =
    env.REPO_EDU_FIXTURE !== undefined ||
    env.REPO_EDU_FIXTURE_TIER !== undefined ||
    env.REPO_EDU_FIXTURE_PRESET !== undefined ||
    env.REPO_EDU_FIXTURE_SOURCE !== undefined

  if (!hasFixtureConfig) {
    return null
  }

  const fromSelector = env.REPO_EDU_FIXTURE
    ? parseFixtureSelector(env.REPO_EDU_FIXTURE)
    : {}

  const tierRaw = env.REPO_EDU_FIXTURE_TIER ?? fromSelector.tier
  const presetRaw = env.REPO_EDU_FIXTURE_PRESET ?? fromSelector.preset
  const sourceRaw = env.REPO_EDU_FIXTURE_SOURCE ?? fromSelector.source ?? "file"

  const tier = tierRaw ?? defaultFixtureSelection.tier
  const preset = presetRaw ?? defaultFixtureSelection.preset
  const source = sourceRaw

  if (!isFixtureTier(tier)) {
    throw new Error(`Invalid REPO_EDU_FIXTURE_TIER: ${String(tierRaw)}`)
  }
  if (!isFixturePreset(preset)) {
    throw new Error(`Invalid REPO_EDU_FIXTURE_PRESET: ${String(presetRaw)}`)
  }
  if (!isFixtureSource(source)) {
    throw new Error(`Invalid REPO_EDU_FIXTURE_SOURCE: ${String(sourceRaw)}`)
  }

  return {
    tier,
    preset,
    source,
  }
}

async function writeFixtureArtifacts(
  storageRoot: string,
  selection: DesktopFixtureSelection,
) {
  const fixture = getFixture({
    tier: selection.tier,
    preset: fixtureArtifactPresetForDesktop(selection),
  })
  const artifactsDirectory = join(
    storageRoot,
    "fixtures",
    `${selection.tier}-${selection.preset}`,
    selection.source,
    "imports",
  )
  await mkdir(artifactsDirectory, { recursive: true })

  const artifactPaths: string[] = []
  for (const artifact of fixture.artifacts) {
    const path = join(artifactsDirectory, artifact.displayName)
    await writeFile(path, artifact.text, "utf8")
    artifactPaths.push(path)
  }

  return artifactPaths
}

export async function seedDesktopFixtureFromEnvironment(
  storageRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<SeededDesktopFixture | null> {
  const selection = resolveDesktopFixtureSelectionFromEnvironment(env)
  if (!selection) {
    return null
  }

  const fixture = getFixture({
    tier: selection.tier,
    preset: selection.preset,
  })
  const course = normalizeFixtureCourseForDesktop(
    selection,
    cloneValue(fixture.course),
  )
  const settings = cloneValue(fixture.settings)
  const courseId =
    course.lmsCourseId ?? `course-${selection.tier}-${selection.preset}`

  applyFixtureSourceOverlay(course, settings, selection.source, courseId)

  const courseStore = createDesktopCourseStore(storageRoot)
  const appSettingsStore = createDesktopAppSettingsStore(storageRoot)
  const existingCourse = await courseStore.loadCourse(course.id)
  const requestedConnectionKind = fixtureSourceToRosterConnectionKind(
    selection.source,
  )

  let activeCourseId = course.id
  if (existingCourse === null) {
    const savedCourse = await courseStore.saveCourse(course)
    activeCourseId = savedCourse.id
  } else if (shouldAlwaysReseedDesktopFixture(selection)) {
    const savedCourse = await courseStore.saveCourse({
      ...course,
      revision: existingCourse.revision,
    })
    activeCourseId = savedCourse.id
  } else if (
    existingCourse.roster.connection?.kind !== requestedConnectionKind
  ) {
    const savedCourse = await courseStore.saveCourse({
      ...course,
      revision: existingCourse.revision,
    })
    activeCourseId = savedCourse.id
  } else {
    activeCourseId = existingCourse.id
  }

  await appSettingsStore.saveSettings({
    ...settings,
    activeCourseId,
  })

  const artifactPaths = await writeFixtureArtifacts(storageRoot, selection)

  return {
    selection,
    courseEntityId: activeCourseId,
    artifactPaths,
  }
}

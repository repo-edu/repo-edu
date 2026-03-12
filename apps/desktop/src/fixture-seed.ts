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
import { createDesktopCourseStore } from "./course-store"
import { createDesktopAppSettingsStore } from "./settings-store"

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
    preset: selection.preset,
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
  const course = cloneValue(fixture.course)
  const settings = cloneValue(fixture.settings)
  const courseId =
    course.lmsCourseId ?? `course-${selection.tier}-${selection.preset}`

  applyFixtureSourceOverlay(course, settings, selection.source, courseId)

  const courseStore = createDesktopCourseStore(storageRoot)
  const appSettingsStore = createDesktopAppSettingsStore(storageRoot)

  await courseStore.saveCourse(course)
  await appSettingsStore.saveSettings({
    ...settings,
    activeCourseId: course.id,
  })

  const artifactPaths = await writeFixtureArtifacts(storageRoot, selection)

  return {
    selection,
    courseEntityId: course.id,
    artifactPaths,
  }
}

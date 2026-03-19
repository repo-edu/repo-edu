import type {
  PersistedAppSettings,
  PersistedCourse,
} from "@repo-edu/domain/types"
import type {
  FixturePreset,
  FixtureSelection,
  FixtureTier,
} from "./fixture-defs.js"
import { fixtureMatrix } from "./fixture-matrix.js"

export type FixtureArtifact = {
  artifactId: string
  displayName: string
  mediaType: string | null
  text: string
}

export type FixtureRecord = {
  course: PersistedCourse
  settings: PersistedAppSettings
  artifacts: FixtureArtifact[]
}

export type FixtureMatrix = Record<
  FixtureTier,
  Record<FixturePreset, FixtureRecord>
>

export function getFixture(selection: FixtureSelection): FixtureRecord {
  return fixtureMatrix[selection.tier][selection.preset]
}

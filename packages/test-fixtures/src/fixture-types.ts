import type { PersistedAppSettings } from "@repo-edu/domain/settings"
import type { PersistedCourse } from "@repo-edu/domain/types"
import type { FixturePreset, FixtureTier } from "./fixture-defs.js"

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

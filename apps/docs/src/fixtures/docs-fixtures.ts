import type { PersistedAppSettings, PersistedProfile } from "@repo-edu/domain"
import { docsFixtureMatrix } from "./docs-fixtures.generated.js"

export const docsFixtureTiers = ["small", "medium", "stress"] as const
export const docsFixturePresets = ["shared-teams", "assignment-scoped"] as const

export type DocsFixtureTier = (typeof docsFixtureTiers)[number]
export type DocsFixturePreset = (typeof docsFixturePresets)[number]

export type DocsReadableFileSeed = {
  referenceId: string
  displayName: string
  mediaType: string | null
  text: string
}

export type DocsFixtureRecord = {
  profile: PersistedProfile
  settings: PersistedAppSettings
  readableFiles: DocsReadableFileSeed[]
}

export type DocsFixtureMatrix = Record<
  DocsFixtureTier,
  Record<DocsFixturePreset, DocsFixtureRecord>
>

export type DocsFixtureSelection = {
  tier: DocsFixtureTier
  preset: DocsFixturePreset
}

export const defaultDocsFixtureSelection: DocsFixtureSelection = {
  tier: "medium",
  preset: "shared-teams",
}

export function isDocsFixtureTier(
  candidate: string | null | undefined,
): candidate is DocsFixtureTier {
  return (
    candidate !== null &&
    candidate !== undefined &&
    (docsFixtureTiers as readonly string[]).includes(candidate)
  )
}

export function isDocsFixturePreset(
  candidate: string | null | undefined,
): candidate is DocsFixturePreset {
  return (
    candidate !== null &&
    candidate !== undefined &&
    (docsFixturePresets as readonly string[]).includes(candidate)
  )
}

function queryFixtureSelection(search: string): Partial<DocsFixtureSelection> {
  const params = new URLSearchParams(search)
  const tierParam = params.get("tier")
  const presetParam = params.get("preset")

  return {
    tier: isDocsFixtureTier(tierParam) ? tierParam : undefined,
    preset: isDocsFixturePreset(presetParam) ? presetParam : undefined,
  }
}

export function resolveDocsFixtureSelection(options?: {
  tier?: DocsFixtureTier
  preset?: DocsFixturePreset
  search?: string
}): DocsFixtureSelection {
  const defaultSearch =
    options?.search ??
    (typeof window !== "undefined" ? window.location.search : "")
  const fromQuery = queryFixtureSelection(defaultSearch)

  return {
    tier: options?.tier ?? fromQuery.tier ?? defaultDocsFixtureSelection.tier,
    preset:
      options?.preset ?? fromQuery.preset ?? defaultDocsFixtureSelection.preset,
  }
}

export function getDocsFixture(
  selection: DocsFixtureSelection,
): DocsFixtureRecord {
  return docsFixtureMatrix[selection.tier][selection.preset]
}

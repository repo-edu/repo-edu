import type { PersistedAppSettings, PersistedCourse } from "@repo-edu/domain"
import {
  defaultFixtureSelection,
  type FixturePreset,
  type FixtureSelection,
  type FixtureSource,
  type FixtureTier,
  fixturePresets,
  fixtureSources,
  fixtureTiers,
  getFixture,
  isFixturePreset,
  isFixtureSource,
  isFixtureTier,
} from "@repo-edu/test-fixtures"

export const docsFixtureTiers = fixtureTiers
export const docsFixturePresets = fixturePresets
export const docsFixtureSources = fixtureSources

export type DocsFixtureTier = FixtureTier
export type DocsFixturePreset = FixturePreset
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

export type DocsFixtureMatrix = Record<
  DocsFixtureTier,
  Record<DocsFixturePreset, DocsFixtureRecord>
>

export type DocsFixtureSelection = {
  tier: DocsFixtureTier
  preset: DocsFixturePreset
  source: DocsFixtureSource
}

export const defaultDocsFixtureSelection: DocsFixtureSelection = {
  tier: defaultFixtureSelection.tier,
  preset: defaultFixtureSelection.preset,
  source: "canvas",
}

function queryFixtureSelection(search: string): Partial<DocsFixtureSelection> {
  const params = new URLSearchParams(search)
  const tierParam = params.get("tier")
  const presetParam = params.get("preset")
  const sourceParam = params.get("source")

  return {
    tier: isFixtureTier(tierParam) ? tierParam : undefined,
    preset: isFixturePreset(presetParam) ? presetParam : undefined,
    source: isFixtureSource(sourceParam) ? sourceParam : undefined,
  }
}

export function resolveDocsFixtureSelection(options?: {
  tier?: DocsFixtureTier
  preset?: DocsFixturePreset
  source?: DocsFixtureSource
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
    source:
      options?.source ?? fromQuery.source ?? defaultDocsFixtureSelection.source,
  }
}

function toDocsFixtureRecord(
  sharedSelection: FixtureSelection,
): DocsFixtureRecord {
  const shared = getFixture(sharedSelection)
  return {
    course: shared.course,
    settings: shared.settings,
    readableFiles: shared.artifacts.map((artifact) => ({
      referenceId: artifact.artifactId,
      displayName: artifact.displayName,
      mediaType: artifact.mediaType,
      text: artifact.text,
    })),
  }
}

export function getDocsFixture(
  selection: DocsFixtureSelection,
): DocsFixtureRecord {
  return toDocsFixtureRecord({
    tier: selection.tier,
    preset: selection.preset,
  })
}

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
const fixedDocsPreset = "task-groups" as const
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
  const baseFixture = getFixture({
    tier: fixedDocsTier,
    preset: source === "file" ? repobeeReadableFilesPreset : fixedDocsPreset,
  })
  const repobeeFixture = getFixture({
    tier: fixedDocsTier,
    preset: repobeeReadableFilesPreset,
  })

  return {
    course: baseFixture.course,
    settings: baseFixture.settings,
    readableFiles: toReadableFiles(repobeeFixture.artifacts),
  }
}

export function getDocsFixture(
  selection: DocsFixtureSelection,
): DocsFixtureRecord {
  return toDocsFixtureRecord(selection.source)
}

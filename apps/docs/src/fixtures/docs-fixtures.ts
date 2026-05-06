import type { PersistedAppSettings } from "@repo-edu/domain/settings"
import {
  createBlankAnalysis,
  type PersistedAnalysis,
  type PersistedCourse,
} from "@repo-edu/domain/types"
import {
  type FixtureSource,
  fixtureSources,
  getFixture,
  isFixtureSource,
} from "@repo-edu/test-fixtures"
import type { RecordedAnalysisGitFixture } from "./analysis-git-fixture-types.js"
import { docsAnalysisGitFixture } from "./generated-analysis-git-fixture.js"

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
  analyses: PersistedAnalysis[]
  settings: PersistedAppSettings
  readableFiles: DocsReadableFileSeed[]
  analysisGitFixture: RecordedAnalysisGitFixture
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
const docsAnalysisId = "analysis-c2-arithmetic-expression-evaluator"

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
  const analysis = createBlankAnalysis(
    docsAnalysisId,
    docsAnalysisGitFixture.recordedAt,
    {
      displayName: "Arithmetic Expression Evaluator",
      searchFolder: docsAnalysisGitFixture.rootPath,
      analysisInputs: {
        extensions: ["py"],
      },
    },
  )

  return {
    course: {
      ...baseFixture.course,
      searchFolder: docsAnalysisGitFixture.rootPath,
      analysisInputs: {
        ...baseFixture.course.analysisInputs,
        extensions: ["py"],
      },
    },
    analyses: [analysis],
    settings: {
      ...baseFixture.settings,
      activeDocumentKind: "analysis",
      activeAnalysisId: docsAnalysisId,
      activeTab: "analysis",
    },
    readableFiles: toReadableFiles(repobeeFixture.artifacts),
    analysisGitFixture: docsAnalysisGitFixture,
  }
}

export function getDocsFixture(
  selection: DocsFixtureSelection,
): DocsFixtureRecord {
  return toDocsFixtureRecord(selection.source)
}

import type { PersistedAppSettings } from "@repo-edu/domain/settings"
import {
  createBlankAnalysis,
  type PersistedAnalysis,
  type PersistedCourse,
} from "@repo-edu/domain/types"
import { applyFixtureSourceOverlay, getFixture } from "@repo-edu/test-fixtures"
import type { RecordedAnalysisGitFixture } from "./analysis-git-fixture-types.js"
import { docsAnalysisGitFixture } from "./generated-analysis-git-fixture.js"

export type DocsReadableFileSeed = {
  referenceId: string
  displayName: string
  mediaType: string | null
  text: string
}

export type DocsFixtureRecord = {
  lmsCourse: PersistedCourse
  repobeeCourse: PersistedCourse
  analyses: PersistedAnalysis[]
  settings: PersistedAppSettings
  readableFiles: DocsReadableFileSeed[]
  analysisGitFixture: RecordedAnalysisGitFixture
}

const fixedDocsTier = "medium" as const
const lmsPreset = "task-groups" as const
const repobeePreset = "repobee-teams" as const
const docsAnalysisId = "analysis-c2-arithmetic-expression-evaluator"
const lmsCourseDisplayName = "Demo Course (Canvas)"
const repobeeCourseDisplayName = "Demo Course (RepoBee)"
const lmsCourseLmsId = "course-task-groups"

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

function buildDocsFixture(): DocsFixtureRecord {
  const lmsBase = getFixture({ tier: fixedDocsTier, preset: lmsPreset })
  const repobeeBase = getFixture({ tier: fixedDocsTier, preset: repobeePreset })

  const lmsCourse: PersistedCourse = {
    ...structuredClone(lmsBase.course),
    displayName: lmsCourseDisplayName,
    searchFolder: docsAnalysisGitFixture.rootPath,
    analysisInputs: {
      ...lmsBase.course.analysisInputs,
      extensions: ["py"],
    },
  }
  const repobeeCourse: PersistedCourse = {
    ...structuredClone(repobeeBase.course),
    displayName: repobeeCourseDisplayName,
    searchFolder: docsAnalysisGitFixture.rootPath,
    analysisInputs: {
      ...repobeeBase.course.analysisInputs,
      extensions: ["py"],
    },
  }

  const settings: PersistedAppSettings = structuredClone(lmsBase.settings)

  applyFixtureSourceOverlay(repobeeCourse, settings, "file", repobeeCourse.id)
  applyFixtureSourceOverlay(lmsCourse, settings, "canvas", lmsCourseLmsId)

  settings.activeDocumentKind = "analysis"
  settings.activeAnalysisId = docsAnalysisId
  settings.activeCourseId = lmsCourse.id
  settings.activeTab = "analysis"

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
    lmsCourse,
    repobeeCourse,
    analyses: [analysis],
    settings,
    readableFiles: toReadableFiles(repobeeBase.artifacts),
    analysisGitFixture: docsAnalysisGitFixture,
  }
}

export function getDocsFixture(): DocsFixtureRecord {
  return buildDocsFixture()
}

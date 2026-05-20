import {
  defaultAppSettings,
  type PersistedAppSettings,
} from "@repo-edu/domain/settings"
import {
  createBlankAnalysis,
  type PersistedAnalysis,
  type PersistedCourse,
} from "@repo-edu/domain/types"
import {
  composeCourseFromCohort,
  type LmsCohortSource,
  type RepobeeCohortSource,
} from "@repo-edu/test-fixtures"
import type { RecordedAnalysisGitFixture } from "./analysis-git-fixture-types.js"
import lmsCohortJson from "./demo-cohorts/lms.json" with { type: "json" }
import repobeeCohortJson from "./demo-cohorts/repobee.json" with {
  type: "json",
}
import { allGeneratedRepoSlots } from "./projects/index.js"
import { buildRecordedAnalysisGitFixture } from "./recorded-repo-slots.js"

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

const lmsCourseDisplayName = "Demo Course (LMS)"
const repobeeCourseDisplayName = "Demo Course (RepoBee)"
const analysisRootPath = "/repo-edu-demo/shared-analysis-fixture"
const lmsCohort = lmsCohortJson as LmsCohortSource
const repobeeCohort = repobeeCohortJson as RepobeeCohortSource

function toCsvCell(value: string | null | undefined): string {
  const normalized = value ?? ""
  return /[",\n]/.test(normalized)
    ? `"${normalized.replaceAll('"', '""')}"`
    : normalized
}

function toCsvLine(values: Array<string | null | undefined>): string {
  return values.map(toCsvCell).join(",")
}

function lmsReadableFiles(cohort: LmsCohortSource): DocsReadableFileSeed[] {
  const studentsCsv = [
    toCsvLine(["name", "email", "student_number", "git_username"]),
    ...Object.values(cohort.students).map((student) =>
      toCsvLine([
        student.name,
        student.email,
        student.studentNumber ?? null,
        student.gitUsername ?? null,
      ]),
    ),
  ].join("\n")
  const groupsCsv = [
    toCsvLine(["group_name", "name", "email"]),
    ...Object.values(cohort.groups).flatMap((group) =>
      group.memberIds.map((memberId) => {
        const member = cohort.students[memberId]
        return toCsvLine([group.name, member?.name, member?.email])
      }),
    ),
  ].join("\n")

  return [
    {
      referenceId: "students-csv",
      displayName: "students.csv",
      mediaType: "text/csv",
      text: studentsCsv,
    },
    {
      referenceId: "groups-csv",
      displayName: "groups.csv",
      mediaType: "text/csv",
      text: groupsCsv,
    },
  ]
}

function repobeeReadableFiles(
  cohort: RepobeeCohortSource,
): DocsReadableFileSeed[] {
  const teamsTxt = Object.values(cohort.teams)
    .map((team) =>
      team.members.map((member) => member.gitUsername ?? "").join(" "),
    )
    .join("\n")
  return [
    {
      referenceId: "teams-txt",
      displayName: "teams.txt",
      mediaType: "text/plain",
      text: teamsTxt,
    },
  ]
}

function courseWithAnalysisRoot(
  course: PersistedCourse,
  displayName: string,
  searchFolder: string,
): PersistedCourse {
  return {
    ...course,
    displayName,
    searchFolder,
    analysisInputs: {
      ...course.analysisInputs,
      extensions: ["py"],
    },
  }
}

function buildAnalyses(recordedAt: string): PersistedAnalysis[] {
  return [
    createBlankAnalysis("calculator", recordedAt, {
      displayName: "Calculator",
      searchFolder: analysisRootPath,
      analysisInputs: { extensions: ["py"] },
    }),
    createBlankAnalysis("topological-task-scheduler", recordedAt, {
      displayName: "Topological Task Scheduler",
      searchFolder: analysisRootPath,
      analysisInputs: { extensions: ["py"] },
    }),
    createBlankAnalysis("huffman-encoder", recordedAt, {
      displayName: "Huffman Encoder",
      searchFolder: analysisRootPath,
      analysisInputs: { extensions: ["py"] },
    }),
  ]
}

function buildDocsFixture(): DocsFixtureRecord {
  const analysisGitFixture = buildRecordedAnalysisGitFixture(
    allGeneratedRepoSlots,
    analysisRootPath,
  )
  const lmsCourse = courseWithAnalysisRoot(
    composeCourseFromCohort({ profile: "lms", cohort: lmsCohort }),
    lmsCourseDisplayName,
    analysisGitFixture.rootPath,
  )
  const repobeeCourse = courseWithAnalysisRoot(
    composeCourseFromCohort({ profile: "repobee", cohort: repobeeCohort }),
    repobeeCourseDisplayName,
    analysisGitFixture.rootPath,
  )
  const analyses = buildAnalyses(analysisGitFixture.recordedAt)

  const settings: PersistedAppSettings = {
    ...defaultAppSettings,
    activeDocumentKind: "course",
    activeAnalysisId: analyses[0].id,
    activeCourseId: lmsCourse.id,
    activeTab: "roster",
    gitConnections: [
      {
        id: "github-demo",
        provider: "github",
        baseUrl: "https://github.com",
        token: "demo-token",
      },
    ],
    activeGitConnectionId: "github-demo",
    lastOpenedAt: analysisGitFixture.recordedAt,
  }

  return {
    lmsCourse,
    repobeeCourse,
    analyses,
    settings,
    readableFiles: [
      ...lmsReadableFiles(lmsCohort),
      ...repobeeReadableFiles(repobeeCohort),
    ],
    analysisGitFixture,
  }
}

export function getDocsFixture(): DocsFixtureRecord {
  return buildDocsFixture()
}

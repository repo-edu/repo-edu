import {
  defaultAppCredentials,
  defaultAppPreferences,
} from "@repo-edu/domain/settings"
import type { PersistedCourse } from "@repo-edu/domain/types"
import type { WorkflowId, WorkflowInput } from "../index.js"

export const course: PersistedCourse = {
  kind: "repo-edu.course.v1",
  backing: "repobee",
  revision: 1,
  id: "course-1",
  displayName: "Course",
  lmsConnectionId: null,
  organization: null,
  lmsCourseId: null,
  idSequences: {
    nextGroupSeq: 1,
    nextGroupSetSeq: 1,
    nextTeamSeq: 1,
    nextMemberSeq: 1,
    nextAssignmentSeq: 1,
  },
  roster: {
    connection: null,
    students: [],
    staff: [],
    groups: [],
    groupSets: [],
    assignments: [],
  },
  repositoryTemplate: null,
  repositoryCloneTargetDirectory: "/courses",
  repositoryCloneDirectoryLayout: "flat",
  searchFolder: null,
  analysisInputs: {},
  updatedAt: "2026-09-06T00:00:00.000Z",
}

export const file = {
  kind: "user-file-ref",
  referenceId: "selection",
  displayName: "roster.csv",
  mediaType: "text/csv",
  byteLength: 32,
} as const
export const target = {
  kind: "user-save-target-ref",
  referenceId: "destination",
  displayName: "export.xlsx",
  suggestedFormat: "xlsx",
} as const
const credentials = defaultAppCredentials
const lmsDraft = {
  provider: "canvas",
  baseUrl: "https://lms.example.test",
  token: "draft",
  userAgent: "Repo Edu",
} as const
const groupSetFile = {
  course,
  file,
  format: "group-set-csv",
  targetGroupSetId: null,
} as const
const batch = {
  course,
  credentials,
  assignmentId: null,
  template: null,
  targetDirectory: "/courses",
  directoryLayout: "flat",
} as const
export const questionInput = {
  personId: "person-1",
  contentScopeId: "scope-1",
  localIdentityContext: {
    names: [],
    emails: [],
    opaqueIdentifiers: [],
    gitUsernames: [],
  },
  excerpts: [{ filePath: "main.ts", startLine: 1, lines: ["return 1"] }],
  excerptFileSources: { "main.ts": "source-1" },
  questionCount: 3,
  llmSettings: {
    llmConnections: [],
    activeLlmConnectionId: null,
    examinationModelsByProvider: {},
  },
}

export const workflowInputs = {
  "course.list": undefined,
  "course.load": { courseId: course.id },
  "course.save": course,
  "course.delete": { courseId: course.id },
  "settings.loadApp": undefined,
  "settings.saveCredentials": credentials,
  "settings.savePreferences": defaultAppPreferences,
  "connection.verifyLmsDraft": lmsDraft,
  "connection.listLmsCoursesDraft": lmsDraft,
  "connection.verifyGitDraft": {
    provider: "gitlab",
    baseUrl: "https://git.example.test",
    token: "draft",
    userAgent: "Repo Edu",
  },
  "connection.verifyLlmDraft": {
    provider: "claude",
    authMode: "api",
    apiKey: "draft",
    maxTokens: 8192,
  },
  "roster.importFromFile": { course, file },
  "roster.importFromLms": { course, credentials, lmsCourseId: "remote-1" },
  "roster.exportMembers": { course, target, format: "xlsx" },
  "groupSet.fetchAvailableFromLms": { course, credentials },
  "groupSet.connectFromLms": {
    course,
    credentials,
    remoteGroupSetId: "remote-1",
  },
  "groupSet.syncFromLms": { course, credentials, groupSetId: "gs_0001" },
  "groupSet.previewImportFromFile": groupSetFile,
  "groupSet.importFromFile": groupSetFile,
  "groupSet.export": { course, groupSetId: "gs_0001", target, format: "txt" },
  "gitUsernames.import": { course, credentials, file },
  "validation.roster": { course },
  "validation.assignment": { course, assignmentId: "a_0001" },
  "repo.create": batch,
  "repo.clone": batch,
  "repo.update": {
    course,
    credentials,
    assignmentId: "a_0001",
    templateOverride: {
      kind: "remote",
      owner: "teacher",
      name: "template",
      visibility: "private",
    },
  },
  "repo.listNamespace": {
    credentials,
    namespace: "teacher",
    filter: "lab-*",
    includeArchived: true,
  },
  "repo.bulkClone": {
    credentials,
    namespace: "teacher",
    repositories: [{ name: "lab-1", identifier: "class/lab-1" }],
    targetDirectory: "/courses",
  },
  "userFile.inspectSelection": file,
  "userFile.exportPreview": target,
  "analysis.run": {
    repositoryAbsolutePath: "/courses/lab-1",
    config: {
      includeFiles: ["*"],
      whitespace: false,
      maxConcurrency: 1,
      blameSkip: false,
    },
    analysisSource: { kind: "course", rosterContext: { members: [] } },
    snapshotCommitOid: "head",
  },
  "analysis.resolveSnapshotHead": {
    repositoryRelativePath: "lab-1",
    course: { repositoryCloneTargetDirectory: "/courses" },
    asOfCommit: "head",
    until: "2026-09-06",
  },
  "analysis.blame": {
    repositoryAbsolutePath: "/courses/lab-1",
    config: {
      includeFiles: ["*"],
      whitespace: false,
      maxConcurrency: 1,
      copyMove: 1,
    },
    personDbBaseline: {
      persons: [
        {
          id: "p1",
          canonicalName: "Teacher",
          canonicalEmail: "teacher@example.test",
          aliases: [
            {
              name: "Teacher",
              email: "teacher@example.test",
              evidence: "email-link",
            },
          ],
          commitCount: 1,
        },
      ],
      identityIndex: new Map([["teacher", "p1"]]),
    },
    files: ["main.ts"],
    snapshotCommitOid: "head",
  },
  "analysis.discoverRepos": { searchFolder: "/courses", maxDepth: 3 },
  "analysis.listFolderFiles": { folderPath: "/courses", extensions: ["ts"] },
  "analysis.readFolderFile": {
    folderPath: "/courses",
    relativePath: "main.ts",
  },
  "examination.generateQuestions": {
    ...questionInput,
    regenerate: true,
    seedQuestions: [
      {
        question: "Why?",
        answer: "Because.",
        anchor: { sourceId: "source-1", lineRange: { start: 1, end: 1 } },
      },
    ],
  },
  "examination.lookupQuestions": questionInput,
  "examination.prepareSubmissionSource": {
    folderPath: "/courses",
    selectedRelativePaths: ["main.ts"],
    configuredExtensions: ["ts"],
    attachedRosterIdentities: [
      {
        name: "Teacher",
        email: null,
        id: null,
        lmsUserId: null,
        studentNumber: null,
        gitUsername: null,
      },
    ],
  },
  "examination.lookupQuestionSummaries": {
    subjects: [
      {
        subjectId: "subject-1",
        personId: questionInput.personId,
        contentScopeId: questionInput.contentScopeId,
        localIdentityContext: questionInput.localIdentityContext,
        excerpts: questionInput.excerpts,
        excerptFileSources: questionInput.excerptFileSources,
      },
    ],
  },
  "examination.archive.export": target,
  "examination.archive.import": file,
} satisfies { [K in WorkflowId]: WorkflowInput<K> }

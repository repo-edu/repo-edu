import type { AnalysisResult, BlameResult } from "@repo-edu/domain/analysis"
import type { PersistedAppSettings } from "@repo-edu/domain/settings"
import type {
  CourseSummary,
  GroupSetImportPreview,
  PersistedCourse,
  Roster,
  RosterImportFromLmsResult,
  RosterValidationResult,
} from "@repo-edu/domain/types"
import type {
  UserFileRef,
  UserSaveTargetRef,
} from "@repo-edu/host-runtime-contract"
import type {
  ExaminationArchiveExportResult,
  ExaminationArchiveImportSummary,
  ExaminationGenerateOutput,
  ExaminationGenerateQuestionsInput,
  ExaminationGenerateQuestionsResult,
  ExaminationLookupQuestionSummariesInput,
  ExaminationLookupQuestionSummariesResult,
  ExaminationLookupQuestionsInput,
  ExaminationLookupQuestionsResult,
  ExaminationPreparedSubmissionSource,
  ExaminationPrepareSubmissionSourceInput,
  ExaminationStopGenerationInput,
  ExaminationStopGenerationResult,
} from "./examination-contract.js"
import type { DiagnosticOutput, MilestoneProgress } from "./workflow-core.js"
import type {
  AnalysisBlameInput,
  AnalysisDiscoverReposInput,
  AnalysisDiscoverReposResult,
  AnalysisListFolderFilesInput,
  AnalysisListFolderFilesResult,
  AnalysisProgress,
  AnalysisReadFolderFileInput,
  AnalysisReadFolderFileResult,
  AnalysisRunInput,
  AssignmentValidationInput,
  ConnectionVerificationResult,
  DiscoverReposProgress,
  GitUsernameImportInput,
  GroupSetConnectFromLmsInput,
  GroupSetExportInput,
  GroupSetFetchAvailableFromLmsInput,
  GroupSetImportFromFileInput,
  GroupSetLmsApplyResult,
  GroupSetLmsSummary,
  GroupSetPreviewImportFromFileInput,
  GroupSetSyncFromLmsInput,
  ListLmsCoursesDraftInput,
  LmsCourseSummary,
  RepositoryBatchInput,
  RepositoryBulkCloneInput,
  RepositoryCloneResult,
  RepositoryCreateResult,
  RepositoryListNamespaceInput,
  RepositoryListNamespaceResult,
  RepositoryUpdateInput,
  RepositoryUpdateResult,
  RosterExportMembersInput,
  RosterImportFromFileInput,
  RosterImportFromFileResult,
  RosterImportFromLmsInput,
  RosterValidationInput,
  UserFileExportPreviewResult,
  UserFileInspectResult,
  VerifyGitDraftInput,
  VerifyLlmDraftInput,
  VerifyLmsDraftInput,
} from "./workflow-types.js"

export type CourseSaveStamp = Pick<PersistedCourse, "revision" | "updatedAt">

export type WorkflowPayloads = {
  "course.list": {
    input: undefined
    progress: never
    output: never
    result: CourseSummary[]
  }
  "course.load": {
    input: { courseId: string }
    progress: MilestoneProgress
    output: DiagnosticOutput
    result: PersistedCourse
  }
  "course.save": {
    input: PersistedCourse
    progress: MilestoneProgress
    output: DiagnosticOutput
    result: CourseSaveStamp
  }
  "course.delete": {
    input: { courseId: string }
    progress: never
    output: never
    result: undefined
  }
  "settings.loadApp": {
    input: undefined
    progress: never
    output: never
    result: PersistedAppSettings
  }
  "settings.saveApp": {
    input: PersistedAppSettings
    progress: MilestoneProgress
    output: DiagnosticOutput
    result: undefined
  }
  "connection.verifyLmsDraft": {
    input: VerifyLmsDraftInput
    progress: MilestoneProgress
    output: DiagnosticOutput
    result: ConnectionVerificationResult
  }
  "connection.listLmsCoursesDraft": {
    input: ListLmsCoursesDraftInput
    progress: MilestoneProgress
    output: DiagnosticOutput
    result: LmsCourseSummary[]
  }
  "connection.verifyGitDraft": {
    input: VerifyGitDraftInput
    progress: MilestoneProgress
    output: DiagnosticOutput
    result: ConnectionVerificationResult
  }
  "connection.verifyLlmDraft": {
    input: VerifyLlmDraftInput
    progress: MilestoneProgress
    output: DiagnosticOutput
    result: ConnectionVerificationResult
  }
  "roster.importFromFile": {
    input: RosterImportFromFileInput
    progress: MilestoneProgress
    output: DiagnosticOutput
    result: RosterImportFromFileResult
  }
  "roster.importFromLms": {
    input: RosterImportFromLmsInput
    progress: MilestoneProgress
    output: DiagnosticOutput
    result: RosterImportFromLmsResult
  }
  "roster.exportMembers": {
    input: RosterExportMembersInput
    progress: MilestoneProgress
    output: DiagnosticOutput
    result: { file: UserSaveTargetRef }
  }
  "groupSet.fetchAvailableFromLms": {
    input: GroupSetFetchAvailableFromLmsInput
    progress: MilestoneProgress
    output: DiagnosticOutput
    result: GroupSetLmsSummary[]
  }
  "groupSet.connectFromLms": {
    input: GroupSetConnectFromLmsInput
    progress: MilestoneProgress
    output: DiagnosticOutput
    result: GroupSetLmsApplyResult
  }
  "groupSet.syncFromLms": {
    input: GroupSetSyncFromLmsInput
    progress: MilestoneProgress
    output: DiagnosticOutput
    result: GroupSetLmsApplyResult
  }
  "groupSet.previewImportFromFile": {
    input: GroupSetPreviewImportFromFileInput
    progress: MilestoneProgress
    output: DiagnosticOutput
    result: GroupSetImportPreview
  }
  "groupSet.importFromFile": {
    input: GroupSetImportFromFileInput
    progress: MilestoneProgress
    output: DiagnosticOutput
    result: PersistedCourse
  }
  "groupSet.export": {
    input: GroupSetExportInput
    progress: MilestoneProgress
    output: DiagnosticOutput
    result: { file: UserSaveTargetRef }
  }
  "gitUsernames.import": {
    input: GitUsernameImportInput
    progress: MilestoneProgress
    output: DiagnosticOutput
    result: Roster
  }
  "validation.roster": {
    input: RosterValidationInput
    progress: never
    output: never
    result: RosterValidationResult
  }
  "validation.assignment": {
    input: AssignmentValidationInput
    progress: never
    output: never
    result: RosterValidationResult
  }
  "repo.create": {
    input: RepositoryBatchInput
    progress: MilestoneProgress
    output: DiagnosticOutput
    result: RepositoryCreateResult
  }
  "repo.clone": {
    input: RepositoryBatchInput
    progress: MilestoneProgress
    output: DiagnosticOutput
    result: RepositoryCloneResult
  }
  "repo.update": {
    input: RepositoryUpdateInput
    progress: MilestoneProgress
    output: DiagnosticOutput
    result: RepositoryUpdateResult
  }
  "repo.listNamespace": {
    input: RepositoryListNamespaceInput
    progress: MilestoneProgress
    output: DiagnosticOutput
    result: RepositoryListNamespaceResult
  }
  "repo.bulkClone": {
    input: RepositoryBulkCloneInput
    progress: MilestoneProgress
    output: DiagnosticOutput
    result: RepositoryCloneResult
  }
  "userFile.inspectSelection": {
    input: UserFileRef
    progress: MilestoneProgress
    output: DiagnosticOutput
    result: UserFileInspectResult
  }
  "userFile.exportPreview": {
    input: UserSaveTargetRef
    progress: MilestoneProgress
    output: DiagnosticOutput
    result: UserFileExportPreviewResult
  }
  "analysis.run": {
    input: AnalysisRunInput
    progress: AnalysisProgress
    output: DiagnosticOutput
    result: AnalysisResult
  }
  "analysis.blame": {
    input: AnalysisBlameInput
    progress: AnalysisProgress
    output: DiagnosticOutput
    result: BlameResult
  }
  "analysis.discoverRepos": {
    input: AnalysisDiscoverReposInput
    progress: DiscoverReposProgress
    output: never
    result: AnalysisDiscoverReposResult
  }
  "analysis.listFolderFiles": {
    input: AnalysisListFolderFilesInput
    progress: never
    output: never
    result: AnalysisListFolderFilesResult
  }
  "analysis.readFolderFile": {
    input: AnalysisReadFolderFileInput
    progress: never
    output: never
    result: AnalysisReadFolderFileResult
  }
  "examination.generateQuestions": {
    input: ExaminationGenerateQuestionsInput
    progress: MilestoneProgress
    output: ExaminationGenerateOutput
    result: ExaminationGenerateQuestionsResult
  }
  "examination.stopGeneration": {
    input: ExaminationStopGenerationInput
    progress: never
    output: never
    result: ExaminationStopGenerationResult
  }
  "examination.lookupQuestions": {
    input: ExaminationLookupQuestionsInput
    progress: MilestoneProgress
    output: DiagnosticOutput
    result: ExaminationLookupQuestionsResult
  }
  "examination.prepareSubmissionSource": {
    input: ExaminationPrepareSubmissionSourceInput
    progress: MilestoneProgress
    output: DiagnosticOutput
    result: ExaminationPreparedSubmissionSource
  }
  "examination.lookupQuestionSummaries": {
    input: ExaminationLookupQuestionSummariesInput
    progress: MilestoneProgress
    output: DiagnosticOutput
    result: ExaminationLookupQuestionSummariesResult
  }
  "examination.archive.export": {
    input: UserSaveTargetRef
    progress: MilestoneProgress
    output: DiagnosticOutput
    result: ExaminationArchiveExportResult
  }
  "examination.archive.import": {
    input: UserFileRef
    progress: MilestoneProgress
    output: DiagnosticOutput
    result: ExaminationArchiveImportSummary
  }
}

export type WorkflowId = keyof WorkflowPayloads

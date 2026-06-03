import type {
  AnalysisBlameConfig,
  AnalysisConfig,
  AnalysisRosterContext,
  PersonDbSnapshot,
} from "@repo-edu/domain/analysis"
import type { ConnectionBase } from "@repo-edu/domain/connection"
import type { PersistedAppSettings } from "@repo-edu/domain/settings"
import type {
  ExportFormat,
  GitProviderKind,
  GroupSet,
  GroupSetImportFormat,
  IdSequences,
  LmsProviderKind,
  PersistedCourse,
  RepositoryTemplate,
  Roster,
} from "@repo-edu/domain/types"
import type {
  UserFileRef,
  UserSaveTargetRef,
} from "@repo-edu/host-runtime-contract"
import type {
  LlmAuthMode,
  LlmProvider,
} from "@repo-edu/integrations-llm-contract"
import type {
  LmsCourseSummary as LmsContractCourseSummary,
  LmsGroupSetSummary as LmsContractGroupSetSummary,
} from "@repo-edu/integrations-lms-contract"

export type VerifyLmsDraftInput = ConnectionBase & {
  provider: LmsProviderKind
}

export type ListLmsCoursesDraftInput = ConnectionBase & {
  provider: LmsProviderKind
}

export type VerifyGitDraftInput = ConnectionBase & {
  provider: GitProviderKind
}

export type VerifyLlmDraftInput =
  | {
      provider: Exclude<LlmProvider, "claude">
      authMode: LlmAuthMode
      apiKey: string
    }
  | {
      provider: "claude"
      authMode: "subscription"
      apiKey: string
    }
  | {
      provider: "claude"
      authMode: "api"
      apiKey: string
      maxTokens: number
    }

export type ConnectionVerificationResult = {
  verified: boolean
  checkedAt: string
}

export type LmsCourseSummary = LmsContractCourseSummary

export type RosterImportFromFileInput = {
  course: PersistedCourse
  file: UserFileRef
}

export type RosterImportFromFileResult = {
  roster: Roster
  idSequences: IdSequences
}

export type RosterExportMembersInput = {
  course: PersistedCourse
  target: UserSaveTargetRef
  format: ExportFormat
}

export type RosterImportFromLmsInput = {
  course: PersistedCourse
  appSettings: PersistedAppSettings
  lmsCourseId: string
}

export type GroupSetSyncFromLmsInput = {
  course: PersistedCourse
  appSettings: PersistedAppSettings
  groupSetId: string
}

export type GroupSetConnectFromLmsInput = {
  course: PersistedCourse
  appSettings: PersistedAppSettings
  remoteGroupSetId: string
}

export type GroupSetFetchAvailableFromLmsInput = {
  course: PersistedCourse
  appSettings: PersistedAppSettings
}

export type GroupSetLmsSummary = LmsContractGroupSetSummary

export type GroupSetLmsApplyResult = {
  roster: Roster
  idSequences: IdSequences
} & GroupSet

export type GroupSetPreviewImportFromFileInput = {
  course: PersistedCourse
  file: UserFileRef
  format: GroupSetImportFormat
  targetGroupSetId: string | null
}

export type GroupSetImportFromFileInput = {
  course: PersistedCourse
  file: UserFileRef
  format: GroupSetImportFormat
  targetGroupSetId: string | null
}

export type GroupSetExportInput = {
  course: PersistedCourse
  groupSetId: string
  target: UserSaveTargetRef
  format: "csv" | "txt"
}

export type GitUsernameImportInput = {
  course: PersistedCourse
  appSettings: PersistedAppSettings
  file: UserFileRef
}

export type AssignmentValidationInput = {
  course: PersistedCourse
  assignmentId: string
}

export type RosterValidationInput = {
  course: PersistedCourse
}

export type RepositoryBatchInput = {
  course: PersistedCourse
  appSettings: PersistedAppSettings
  assignmentId: string | null
  template: RepositoryTemplate | null
  targetDirectory?: string
  directoryLayout?: "flat" | "by-team" | "by-task"
}

export type RepositoryUpdateInput = {
  course: PersistedCourse
  appSettings: PersistedAppSettings
  assignmentId: string
  templateOverride?: RepositoryTemplate | null
}

export type RepositoryListNamespaceInput = {
  appSettings: PersistedAppSettings
  namespace: string
  filter?: string
  includeArchived?: boolean
}

export type RepositoryListNamespaceEntry = {
  /** Leaf repository name (final path segment), suitable for display and local folder names. */
  name: string
  /**
   * Path identifier relative to the requested namespace, used for clone URL
   * resolution. Equals `name` on providers without nested namespaces (GitHub,
   * Gitea). On GitLab, may include subgroup segments, e.g. `team-101/lab-1`.
   */
  identifier: string
  archived: boolean
}

export type RepositoryListNamespaceResult = {
  repositories: RepositoryListNamespaceEntry[]
}

export type RepositoryBulkCloneEntry = {
  /** Leaf repository name; becomes the local folder name. */
  name: string
  /** Namespace-relative path used to resolve the clone URL (see ListedRepository.identifier). */
  identifier: string
}

export type RepositoryBulkCloneInput = {
  appSettings: PersistedAppSettings
  namespace: string
  repositories: RepositoryBulkCloneEntry[]
  targetDirectory: string
}

export type RecordedRepositoriesByAssignment = Record<
  string /* assignmentId */,
  Record<string /* groupId */, string /* repoName */>
>

export type RepositoryCreateResult = {
  repositoriesPlanned: number
  repositoriesCreated: number
  repositoriesAdopted: number
  repositoriesFailed: number
  templateCommitShas: Record<string, string>
  recordedRepositories: RecordedRepositoriesByAssignment
  completedAt: string
}

export type RepositoryCloneResult = {
  repositoriesPlanned: number
  repositoriesCloned: number
  repositoriesFailed: number
  recordedRepositories: RecordedRepositoriesByAssignment
  completedAt: string
}

export type RepositoryUpdateResult = {
  repositoriesPlanned: number
  prsCreated: number
  prsSkipped: number
  prsFailed: number
  templateCommitSha: string | null
  recordedRepositories: RecordedRepositoriesByAssignment
  completedAt: string
}

export type UserFileInspectResult = {
  workflowId: "userFile.inspectSelection"
  displayName: string
  byteLength: number
  lineCount: number
  firstLine: string | null
}

export type UserFileExportPreviewResult = {
  workflowId: "userFile.exportPreview"
  displayName: string
  preview: string
  savedAt: string
}

export type AnalysisProgress = {
  phase: string
  label: string
  processedFiles: number
  totalFiles: number
  processedCommits?: number
  totalCommits?: number
  currentFile?: string
  // Running per-author line tally emitted during blame phase 2 so the
  // Authors view can show Lines of Code progressing live. Keyed by personId
  // resolved against the input person DB; identities not yet in the baseline
  // are omitted and only appear in the final result.
  partialAuthorLines?: ReadonlyArray<{ personId: string; lines: number }>
}

export type AnalysisCourseRepositorySource = Pick<
  PersistedCourse,
  "repositoryCloneTargetDirectory"
>

export type AnalysisRepositoryInput =
  | {
      repositoryRelativePath: string
      repositoryAbsolutePath?: undefined
      course: AnalysisCourseRepositorySource
    }
  | {
      repositoryAbsolutePath: string
      repositoryRelativePath?: undefined
      course?: undefined
    }

export type AnalysisDiscoverReposInput = {
  searchFolder: string
  maxDepth?: number
}

export type DiscoveredRepo = {
  name: string
  path: string
}

export type AnalysisDiscoverReposResult = {
  repos: DiscoveredRepo[]
}

export type DiscoverReposProgress = {
  currentFolder: string
}

export type AnalysisFolderFile = {
  relativePath: string
  size: number
}

export type AnalysisListFolderFilesInput = {
  folderPath: string
  extensions: string[]
}

export type AnalysisListFolderFilesResult = {
  files: AnalysisFolderFile[]
}

export type AnalysisReadFolderFileInput = {
  folderPath: string
  relativePath: string
}

export type AnalysisReadFolderFileResult = {
  relativePath: string
  mediaType: null
  byteLength: number
  base64: string
}

// Per-file sanity guard for submission inputs. Raised well above realistic
// source-file sizes so the guard only fires on accidental blobs (vendored
// libraries, build artefacts) rather than ordinary student code.
export const SUBMISSION_FILE_MAX_BYTES = 1 * 1024 * 1024
export const SUBMISSION_FILE_MAX_LINES = 20_000

/**
 * Constant personId used for folder-submission examinations. Submission
 * archives are partitioned by the file-set content hash (contentScopeId),
 * not by any per-student identity, so all submission entries share this
 * placeholder. The literal is deliberately not a 64-char hex digest so it
 * cannot collide with blame-derived personIds, which are sha256 hex.
 */
export const SUBMISSION_FOLDER_PERSON_ID = "submission"

export type AnalysisRunSource =
  | { kind: "course"; rosterContext?: AnalysisRosterContext }
  | { kind: "folder" }

export type AnalysisRunInput = AnalysisRepositoryInput & {
  config: AnalysisConfig
  analysisSource?: AnalysisRunSource
  asOfCommit?: string
}

export type AnalysisBlameInput = AnalysisRepositoryInput & {
  config: AnalysisBlameConfig
  personDbBaseline: PersonDbSnapshot
  personDbOverlay?: PersonDbSnapshot
  files: string[]
  asOfCommit: string
}

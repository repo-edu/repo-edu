import type {
  AnalysisBlameConfig,
  AnalysisConfig,
  AnalysisResult,
  AnalysisRosterContext,
  BlameResult,
  PersonDbSnapshot,
} from "@repo-edu/domain/analysis"
import type { ConnectionBase } from "@repo-edu/domain/connection"
import type {
  ExaminationModelsByProvider,
  PersistedAppSettings,
  PersistedLlmConnection,
} from "@repo-edu/domain/settings"
import type {
  CourseSummary,
  ExportFormat,
  GitProviderKind,
  GroupSet,
  GroupSetImportFormat,
  GroupSetImportPreview,
  IdSequences,
  LmsProviderKind,
  PersistedCourse,
  RepositoryTemplate,
  Roster,
  RosterImportFromLmsResult,
  RosterValidationIssue,
  RosterValidationResult,
  ValidationIssue,
} from "@repo-edu/domain/types"
import type {
  ExaminationArchiveKey,
  ExaminationArchiveImportSummary as HostExaminationArchiveImportSummary,
  UserFileRef,
  UserSaveTargetRef,
} from "@repo-edu/host-runtime-contract"
import type {
  LlmAuthMode,
  LlmEffort,
  LlmProvider,
  LlmUsage,
} from "@repo-edu/integrations-llm-contract"
import type {
  LmsCourseSummary as LmsContractCourseSummary,
  LmsGroupSetSummary as LmsContractGroupSetSummary,
} from "@repo-edu/integrations-lms-contract"

export const packageId = "@repo-edu/application-contract"
export type { UserFileRef, UserSaveTargetRef }

export type DeliverySurface = "desktop" | "docs" | "cli"
export type WorkflowProgressGranularity = "none" | "milestone" | "granular"
export type WorkflowCancellationGuarantee =
  | "non-cancellable"
  | "best-effort"
  | "cooperative"

export type AppValidationIssue = ValidationIssue | RosterValidationIssue

export type WorkflowExecutionProfile = {
  progress: WorkflowProgressGranularity
  cancellation: WorkflowCancellationGuarantee
}

export type DiagnosticOutput = {
  channel: "info" | "warn" | "stdout" | "stderr"
  message: string
}

export type MilestoneProgress = {
  step: number
  totalSteps: number
  label: string
}

export type TransportErrorReason =
  | "ipc-disconnected"
  | "serialization"
  | "host-crash"
  | "timeout"

export type AppError =
  | {
      type: "transport"
      message: string
      reason: TransportErrorReason
      retryable: boolean
    }
  | {
      type: "cancelled"
      message: string
    }
  | {
      type: "validation"
      message: string
      issues: AppValidationIssue[]
    }
  | {
      type: "not-found"
      message: string
      resource:
        | "connection"
        | "course"
        | "group-set"
        | "assignment"
        | "repository"
        | "file"
    }
  | {
      type: "conflict"
      message: string
      resource:
        | "course"
        | "connection"
        | "group-set"
        | "assignment"
        | "repository"
        | "file"
      reason: string
    }
  | {
      type: "provider"
      message: string
      provider: LmsProviderKind | GitProviderKind | "git" | "llm"
      operation: string
      retryable: boolean
    }
  | {
      type: "persistence"
      message: string
      operation: "read" | "write" | "decode" | "encode"
      pathHint?: string
    }
  | {
      type: "unexpected"
      message: string
      retryable: boolean
    }

export const appErrorOwnership = {
  transport:
    "Only transport adapters may create transport errors when IPC or bridge mechanics fail.",
  cancelled:
    "Transport adapters and packages/application may create cancelled when the caller-owned AbortSignal stops work.",
  validation:
    "Only packages/application may normalize validation failures into the shared validation variant.",
  "not-found":
    "Only packages/application may expose not-found after domain, persistence, or provider lookup misses.",
  conflict:
    "Only packages/application may expose conflict after detecting write or identity collisions.",
  provider:
    "Only packages/application may normalize LMS, Git, or subprocess adapter failures into provider errors.",
  persistence:
    "Only packages/application may normalize settings, course, and user-file boundary failures into persistence errors.",
  unexpected:
    "Only packages/application may expose unexpected as the final catch-all for unknown failures.",
} as const

export function createTransportAppError(
  reason: TransportErrorReason,
  message: string,
  retryable = true,
): AppError {
  return {
    type: "transport",
    message,
    reason,
    retryable,
  }
}

export function createCancelledAppError(
  message = "Workflow was cancelled.",
): AppError {
  return {
    type: "cancelled",
    message,
  }
}

const appErrorTypes = new Set<string>([
  "transport",
  "cancelled",
  "validation",
  "not-found",
  "conflict",
  "provider",
  "persistence",
  "unexpected",
])

export function isAppError(value: unknown): value is AppError {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof value.type === "string" &&
    appErrorTypes.has(value.type)
  )
}

export type WorkflowEvent<TProgress, TOutput, TResult> =
  | { type: "progress"; data: TProgress }
  | { type: "output"; data: TOutput }
  | { type: "completed"; data: TResult }
  | { type: "failed"; error: AppError }

export type WorkflowCallOptions<TProgress, TOutput> = {
  onProgress?: (event: TProgress) => void
  onOutput?: (event: TOutput) => void
  signal?: AbortSignal
}

export type VerifyLmsDraftInput = ConnectionBase & {
  provider: LmsProviderKind
}

export type ListLmsCoursesDraftInput = ConnectionBase & {
  provider: LmsProviderKind
}

export type VerifyGitDraftInput = ConnectionBase & {
  provider: GitProviderKind
}

export type VerifyLlmDraftInput = {
  provider: LlmProvider
  authMode: LlmAuthMode
  apiKey: string
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
}

export type AnalysisRepositoryInput = {
  course: PersistedCourse
} & (
  | { repositoryRelativePath: string; repositoryAbsolutePath?: undefined }
  | { repositoryAbsolutePath: string; repositoryRelativePath?: undefined }
)

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

export type AnalysisRunInput = AnalysisRepositoryInput & {
  config: AnalysisConfig
  rosterContext?: AnalysisRosterContext
  asOfCommit?: string
}

export type AnalysisBlameInput = AnalysisRepositoryInput & {
  config: AnalysisBlameConfig
  personDbBaseline: PersonDbSnapshot
  personDbOverlay?: PersonDbSnapshot
  files: string[]
  asOfCommit: string
}

export type ExaminationCodeExcerpt = {
  filePath: string
  startLine: number
  lines: string[]
}

export type ExaminationLlmSettings = {
  llmConnections: PersistedLlmConnection[]
  activeLlmConnectionId: string | null
  examinationModelsByProvider: ExaminationModelsByProvider
}

export type ExaminationGenerateQuestionsInput = {
  groupSetId: string
  /**
   * Stable identity of the author the excerpts belong to, derived from
   * blame canonicalization. Always present — examinations key on this so
   * generation works without a roster.
   */
  personId: string
  /**
   * Roster member the author resolves to, when a roster match exists.
   * Null when there is no roster, the roster is empty, or the author
   * could not be matched. Carried through to the archived provenance so
   * graders can tell, on re-open, whether the entry was produced under a
   * matched roster identity.
   */
  memberId: string | null
  commitOid: string
  repoGitDir: string
  memberName: string
  memberEmail: string
  excerpts: ExaminationCodeExcerpt[]
  questionCount: number
  assignmentContext?: string
  /**
   * Subset of app settings the examination workflow needs to resolve which
   * LLM connection and model code to use. The renderer reads these from
   * `useAppSettingsStore` and forwards them so the workflow stays a pure
   * function of its input.
   */
  llmSettings: ExaminationLlmSettings
  /**
   * When true, skip the archive read and always call the LLM. The fresh
   * result overwrites any matching archived entry on success. Errors never
   * populate the archive. Graders trigger this via a "Regenerate" action.
   */
  regenerate?: boolean
}

export type ExaminationLineRange = {
  start: number
  end: number
}

export type ExaminationQuestion = {
  question: string
  answer: string
  filePath: string | null
  lineRange: ExaminationLineRange | null
}

export type ExaminationUsage = LlmUsage

export type ExaminationProvenanceFieldDrift<T> = {
  from: T
  to: T
} | null

export type ExaminationProvenanceDrift = {
  memberNameChanged: ExaminationProvenanceFieldDrift<string>
  memberEmailChanged: ExaminationProvenanceFieldDrift<string>
  repoGitDirChanged: ExaminationProvenanceFieldDrift<string>
  assignmentContextChanged: ExaminationProvenanceFieldDrift<string>
  modelChanged: ExaminationProvenanceFieldDrift<string>
  effortChanged: ExaminationProvenanceFieldDrift<string>
}

export type ExaminationArchivedProvenance = {
  memberName: string
  memberEmail: string
  /**
   * Roster member id at the time the questions were generated, or null
   * when the author was not matched to a roster member (or no roster
   * existed). Informational only — the archive is keyed on personId.
   */
  memberId: string | null
  repoGitDir: string
  assignmentContext: string | null
  /**
   * Catalog short code that produced the run (e.g. `"22"`, `"c33"`). The
   * code expands into a full `LlmModelSpec` via the catalog; storing the
   * code keeps the archive readable after spec metadata changes.
   */
  model: string
  /**
   * Effort tier that produced the run, retained for legacy display. Drops
   * out of `model` because the code already encodes effort.
   */
  effort: LlmEffort
  questionCount: number
  usage: ExaminationUsage
  createdAtMs: number
  excerpts: ExaminationCodeExcerpt[]
}

export type ExaminationGenerateQuestionsResult = {
  questions: ExaminationQuestion[]
  usage: ExaminationUsage
  fromArchive: boolean
  archivedProvenance: ExaminationArchivedProvenance
  provenanceDrift: ExaminationProvenanceDrift | null
}

export type { ExaminationArchiveKey }

export type ExaminationArchiveRecord = {
  key: ExaminationArchiveKey
  questions: ExaminationQuestion[]
  provenance: ExaminationArchivedProvenance
}

export const EXAMINATION_ARCHIVE_BUNDLE_FORMAT =
  "repo-edu-examination-archive" as const
export const EXAMINATION_ARCHIVE_BUNDLE_VERSION = 1 as const

export type ExaminationArchiveBundle = {
  format: typeof EXAMINATION_ARCHIVE_BUNDLE_FORMAT
  bundleVersion: typeof EXAMINATION_ARCHIVE_BUNDLE_VERSION
  exportedAt: string
  records: ExaminationArchiveRecord[]
}

export type ExaminationArchiveExportResult = {
  file: UserSaveTargetRef
  recordCount: number
}

export type ExaminationArchiveImportSummary =
  HostExaminationArchiveImportSummary

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
    result: PersistedCourse
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
    result: PersistedAppSettings
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
  "examination.generateQuestions": {
    input: ExaminationGenerateQuestionsInput
    progress: MilestoneProgress
    output: DiagnosticOutput
    result: ExaminationGenerateQuestionsResult
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

type WorkflowMetadata = WorkflowExecutionProfile & {
  delivery: readonly DeliverySurface[]
}

export const workflowCatalog: Record<WorkflowId, WorkflowMetadata> = {
  "course.list": {
    delivery: ["desktop", "docs", "cli"],
    progress: "none",
    cancellation: "non-cancellable",
  },
  "course.load": {
    delivery: ["desktop", "docs", "cli"],
    progress: "milestone",
    cancellation: "cooperative",
  },
  "course.save": {
    delivery: ["desktop", "docs", "cli"],
    progress: "milestone",
    cancellation: "cooperative",
  },
  "course.delete": {
    delivery: ["desktop", "docs"],
    progress: "none",
    cancellation: "non-cancellable",
  },
  "settings.loadApp": {
    delivery: ["desktop", "docs", "cli"],
    progress: "none",
    cancellation: "non-cancellable",
  },
  "settings.saveApp": {
    delivery: ["desktop", "docs", "cli"],
    progress: "milestone",
    cancellation: "cooperative",
  },
  "connection.verifyLmsDraft": {
    delivery: ["desktop", "docs", "cli"],
    progress: "milestone",
    cancellation: "best-effort",
  },
  "connection.listLmsCoursesDraft": {
    delivery: ["desktop", "docs"],
    progress: "milestone",
    cancellation: "best-effort",
  },
  "connection.verifyGitDraft": {
    delivery: ["desktop", "docs", "cli"],
    progress: "milestone",
    cancellation: "best-effort",
  },
  "connection.verifyLlmDraft": {
    delivery: ["desktop", "docs"],
    progress: "milestone",
    cancellation: "best-effort",
  },
  "roster.importFromFile": {
    delivery: ["desktop", "docs"],
    progress: "milestone",
    cancellation: "cooperative",
  },
  "roster.importFromLms": {
    delivery: ["desktop", "docs"],
    progress: "milestone",
    cancellation: "best-effort",
  },
  "roster.exportMembers": {
    delivery: ["desktop", "docs"],
    progress: "milestone",
    cancellation: "cooperative",
  },
  "groupSet.fetchAvailableFromLms": {
    delivery: ["desktop", "docs"],
    progress: "milestone",
    cancellation: "best-effort",
  },
  "groupSet.connectFromLms": {
    delivery: ["desktop", "docs"],
    progress: "milestone",
    cancellation: "best-effort",
  },
  "groupSet.syncFromLms": {
    delivery: ["desktop", "docs"],
    progress: "milestone",
    cancellation: "best-effort",
  },
  "groupSet.previewImportFromFile": {
    delivery: ["desktop", "docs"],
    progress: "milestone",
    cancellation: "cooperative",
  },
  "groupSet.importFromFile": {
    delivery: ["desktop", "docs"],
    progress: "milestone",
    cancellation: "cooperative",
  },
  "groupSet.export": {
    delivery: ["desktop", "docs"],
    progress: "milestone",
    cancellation: "cooperative",
  },
  "gitUsernames.import": {
    delivery: ["desktop", "docs"],
    progress: "milestone",
    cancellation: "cooperative",
  },
  "validation.roster": {
    delivery: ["desktop", "docs", "cli"],
    progress: "none",
    cancellation: "non-cancellable",
  },
  "validation.assignment": {
    delivery: ["desktop", "docs", "cli"],
    progress: "none",
    cancellation: "non-cancellable",
  },
  "repo.create": {
    delivery: ["desktop", "docs", "cli"],
    progress: "milestone",
    cancellation: "best-effort",
  },
  "repo.clone": {
    delivery: ["desktop", "docs", "cli"],
    progress: "milestone",
    cancellation: "best-effort",
  },
  "repo.update": {
    delivery: ["desktop", "docs", "cli"],
    progress: "milestone",
    cancellation: "best-effort",
  },
  "repo.listNamespace": {
    delivery: ["desktop", "docs", "cli"],
    progress: "milestone",
    cancellation: "best-effort",
  },
  "repo.bulkClone": {
    delivery: ["desktop", "docs", "cli"],
    progress: "milestone",
    cancellation: "best-effort",
  },
  "userFile.inspectSelection": {
    delivery: ["desktop", "docs"],
    progress: "milestone",
    cancellation: "cooperative",
  },
  "userFile.exportPreview": {
    delivery: ["desktop", "docs"],
    progress: "milestone",
    cancellation: "cooperative",
  },
  "analysis.run": {
    delivery: ["desktop", "docs"],
    progress: "granular",
    cancellation: "cooperative",
  },
  "analysis.blame": {
    delivery: ["desktop", "docs"],
    progress: "granular",
    cancellation: "cooperative",
  },
  "analysis.discoverRepos": {
    delivery: ["desktop", "docs"],
    progress: "granular",
    cancellation: "best-effort",
  },
  "examination.generateQuestions": {
    delivery: ["desktop", "docs"],
    progress: "milestone",
    cancellation: "cooperative",
  },
  "examination.archive.export": {
    delivery: ["desktop", "docs"],
    progress: "milestone",
    cancellation: "cooperative",
  },
  "examination.archive.import": {
    delivery: ["desktop", "docs"],
    progress: "milestone",
    cancellation: "cooperative",
  },
}

export type WorkflowInput<TWorkflowId extends WorkflowId> =
  WorkflowPayloads[TWorkflowId]["input"]

export type WorkflowProgress<TWorkflowId extends WorkflowId> =
  WorkflowPayloads[TWorkflowId]["progress"]

export type WorkflowOutput<TWorkflowId extends WorkflowId> =
  WorkflowPayloads[TWorkflowId]["output"]

export type WorkflowResult<TWorkflowId extends WorkflowId> =
  WorkflowPayloads[TWorkflowId]["result"]

export type WorkflowEventFor<TWorkflowId extends WorkflowId> = WorkflowEvent<
  WorkflowProgress<TWorkflowId>,
  WorkflowOutput<TWorkflowId>,
  WorkflowResult<TWorkflowId>
>

export type WorkflowHandler<TWorkflowId extends WorkflowId> = (
  input: WorkflowInput<TWorkflowId>,
  options?: WorkflowCallOptions<
    WorkflowProgress<TWorkflowId>,
    WorkflowOutput<TWorkflowId>
  >,
) => Promise<WorkflowResult<TWorkflowId>>

export type WorkflowHandlerMap<TWorkflowId extends WorkflowId = WorkflowId> = {
  [TId in TWorkflowId]: WorkflowHandler<TId>
}

export type WorkflowClient<TWorkflowId extends WorkflowId = WorkflowId> = {
  run<TId extends TWorkflowId>(
    workflowId: TId,
    input: WorkflowInput<TId>,
    options?: WorkflowCallOptions<WorkflowProgress<TId>, WorkflowOutput<TId>>,
  ): Promise<WorkflowResult<TId>>
}

export function createWorkflowClient<TWorkflowId extends WorkflowId>(
  handlers: WorkflowHandlerMap<TWorkflowId>,
): WorkflowClient<TWorkflowId> {
  return {
    run<TId extends TWorkflowId>(
      workflowId: TId,
      input: WorkflowInput<TId>,
      options?: WorkflowCallOptions<WorkflowProgress<TId>, WorkflowOutput<TId>>,
    ): Promise<WorkflowResult<TId>> {
      const handler = handlers[workflowId] as WorkflowHandler<TId>

      return handler(input, options)
    },
  }
}

import type {
  FileFormat,
  GitProviderKind,
  GroupSet,
  LmsProviderKind,
  PersistedAppSettings,
  PersistedProfile,
  ProfileSummary,
  RepositoryTemplate,
  Roster,
  ValidationIssue,
} from "@repo-edu/domain"

export const packageId = "@repo-edu/application-contract"

export type DeliverySurface = "desktop" | "docs" | "cli"
export type WorkflowProgressGranularity = "none" | "milestone" | "granular"
export type WorkflowCancellationGuarantee =
  | "non-cancellable"
  | "best-effort"
  | "cooperative"

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

export type UserFileRef = {
  kind: "user-file-ref"
  referenceId: string
  displayName: string
  mediaType: string | null
  byteLength: number | null
}

export type UserSaveTargetRef = {
  kind: "user-save-target-ref"
  referenceId: string
  displayName: string
  suggestedFormat: FileFormat | null
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
      issues: ValidationIssue[]
    }
  | {
      type: "not-found"
      message: string
      resource:
        | "profile"
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
      resource: "profile" | "connection" | "group-set" | "assignment" | "repository" | "file"
      reason: string
    }
  | {
      type: "provider"
      message: string
      provider: LmsProviderKind | GitProviderKind | "git"
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
    "Only packages/application may normalize settings, profile, and user-file boundary failures into persistence errors.",
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

export function isAppError(value: unknown): value is AppError {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof value.type === "string"
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

export type VerifyLmsDraftInput = {
  provider: LmsProviderKind
  baseUrl: string
  token: string
}

export type VerifyGitDraftInput = {
  provider: GitProviderKind
  baseUrl: string | null
  token: string
  organization: string | null
}

export type ConnectionVerificationResult = {
  verified: boolean
  checkedAt: string
}

export type RosterImportFromFileInput = {
  file: UserFileRef
}

export type RosterExportStudentsInput = {
  profileId: string
  target: UserSaveTargetRef
  format: Extract<FileFormat, "csv" | "xlsx">
}

export type RosterImportFromLmsInput = {
  profileId: string
  courseId: string
}

export type GroupSetSyncFromLmsInput = {
  profileId: string
  groupSetId: string
}

export type GroupSetExportInput = {
  profileId: string
  groupSetId: string
  target: UserSaveTargetRef
  format: Extract<FileFormat, "csv" | "xlsx" | "yaml">
}

export type GitUsernameImportInput = {
  file: UserFileRef
}

export type AssignmentValidationInput = {
  profileId: string
  assignmentId: string
}

export type RepositoryBatchInput = {
  profileId: string
  assignmentId: string | null
  template: RepositoryTemplate | null
}

export type RepositoryBatchResult = {
  repositoriesPlanned: number
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

export type SpikeWorkflowProgress = MilestoneProgress
export type SpikeWorkflowOutput = {
  line: string
}
export type SpikeWorkflowResult = {
  workflowId: "spike.e2e-trpc"
  message: string
  packageLine: string
  executedAt: string
}

export type SpikeCorsWorkflowProgress = MilestoneProgress
export type SpikeCorsWorkflowOutput = {
  line: string
}
export type SpikeCorsWorkflowResult = {
  workflowId: "spike.cors-http"
  executedIn: "node"
  httpStatus: number
  bodySnippet: string
  executedAt: string
}

export type WorkflowPayloads = {
  "profile.list": {
    input: undefined
    progress: never
    output: never
    result: ProfileSummary[]
  }
  "profile.load": {
    input: { profileId: string }
    progress: MilestoneProgress
    output: DiagnosticOutput
    result: PersistedProfile
  }
  "profile.save": {
    input: PersistedProfile
    progress: MilestoneProgress
    output: DiagnosticOutput
    result: PersistedProfile
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
  "connection.verifyGitDraft": {
    input: VerifyGitDraftInput
    progress: MilestoneProgress
    output: DiagnosticOutput
    result: ConnectionVerificationResult
  }
  "roster.importFromFile": {
    input: RosterImportFromFileInput
    progress: MilestoneProgress
    output: DiagnosticOutput
    result: Roster
  }
  "roster.importFromLms": {
    input: RosterImportFromLmsInput
    progress: MilestoneProgress
    output: DiagnosticOutput
    result: Roster
  }
  "roster.exportStudents": {
    input: RosterExportStudentsInput
    progress: MilestoneProgress
    output: DiagnosticOutput
    result: { file: UserSaveTargetRef }
  }
  "groupSet.syncFromLms": {
    input: GroupSetSyncFromLmsInput
    progress: MilestoneProgress
    output: DiagnosticOutput
    result: GroupSet
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
  "validation.assignment": {
    input: AssignmentValidationInput
    progress: never
    output: never
    result: { issues: ValidationIssue[] }
  }
  "repo.create": {
    input: RepositoryBatchInput
    progress: MilestoneProgress
    output: DiagnosticOutput
    result: RepositoryBatchResult
  }
  "repo.clone": {
    input: RepositoryBatchInput
    progress: MilestoneProgress
    output: DiagnosticOutput
    result: RepositoryBatchResult
  }
  "repo.delete": {
    input: RepositoryBatchInput
    progress: MilestoneProgress
    output: DiagnosticOutput
    result: RepositoryBatchResult
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
  "spike.e2e-trpc": {
    input: undefined
    progress: SpikeWorkflowProgress
    output: SpikeWorkflowOutput
    result: SpikeWorkflowResult
  }
  "spike.cors-http": {
    input: undefined
    progress: SpikeCorsWorkflowProgress
    output: SpikeCorsWorkflowOutput
    result: SpikeCorsWorkflowResult
  }
}

export type WorkflowId = keyof WorkflowPayloads

type WorkflowMetadata = WorkflowExecutionProfile & {
  delivery: readonly DeliverySurface[]
}

export const workflowCatalog: Record<WorkflowId, WorkflowMetadata> = {
  "profile.list": {
    delivery: ["desktop", "docs", "cli"],
    progress: "none",
    cancellation: "non-cancellable",
  },
  "profile.load": {
    delivery: ["desktop", "docs", "cli"],
    progress: "milestone",
    cancellation: "cooperative",
  },
  "profile.save": {
    delivery: ["desktop", "docs", "cli"],
    progress: "milestone",
    cancellation: "cooperative",
  },
  "settings.loadApp": {
    delivery: ["desktop", "docs"],
    progress: "none",
    cancellation: "non-cancellable",
  },
  "settings.saveApp": {
    delivery: ["desktop", "docs"],
    progress: "milestone",
    cancellation: "cooperative",
  },
  "connection.verifyLmsDraft": {
    delivery: ["desktop", "docs"],
    progress: "milestone",
    cancellation: "best-effort",
  },
  "connection.verifyGitDraft": {
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
    delivery: ["desktop", "docs", "cli"],
    progress: "milestone",
    cancellation: "best-effort",
  },
  "roster.exportStudents": {
    delivery: ["desktop", "docs"],
    progress: "milestone",
    cancellation: "cooperative",
  },
  "groupSet.syncFromLms": {
    delivery: ["desktop", "docs", "cli"],
    progress: "milestone",
    cancellation: "best-effort",
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
  "repo.delete": {
    delivery: ["desktop", "docs", "cli"],
    progress: "milestone",
    cancellation: "best-effort",
  },
  "userFile.inspectSelection": {
    delivery: ["desktop", "docs", "cli"],
    progress: "milestone",
    cancellation: "cooperative",
  },
  "userFile.exportPreview": {
    delivery: ["desktop", "docs", "cli"],
    progress: "milestone",
    cancellation: "cooperative",
  },
  "spike.e2e-trpc": {
    delivery: ["desktop"],
    progress: "milestone",
    cancellation: "cooperative",
  },
  "spike.cors-http": {
    delivery: ["desktop"],
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

export type SpikeWorkflowEvent = WorkflowEventFor<"spike.e2e-trpc">
export type SpikeCorsWorkflowEvent = WorkflowEventFor<"spike.cors-http">

import type {
  AppError,
  AppValidationIssue,
  DiagnosticOutput,
  SpikeCorsWorkflowOutput,
  SpikeCorsWorkflowProgress,
  SpikeCorsWorkflowResult,
  SpikeWorkflowOutput,
  SpikeWorkflowProgress,
  SpikeWorkflowResult,
  UserFileExportPreviewResult,
  UserFileInspectResult,
  UserFileRef,
  UserSaveTargetRef,
  WorkflowCallOptions,
  WorkflowHandlerMap,
} from "@repo-edu/application-contract"
import type {
  GitIdentityMode,
  PersistedAppSettings,
  PersistedProfile,
  RosterValidationResult,
} from "@repo-edu/domain"
import type {
  FileSystemPort,
  GitCommandPort,
  HttpPort,
  UserFilePort,
} from "@repo-edu/host-runtime-contract"
import type { GitProviderClient } from "@repo-edu/integrations-git-contract"
import type { LmsClient } from "@repo-edu/integrations-lms-contract"
export declare const packageId = "@repo-edu/application"
export declare const workspaceDependencies: readonly [
  "@repo-edu/application-contract",
  "@repo-edu/domain",
  "@repo-edu/host-runtime-contract",
  "@repo-edu/integrations-git-contract",
  "@repo-edu/integrations-lms-contract",
]
export type SmokeWorkflowResult = {
  workflowId: "phase-1.docs.smoke"
  message: string
  packageLine: string
  executedAt: string
}
export type ProfileStore = {
  listProfiles(
    signal?: AbortSignal,
  ): Promise<PersistedProfile[]> | PersistedProfile[]
  loadProfile(
    profileId: string,
    signal?: AbortSignal,
  ): Promise<PersistedProfile | null> | PersistedProfile | null
  saveProfile(
    profile: PersistedProfile,
    signal?: AbortSignal,
  ): Promise<PersistedProfile> | PersistedProfile
  deleteProfile(profileId: string, signal?: AbortSignal): Promise<void> | void
}
export type AppSettingsStore = {
  loadSettings(
    signal?: AbortSignal,
  ): Promise<PersistedAppSettings | null> | PersistedAppSettings | null
  saveSettings(
    settings: PersistedAppSettings,
    signal?: AbortSignal,
  ): Promise<PersistedAppSettings> | PersistedAppSettings
}
export declare function runSmokeWorkflow(
  source: string,
): Promise<SmokeWorkflowResult>
export declare function createValidationAppError(
  message: string,
  issues: AppValidationIssue[],
): AppError
export declare function runValidateRosterForProfile(
  profile: PersistedProfile,
): RosterValidationResult
export declare function runValidateAssignmentForProfile(
  profile: PersistedProfile,
  assignmentId: string,
  options?: {
    identityMode?: GitIdentityMode
    repoNameTemplate?: string
  },
): RosterValidationResult
export declare function createInMemoryProfileStore(
  profiles: readonly PersistedProfile[],
): ProfileStore
export declare function createInMemoryAppSettingsStore(
  settings?: PersistedAppSettings | null,
): AppSettingsStore
export declare function createProfileWorkflowHandlers(
  profileStore: ProfileStore,
): Pick<
  WorkflowHandlerMap<
    "profile.list" | "profile.load" | "profile.save" | "profile.delete"
  >,
  "profile.list" | "profile.load" | "profile.save" | "profile.delete"
>
export declare function createValidationWorkflowHandlers(
  profileStore: ProfileStore,
): Pick<
  WorkflowHandlerMap<"validation.roster" | "validation.assignment">,
  "validation.roster" | "validation.assignment"
>
export declare function createSettingsWorkflowHandlers(
  appSettingsStore: AppSettingsStore,
): Pick<
  WorkflowHandlerMap<"settings.loadApp" | "settings.saveApp">,
  "settings.loadApp" | "settings.saveApp"
>
export type ConnectionVerificationPorts = {
  lms: Pick<LmsClient, "verifyConnection" | "listCourses">
  git: Pick<GitProviderClient, "verifyConnection">
}
export declare function createConnectionWorkflowHandlers(
  ports: ConnectionVerificationPorts,
): Pick<
  WorkflowHandlerMap<
    | "connection.verifyLmsDraft"
    | "connection.listLmsCoursesDraft"
    | "connection.verifyGitDraft"
  >,
  | "connection.verifyLmsDraft"
  | "connection.listLmsCoursesDraft"
  | "connection.verifyGitDraft"
>
export type RosterWorkflowPorts = {
  lms: Pick<LmsClient, "fetchRoster">
  userFile: UserFilePort
}
export declare function createRosterWorkflowHandlers(
  profileStore: ProfileStore,
  appSettingsStore: AppSettingsStore,
  ports: RosterWorkflowPorts,
): Pick<
  WorkflowHandlerMap<
    "roster.importFromFile" | "roster.importFromLms" | "roster.exportStudents"
  >,
  "roster.importFromFile" | "roster.importFromLms" | "roster.exportStudents"
>
export type GroupSetWorkflowPorts = {
  lms: Pick<LmsClient, "listGroupSets" | "fetchGroupSet">
  userFile: UserFilePort
}
export declare function createGroupSetWorkflowHandlers(
  profileStore: ProfileStore,
  appSettingsStore: AppSettingsStore,
  ports: GroupSetWorkflowPorts,
): Pick<
  WorkflowHandlerMap<
    | "groupSet.fetchAvailableFromLms"
    | "groupSet.syncFromLms"
    | "groupSet.previewImportFromFile"
    | "groupSet.previewReimportFromFile"
    | "groupSet.export"
  >,
  | "groupSet.fetchAvailableFromLms"
  | "groupSet.syncFromLms"
  | "groupSet.previewImportFromFile"
  | "groupSet.previewReimportFromFile"
  | "groupSet.export"
>
export type GitUsernameWorkflowPorts = {
  userFile: UserFilePort
  git: Pick<GitProviderClient, "verifyGitUsernames">
}
export declare function createGitUsernameWorkflowHandlers(
  profileStore: ProfileStore,
  appSettingsStore: AppSettingsStore,
  ports: GitUsernameWorkflowPorts,
): Pick<WorkflowHandlerMap<"gitUsernames.import">, "gitUsernames.import">
export type RepositoryWorkflowPorts = {
  git: Pick<
    GitProviderClient,
    "createRepositories" | "resolveRepositoryCloneUrls" | "deleteRepositories"
  >
  gitCommand: GitCommandPort
  fileSystem: FileSystemPort
}
export declare function createRepositoryWorkflowHandlers(
  profileStore: ProfileStore,
  appSettingsStore: AppSettingsStore,
  ports: RepositoryWorkflowPorts,
): Pick<
  WorkflowHandlerMap<"repo.create" | "repo.clone" | "repo.delete">,
  "repo.create" | "repo.clone" | "repo.delete"
>
export declare function runInspectUserFileWorkflow(
  userFilePort: UserFilePort,
  file: UserFileRef,
  options?: WorkflowCallOptions<SpikeWorkflowProgress, DiagnosticOutput>,
): Promise<UserFileInspectResult>
export declare function runUserFileExportPreviewWorkflow(
  userFilePort: UserFilePort,
  target: UserSaveTargetRef,
  options?: WorkflowCallOptions<SpikeWorkflowProgress, DiagnosticOutput>,
): Promise<UserFileExportPreviewResult>
export declare function runSpikeWorkflow(
  options?: WorkflowCallOptions<SpikeWorkflowProgress, SpikeWorkflowOutput>,
): Promise<SpikeWorkflowResult>
export type SpikeCorsWorkflowPorts = {
  http: HttpPort
}
export declare function runSpikeCorsWorkflow(
  ports: SpikeCorsWorkflowPorts,
  options?: WorkflowCallOptions<
    SpikeCorsWorkflowProgress,
    SpikeCorsWorkflowOutput
  >,
): Promise<SpikeCorsWorkflowResult>
//# sourceMappingURL=index.d.ts.map

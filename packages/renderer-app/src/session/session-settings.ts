import type { WorkflowClient } from "@repo-edu/application-contract"
import {
  normalizeAnalysisFolderPath,
  normalizeSubmissionFolderPath,
  type PersistedActiveSurface,
  type SubmissionFolderRecent,
  submissionSurfaceStateKey,
} from "@repo-edu/domain/active-surface"
import type {
  LlmProviderKind,
  PersistedGitConnection,
  PersistedLlmConnection,
  PersistedLmsConnection,
} from "@repo-edu/domain/connection"
import {
  type DateFormatPreference,
  defaultAppCredentials,
  defaultAppPreferences,
  type ExaminationModelsByProvider,
  normalizeRecentAnalysisFolders,
  normalizeRecentSubmissionFolders,
  type PersistedAnalysisConcurrency,
  type PersistedAnalysisSidebarSettings,
  type PersistedAppCredentials,
  type PersistedAppPreferences,
  pruneSubmissionStateForRecents,
  type SubmissionSurfaceState,
  type SyntaxThemeId,
  type ThemePreference,
  type TimeFormatPreference,
} from "@repo-edu/domain/settings"
import type {
  AnalysisInputs,
  CourseBacking,
  CourseSummary,
} from "@repo-edu/domain/types"
import {
  idleSyncStatus,
  type PersistenceSyncStatus,
  type Persister,
  settlePersistenceOperations,
} from "../persistence/create-persister.js"
import {
  createCredentialsPersisterWorker,
  createPreferencesPersisterWorker,
} from "../persistence/settings-persister.js"

export type PreferenceEvent =
  | {
      type: "set-navigation"
      surface: PersistedActiveSurface
      tab: PersistedAppPreferences["activeTab"]
    }
  | { type: "set-active-tab"; tab: PersistedAppPreferences["activeTab"] }
  | { type: "set-last-used-course-backing"; backing: CourseBacking }
  | { type: "set-folder-analysis-inputs"; patch: Partial<AnalysisInputs> }
  | { type: "push-recent-folder"; path: string }
  | { type: "remove-recent-folder"; path: string }
  | { type: "clear-recent-folders" }
  | { type: "push-recent-submission"; recent: SubmissionFolderRecent }
  | { type: "remove-recent-submission"; recent: SubmissionFolderRecent }
  | {
      type: "set-submission-state"
      recent: SubmissionFolderRecent
      state: SubmissionSurfaceState
    }
  | { type: "clear-submission-state"; recent: SubmissionFolderRecent }
  | {
      type: "prune-submissions-for-courses"
      courses: readonly Pick<CourseSummary, "id" | "backing">[]
    }
  | { type: "set-theme"; theme: ThemePreference }
  | { type: "set-date-format"; dateFormat: DateFormatPreference }
  | { type: "set-time-format"; timeFormat: TimeFormatPreference }
  | { type: "set-syntax-theme"; syntaxTheme: SyntaxThemeId }
  | { type: "set-default-extensions"; extensions: string[] }
  | { type: "set-examination-model"; provider: LlmProviderKind; code: string }
  | {
      type: "set-roster-column-visibility"
      visibility: Record<string, boolean>
    }
  | { type: "set-roster-column-sizing"; sizing: Record<string, number> }
  | { type: "set-groups-sidebar-size"; size: number }
  | { type: "set-analysis-sidebar-size"; size: number }
  | { type: "set-analysis-detail-list-size"; size: number }
  | { type: "set-examination-submission-sidebar-size"; size: number }
  | {
      type: "set-analysis-sidebar"
      sidebar: PersistedAnalysisSidebarSettings | null
    }
  | {
      type: "set-analysis-concurrency"
      concurrency: PersistedAnalysisConcurrency
    }

export type CredentialEvent =
  | { type: "set-active-git-connection"; id: string | null }
  | { type: "add-lms-connection"; connection: PersistedLmsConnection }
  | {
      type: "update-lms-connection"
      id: string
      connection: PersistedLmsConnection
    }
  | { type: "remove-lms-connection"; id: string }
  | { type: "add-git-connection"; connection: PersistedGitConnection }
  | {
      type: "update-git-connection"
      id: string
      connection: PersistedGitConnection
    }
  | { type: "remove-git-connection"; id: string }
  | { type: "set-active-llm-connection"; id: string | null }
  | { type: "add-llm-connection"; connection: PersistedLlmConnection }
  | {
      type: "update-llm-connection"
      id: string
      connection: PersistedLlmConnection
    }
  | { type: "remove-llm-connection"; id: string }

export type RemovedCredential =
  | { kind: "lms"; id: string }
  | { kind: "git"; id: string }
  | { kind: "llm"; id: string }

export function credentialRemovalFromEvent(
  event: CredentialEvent,
): RemovedCredential | null {
  switch (event.type) {
    case "remove-lms-connection":
      return { kind: "lms", id: event.id }
    case "remove-git-connection":
      return { kind: "git", id: event.id }
    case "remove-llm-connection":
      return { kind: "llm", id: event.id }
    default:
      return null
  }
}

export type SessionSettingsState = {
  preferences: PersistedAppPreferences
  credentials: PersistedAppCredentials
  preferencesSyncStatus: PersistenceSyncStatus
  credentialsSyncStatus: PersistenceSyncStatus
  preferencesWorkerId: number | null
  credentialsWorkerId: number | null
}

export type SettingsWorkerScope = "preferences" | "credentials"

export function createInitialSessionSettingsState(): SessionSettingsState {
  return {
    preferences: defaultAppPreferences,
    credentials: defaultAppCredentials,
    preferencesSyncStatus: idleSyncStatus,
    credentialsSyncStatus: idleSyncStatus,
    preferencesWorkerId: null,
    credentialsWorkerId: null,
  }
}

function submissionRecentsEqual(
  left: readonly SubmissionFolderRecent[],
  right: readonly SubmissionFolderRecent[],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (recent, index) =>
        recent.path === right[index]?.path &&
        recent.courseId === right[index]?.courseId,
    )
  )
}

function submissionSurfaceStatesEqual(
  left: Record<string, SubmissionSurfaceState>,
  right: Record<string, SubmissionSurfaceState>,
): boolean {
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  if (leftKeys.length !== rightKeys.length) return false
  return leftKeys.every((key) => {
    const leftFiles = left[key]?.includedFiles
    const rightFiles = right[key]?.includedFiles
    if (leftFiles === undefined || rightFiles === undefined) return false
    if (leftFiles === null || rightFiles === null)
      return leftFiles === rightFiles
    return (
      leftFiles.length === rightFiles.length &&
      leftFiles.every((value, index) => value === rightFiles[index])
    )
  })
}

export function reducePreferences(
  preferences: PersistedAppPreferences,
  event: PreferenceEvent,
): PersistedAppPreferences {
  switch (event.type) {
    case "set-navigation":
      return {
        ...preferences,
        activeSurface: event.surface,
        activeTab: event.tab,
      }
    case "set-active-tab":
      return preferences.activeTab === event.tab
        ? preferences
        : { ...preferences, activeTab: event.tab }
    case "set-last-used-course-backing":
      return { ...preferences, lastUsedCourseBacking: event.backing }
    case "set-folder-analysis-inputs": {
      const next = { ...preferences.folderViewAnalysisInputs }
      for (const [key, value] of Object.entries(event.patch) as [
        keyof AnalysisInputs,
        unknown,
      ][]) {
        if (value === undefined) delete next[key]
        else {
          // biome-ignore lint/suspicious/noExplicitAny: keyed AnalysisInputs merge
          ;(next as any)[key] = value
        }
      }
      return { ...preferences, folderViewAnalysisInputs: next }
    }
    case "push-recent-folder":
      return {
        ...preferences,
        recentAnalysisFolders: normalizeRecentAnalysisFolders([
          event.path,
          ...preferences.recentAnalysisFolders,
        ]),
      }
    case "remove-recent-folder": {
      const normalized = normalizeAnalysisFolderPath(event.path)
      return normalized === null
        ? preferences
        : {
            ...preferences,
            recentAnalysisFolders: preferences.recentAnalysisFolders.filter(
              (candidate) => candidate !== normalized,
            ),
          }
    }
    case "clear-recent-folders":
      return preferences.recentAnalysisFolders.length === 0
        ? preferences
        : { ...preferences, recentAnalysisFolders: [] }
    case "push-recent-submission": {
      const path = normalizeSubmissionFolderPath(event.recent.path)
      if (path === null) return preferences
      const recent =
        event.recent.courseId === undefined
          ? { path }
          : { path, courseId: event.recent.courseId }
      return {
        ...preferences,
        ...pruneSubmissionStateForRecents({
          recentSubmissionFolders: normalizeRecentSubmissionFolders([
            recent,
            ...preferences.recentSubmissionFolders,
          ]),
          submissionSurfaceStates: preferences.submissionSurfaceStates,
        }),
      }
    }
    case "remove-recent-submission": {
      const key = submissionSurfaceStateKey(event.recent)
      if (key === null) return preferences
      return {
        ...preferences,
        ...pruneSubmissionStateForRecents({
          recentSubmissionFolders: preferences.recentSubmissionFolders.filter(
            (candidate) => submissionSurfaceStateKey(candidate) !== key,
          ),
          submissionSurfaceStates: preferences.submissionSurfaceStates,
        }),
      }
    }
    case "set-submission-state": {
      const key = submissionSurfaceStateKey(event.recent)
      if (key === null) return preferences
      return {
        ...preferences,
        ...pruneSubmissionStateForRecents({
          recentSubmissionFolders: preferences.recentSubmissionFolders,
          submissionSurfaceStates: {
            ...preferences.submissionSurfaceStates,
            [key]: event.state,
          },
        }),
      }
    }
    case "clear-submission-state": {
      const key = submissionSurfaceStateKey(event.recent)
      if (
        key === null ||
        preferences.submissionSurfaceStates[key] === undefined
      )
        return preferences
      const submissionSurfaceStates = { ...preferences.submissionSurfaceStates }
      delete submissionSurfaceStates[key]
      return { ...preferences, submissionSurfaceStates }
    }
    case "prune-submissions-for-courses": {
      const rosterCapableCourseIds = new Set(
        event.courses
          .filter((course) => course.backing === "lms")
          .map((course) => course.id),
      )
      const recentSubmissionFolders =
        preferences.recentSubmissionFolders.filter(
          (recent) =>
            recent.courseId === undefined ||
            rosterCapableCourseIds.has(recent.courseId),
        )
      const pruned = pruneSubmissionStateForRecents({
        recentSubmissionFolders,
        submissionSurfaceStates: preferences.submissionSurfaceStates,
      })
      return submissionRecentsEqual(
        pruned.recentSubmissionFolders,
        preferences.recentSubmissionFolders,
      ) &&
        submissionSurfaceStatesEqual(
          pruned.submissionSurfaceStates,
          preferences.submissionSurfaceStates,
        )
        ? preferences
        : { ...preferences, ...pruned }
    }
    case "set-theme":
      return {
        ...preferences,
        appearance: { ...preferences.appearance, theme: event.theme },
      }
    case "set-date-format":
      return {
        ...preferences,
        appearance: { ...preferences.appearance, dateFormat: event.dateFormat },
      }
    case "set-time-format":
      return {
        ...preferences,
        appearance: { ...preferences.appearance, timeFormat: event.timeFormat },
      }
    case "set-syntax-theme":
      return {
        ...preferences,
        appearance: {
          ...preferences.appearance,
          syntaxTheme: event.syntaxTheme,
        },
      }
    case "set-default-extensions":
      return {
        ...preferences,
        defaultExtensions: [
          ...new Set(
            event.extensions
              .map((value) => value.trim().toLowerCase().replace(/^\./, ""))
              .filter(Boolean),
          ),
        ],
      }
    case "set-examination-model": {
      const examinationModelsByProvider: ExaminationModelsByProvider = {
        ...preferences.examinationModelsByProvider,
        [event.provider]: event.code,
      }
      return { ...preferences, examinationModelsByProvider }
    }
    case "set-roster-column-visibility":
      return { ...preferences, rosterColumnVisibility: event.visibility }
    case "set-roster-column-sizing":
      return { ...preferences, rosterColumnSizing: event.sizing }
    case "set-groups-sidebar-size":
      return { ...preferences, groupsSidebarSize: event.size }
    case "set-analysis-sidebar-size":
      return { ...preferences, analysisSidebarSize: event.size }
    case "set-analysis-detail-list-size":
      return { ...preferences, analysisDetailListSize: event.size }
    case "set-examination-submission-sidebar-size":
      return { ...preferences, examinationSubmissionSidebarSize: event.size }
    case "set-analysis-sidebar":
      return { ...preferences, analysisSidebar: event.sidebar }
    case "set-analysis-concurrency":
      return { ...preferences, analysisConcurrency: event.concurrency }
  }
}

export function reduceCredentials(
  credentials: PersistedAppCredentials,
  event: CredentialEvent,
): PersistedAppCredentials {
  let next: PersistedAppCredentials
  switch (event.type) {
    case "set-active-git-connection":
      next = { ...credentials, activeGitConnectionId: event.id }
      break
    case "add-lms-connection":
      next = {
        ...credentials,
        lmsConnections: [...credentials.lmsConnections, event.connection],
      }
      break
    case "update-lms-connection":
      next = {
        ...credentials,
        lmsConnections: credentials.lmsConnections.map((value) =>
          value.id === event.id ? event.connection : value,
        ),
      }
      break
    case "remove-lms-connection":
      return {
        ...credentials,
        lmsConnections: credentials.lmsConnections.filter(
          (value) => value.id !== event.id,
        ),
      }
    case "add-git-connection":
      next = {
        ...credentials,
        gitConnections: [...credentials.gitConnections, event.connection],
      }
      break
    case "update-git-connection":
      next = {
        ...credentials,
        gitConnections: credentials.gitConnections.map((value) =>
          value.id === event.id ? event.connection : value,
        ),
      }
      break
    case "remove-git-connection":
      return {
        ...credentials,
        gitConnections: credentials.gitConnections.filter(
          (value) => value.id !== event.id,
        ),
        activeGitConnectionId:
          credentials.activeGitConnectionId === event.id
            ? null
            : credentials.activeGitConnectionId,
      }
    case "set-active-llm-connection":
      next = { ...credentials, activeLlmConnectionId: event.id }
      break
    case "add-llm-connection":
      next = {
        ...credentials,
        llmConnections: [...credentials.llmConnections, event.connection],
      }
      break
    case "update-llm-connection":
      next = {
        ...credentials,
        llmConnections: credentials.llmConnections.map((value) =>
          value.id === event.id ? event.connection : value,
        ),
      }
      break
    case "remove-llm-connection":
      return {
        ...credentials,
        llmConnections: credentials.llmConnections.filter(
          (value) => value.id !== event.id,
        ),
        activeLlmConnectionId:
          credentials.activeLlmConnectionId === event.id
            ? null
            : credentials.activeLlmConnectionId,
      }
  }
  return next
}

type WorkerSlot = { id: number; worker: Persister }

export class SessionSettings {
  private credentialsSlot: WorkerSlot | null = null
  private preferencesSlot: WorkerSlot | null = null
  private nextWorkerId = 0

  constructor(
    private readonly workflowClient: WorkflowClient,
    private readonly getState: () => SessionSettingsState,
    private readonly subscribe: (listener: () => void) => () => void,
    private readonly retireWorkerIds: () => void,
    private readonly installWorkerIds: (ids: {
      credentials: number
      preferences: number
    }) => void,
    private readonly reportStatus: (
      scope: SettingsWorkerScope,
      workerId: number,
      status: PersistenceSyncStatus,
    ) => void,
  ) {}

  replaceWorkers(
    initialBaseline: Pick<SessionSettingsState, "credentials" | "preferences">,
  ): void {
    this.disposeWorkers()
    const credentialsId = ++this.nextWorkerId
    const preferencesId = ++this.nextWorkerId
    this.installWorkerIds({
      credentials: credentialsId,
      preferences: preferencesId,
    })
    const credentialsWorker = createCredentialsPersisterWorker({
      workflowClient: this.workflowClient,
      getSnapshot: () => this.getState().credentials,
      subscribe: this.subscribe,
      initialBaseline: initialBaseline.credentials,
      setSyncStatus: (status) =>
        this.reportStatus("credentials", credentialsId, status),
    })
    const preferencesWorker = createPreferencesPersisterWorker({
      workflowClient: this.workflowClient,
      getSnapshot: () => this.getState().preferences,
      subscribe: this.subscribe,
      initialBaseline: initialBaseline.preferences,
      setSyncStatus: (status) =>
        this.reportStatus("preferences", preferencesId, status),
    })
    this.credentialsSlot = { id: credentialsId, worker: credentialsWorker }
    this.preferencesSlot = { id: preferencesId, worker: preferencesWorker }
  }

  async flush(): Promise<void> {
    await settlePersistenceOperations(
      [
        this.credentialsSlot?.worker.flush(),
        this.preferencesSlot?.worker.flush(),
      ].filter(
        (operation): operation is Promise<void> => operation !== undefined,
      ),
    )
  }

  async waitForIdle(): Promise<void> {
    await Promise.all([
      this.credentialsSlot?.worker.waitForIdle(),
      this.preferencesSlot?.worker.waitForIdle(),
    ])
  }

  disposeWorkers(): void {
    const credentials = this.credentialsSlot
    const preferences = this.preferencesSlot
    this.credentialsSlot = null
    this.preferencesSlot = null
    if (credentials !== null || preferences !== null) this.retireWorkerIds()
    credentials?.worker.dispose()
    preferences?.worker.dispose()
  }
}

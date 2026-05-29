import type { WorkflowClient } from "@repo-edu/application-contract"
import type { PersistedAppSettings } from "@repo-edu/domain/settings"
import type { SessionControllerSnapshot } from "../session/session-reducer.js"
import { getErrorMessage } from "../utils/error-message.js"
import {
  createPersister,
  type PersistenceSyncStatus,
  type Persister,
} from "./create-persister.js"

function isRetryableWorkflowError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "retryable" in error &&
    (error as { retryable?: unknown }).retryable === true
  )
}

export function composePersistedSettings(
  session: Pick<SessionControllerSnapshot, "activeSurface" | "activeTab">,
  appSettings: PersistedAppSettings,
): PersistedAppSettings {
  return {
    ...appSettings,
    activeSurface: session.activeSurface,
    activeTab: session.activeTab,
  }
}

export type SettingsPersisterWorkerOptions = {
  workflowClient: WorkflowClient
  getSnapshot: () => PersistedAppSettings
  subscribe: (listener: () => void) => () => void
  setSyncStatus: (status: PersistenceSyncStatus) => void
}

function persistedSettingsEqual(
  left: PersistedAppSettings,
  right: PersistedAppSettings,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

export function createSettingsPersisterWorker({
  workflowClient,
  getSnapshot,
  subscribe,
  setSyncStatus,
}: SettingsPersisterWorkerOptions): Persister {
  return createPersister<PersistedAppSettings, "settings.saveApp">({
    workflowClient,
    workflowId: "settings.saveApp",
    getSnapshot,
    subscribe,
    setSyncStatus,
    formatTerminalError: (error) =>
      `Could not save app settings: ${getErrorMessage(error)}`,
    classifyError: (error) =>
      isRetryableWorkflowError(error)
        ? { kind: "retry" }
        : { kind: "terminal" },
    snapshotsEqual: persistedSettingsEqual,
  })
}

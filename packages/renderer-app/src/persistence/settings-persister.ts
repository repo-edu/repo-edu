import type { WorkflowClient } from "@repo-edu/application-contract"
import {
  activeSurfaceEquals,
  type PersistedAppCredentials,
  type PersistedAppPreferences,
} from "@repo-edu/domain/settings"
import type { SessionControllerSnapshot } from "../session/session-reducer.js"
import { getErrorMessage } from "../utils/error-message.js"
import {
  createPersister,
  type PersistenceSyncStatus,
  type Persister,
} from "./create-persister.js"
import { isRetryableWorkflowError } from "./retry.js"

export function composePersistedPreferences(
  session: Pick<SessionControllerSnapshot, "activeSurface" | "activeTab">,
  preferences: PersistedAppPreferences,
): PersistedAppPreferences {
  return {
    ...preferences,
    activeSurface: session.activeSurface,
    activeTab: session.activeTab,
  }
}

function persistedPreferencesEqual(
  left: PersistedAppPreferences,
  right: PersistedAppPreferences,
): boolean {
  const leftKeys = Object.keys(left) as (keyof PersistedAppPreferences)[]
  const rightKeys = Object.keys(right)
  if (leftKeys.length !== rightKeys.length) return false

  return leftKeys.every((key) => {
    if (key === "activeSurface") {
      return activeSurfaceEquals(left.activeSurface, right.activeSurface)
    }
    return Object.is(left[key], right[key])
  })
}

function persistedCredentialsEqual(
  left: PersistedAppCredentials,
  right: PersistedAppCredentials,
): boolean {
  const leftKeys = Object.keys(left) as (keyof PersistedAppCredentials)[]
  const rightKeys = Object.keys(right)
  if (leftKeys.length !== rightKeys.length) return false
  return leftKeys.every((key) => Object.is(left[key], right[key]))
}

type SettingsPersisterWorkerOptions<T> = {
  workflowClient: WorkflowClient
  getSnapshot: () => T
  subscribe: (listener: () => void) => () => void
  initialBaseline?: T | null
  setSyncStatus: (status: PersistenceSyncStatus) => void
}

export function createCredentialsPersisterWorker({
  workflowClient,
  getSnapshot,
  subscribe,
  initialBaseline,
  setSyncStatus,
}: SettingsPersisterWorkerOptions<PersistedAppCredentials>): Persister {
  return createPersister<PersistedAppCredentials, "settings.saveCredentials">({
    workflowClient,
    workflowId: "settings.saveCredentials",
    getSnapshot,
    initialBaseline,
    snapshotsEqual: persistedCredentialsEqual,
    subscribe,
    setSyncStatus,
    formatTerminalError: (error) =>
      `Could not save app credentials: ${getErrorMessage(error)}`,
    classifyError: (error) =>
      isRetryableWorkflowError(error)
        ? { kind: "retry" }
        : { kind: "terminal" },
  })
}

export function createPreferencesPersisterWorker({
  workflowClient,
  getSnapshot,
  subscribe,
  initialBaseline,
  setSyncStatus,
}: SettingsPersisterWorkerOptions<PersistedAppPreferences>): Persister {
  return createPersister<PersistedAppPreferences, "settings.savePreferences">({
    workflowClient,
    workflowId: "settings.savePreferences",
    getSnapshot,
    initialBaseline,
    snapshotsEqual: persistedPreferencesEqual,
    subscribe,
    setSyncStatus,
    formatTerminalError: (error) =>
      `Could not save app preferences: ${getErrorMessage(error)}`,
    classifyError: (error) =>
      isRetryableWorkflowError(error)
        ? { kind: "retry" }
        : { kind: "terminal" },
  })
}

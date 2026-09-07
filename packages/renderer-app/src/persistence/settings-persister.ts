import type { WorkflowClient } from "@repo-edu/application-contract"
import { activeSurfaceEquals } from "@repo-edu/domain/active-surface"
import type {
  PersistedAppCredentials,
  PersistedAppPreferences,
} from "@repo-edu/domain/settings"
import { getErrorMessage } from "../utils/error-message.js"
import {
  createPersister,
  type PersistenceSyncStatus,
  type Persister,
  type WorkerStartGate,
} from "./create-persister.js"

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
  startGate: WorkerStartGate
  workflowClient: WorkflowClient<
    "settings.saveCredentials" | "settings.savePreferences"
  >
  getSnapshot: () => T
  subscribe: (listener: () => void) => () => void
  initialBaseline?: T | null
  setSyncStatus: (status: PersistenceSyncStatus) => void
}

export function createCredentialsPersisterWorker({
  startGate,
  workflowClient,
  getSnapshot,
  subscribe,
  initialBaseline,
  setSyncStatus,
}: SettingsPersisterWorkerOptions<PersistedAppCredentials>): Persister<
  PersistedAppCredentials,
  void
> {
  return createPersister<PersistedAppCredentials, "settings.saveCredentials">({
    startGate,
    workflowClient,
    workflowId: "settings.saveCredentials",
    getSnapshot,
    initialBaseline,
    snapshotsEqual: persistedCredentialsEqual,
    subscribe,
    setSyncStatus,
    formatTerminalError: (error) =>
      `Could not save app credentials: ${getErrorMessage(error)}`,
  })
}

export function createPreferencesPersisterWorker({
  startGate,
  workflowClient,
  getSnapshot,
  subscribe,
  initialBaseline,
  setSyncStatus,
}: SettingsPersisterWorkerOptions<PersistedAppPreferences>): Persister<
  PersistedAppPreferences,
  void
> {
  return createPersister<PersistedAppPreferences, "settings.savePreferences">({
    startGate,
    workflowClient,
    workflowId: "settings.savePreferences",
    getSnapshot,
    initialBaseline,
    snapshotsEqual: persistedPreferencesEqual,
    subscribe,
    setSyncStatus,
    formatTerminalError: (error) =>
      `Could not save app preferences: ${getErrorMessage(error)}`,
  })
}

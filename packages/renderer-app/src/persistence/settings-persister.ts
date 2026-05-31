import type { WorkflowClient } from "@repo-edu/application-contract"
import {
  activeSurfaceEquals,
  type PersistedAppSettings,
} from "@repo-edu/domain/settings"
import type { SessionControllerSnapshot } from "../session/session-reducer.js"
import { getErrorMessage } from "../utils/error-message.js"
import {
  createPersister,
  type PersistenceSyncStatus,
  type Persister,
} from "./create-persister.js"
import { isRetryableWorkflowError } from "./retry.js"

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

function persistedSettingsEqual(
  left: PersistedAppSettings,
  right: PersistedAppSettings,
): boolean {
  const leftKeys = Object.keys(left) as (keyof PersistedAppSettings)[]
  const rightKeys = Object.keys(right)
  if (leftKeys.length !== rightKeys.length) return false

  return leftKeys.every((key) => {
    if (key === "activeSurface") {
      return activeSurfaceEquals(left.activeSurface, right.activeSurface)
    }
    return Object.is(left[key], right[key])
  })
}

export type SettingsPersisterWorkerOptions = {
  workflowClient: WorkflowClient
  getSnapshot: () => PersistedAppSettings
  subscribe: (listener: () => void) => () => void
  initialBaseline?: PersistedAppSettings | null
  setSyncStatus: (status: PersistenceSyncStatus) => void
}

export function createSettingsPersisterWorker({
  workflowClient,
  getSnapshot,
  subscribe,
  initialBaseline,
  setSyncStatus,
}: SettingsPersisterWorkerOptions): Persister {
  return createPersister<PersistedAppSettings, "settings.saveApp">({
    workflowClient,
    workflowId: "settings.saveApp",
    getSnapshot,
    initialBaseline,
    snapshotsEqual: persistedSettingsEqual,
    subscribe,
    setSyncStatus,
    formatTerminalError: (error) =>
      `Could not save app settings: ${getErrorMessage(error)}`,
    classifyError: (error) =>
      isRetryableWorkflowError(error)
        ? { kind: "retry" }
        : { kind: "terminal" },
  })
}

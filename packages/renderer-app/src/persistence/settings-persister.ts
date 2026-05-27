import type { WorkflowClient } from "@repo-edu/application-contract"
import type { PersistedAppSettings } from "@repo-edu/domain/settings"
import { useAppSettingsStore } from "../stores/app-settings-store.js"
import { getErrorMessage } from "../utils/error-message.js"
import { createPersister, type Persister } from "./create-persister.js"

function isRetryableWorkflowError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "retryable" in error &&
    (error as { retryable?: unknown }).retryable === true
  )
}

export function createSettingsPersister(
  workflowClient: WorkflowClient,
): Persister {
  return createPersister<PersistedAppSettings, "settings.saveApp">({
    workflowClient,
    workflowId: "settings.saveApp",
    getSnapshot: () => useAppSettingsStore.getState().settings,
    subscribe: (listener) => useAppSettingsStore.subscribe(listener),
    setSyncStatus: (status) =>
      useAppSettingsStore.getState().setSyncStatus(status),
    formatTerminalError: (error) =>
      `Could not save app settings: ${getErrorMessage(error)}`,
    classifyError: (error) =>
      isRetryableWorkflowError(error)
        ? { kind: "retry" }
        : { kind: "terminal" },
  })
}

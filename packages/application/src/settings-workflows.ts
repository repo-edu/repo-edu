import type {
  AppError,
  DiagnosticOutput,
  MilestoneProgress,
  WorkflowCallOptions,
  WorkflowHandlerMap,
} from "@repo-edu/application-contract"
import { validatePersistedAppSettings } from "@repo-edu/domain/schemas"
import type { PersistedAppSettings } from "@repo-edu/domain/settings"
import {
  type AppSettingsStore,
  createValidationAppError,
  isPersistenceWriteError,
} from "./core.js"
import {
  isRetryablePersistenceWriteKind,
  isSharedAppError,
  loadSettingsOrDefault,
  toCancelledAppError,
} from "./workflow-helpers.js"

function normalizeSettingsSaveError(error: unknown): AppError {
  if (isSharedAppError(error)) {
    return error
  }

  if (error instanceof DOMException && error.name === "AbortError") {
    return toCancelledAppError()
  }

  if (isPersistenceWriteError(error)) {
    return {
      type: "persistence",
      message: error.message,
      operation: "write",
      retryable: isRetryablePersistenceWriteKind(error.kind),
    }
  }

  return {
    type: "persistence",
    message: error instanceof Error ? error.message : String(error),
    operation: "write",
    retryable: false,
  }
}

export function createSettingsWorkflowHandlers(
  appSettingsStore: AppSettingsStore,
): Pick<
  WorkflowHandlerMap<"settings.loadApp" | "settings.saveApp">,
  "settings.loadApp" | "settings.saveApp"
> {
  return {
    "settings.loadApp": async (
      _input,
      options?: WorkflowCallOptions<never, never>,
    ) => loadSettingsOrDefault(appSettingsStore, options?.signal),
    "settings.saveApp": async (
      input: PersistedAppSettings,
      options?: WorkflowCallOptions<MilestoneProgress, DiagnosticOutput>,
    ) => {
      options?.onProgress?.({
        step: 1,
        totalSteps: 3,
        label: "Validating app settings payload.",
      })

      const validation = validatePersistedAppSettings(input)
      if (!validation.ok) {
        throw createValidationAppError(
          "App settings validation failed.",
          validation.issues,
        )
      }

      options?.onOutput?.({
        channel: "info",
        message: "Writing app settings to store.",
      })
      options?.onProgress?.({
        step: 2,
        totalSteps: 3,
        label: "Writing app settings to store.",
      })

      try {
        await appSettingsStore.saveSettings(validation.value, options?.signal)
      } catch (error) {
        throw normalizeSettingsSaveError(error)
      }

      options?.onProgress?.({
        step: 3,
        totalSteps: 3,
        label: "App settings saved.",
      })
    },
  }
}

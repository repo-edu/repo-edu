import type {
  AppError,
  DiagnosticOutput,
  MilestoneProgress,
  WorkflowCallOptions,
  WorkflowHandlerMap,
} from "@repo-edu/application-contract"
import {
  validatePersistedAppCredentials,
  validatePersistedAppPreferences,
} from "@repo-edu/domain/schemas"
import type {
  PersistedAppCredentials,
  PersistedAppPreferences,
} from "@repo-edu/domain/settings"
import {
  type AppSettingsStore,
  createValidationAppError,
  isPersistenceWriteError,
} from "./core.js"
import {
  isRetryablePersistenceWriteKind,
  isSharedAppError,
  loadSettingsOrDefault,
  throwIfAborted,
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
  WorkflowHandlerMap<
    "settings.loadApp" | "settings.saveCredentials" | "settings.savePreferences"
  >,
  "settings.loadApp" | "settings.saveCredentials" | "settings.savePreferences"
> {
  return {
    "settings.loadApp": async (
      _input,
      options?: WorkflowCallOptions<never, never>,
    ) => loadSettingsOrDefault(appSettingsStore, options?.signal),
    "settings.saveCredentials": async (
      input: PersistedAppCredentials,
      options?: WorkflowCallOptions<MilestoneProgress, DiagnosticOutput>,
    ) => {
      throwIfAborted(options?.signal)
      options?.onProgress?.({
        step: 1,
        totalSteps: 3,
        label: "Validating app credentials payload.",
      })

      const validation = validatePersistedAppCredentials(input)
      if (!validation.ok) {
        throw createValidationAppError(
          "App credentials validation failed.",
          validation.issues,
        )
      }
      throwIfAborted(options?.signal)

      options?.onOutput?.({
        channel: "info",
        message: "Writing app credentials to store.",
      })
      options?.onProgress?.({
        step: 2,
        totalSteps: 3,
        label: "Writing app credentials to store.",
      })

      try {
        await appSettingsStore.credentials.save(
          validation.value,
          options?.signal,
        )
      } catch (error) {
        throw normalizeSettingsSaveError(error)
      }

      options?.onProgress?.({
        step: 3,
        totalSteps: 3,
        label: "App credentials saved.",
      })
    },
    "settings.savePreferences": async (
      input: PersistedAppPreferences,
      options?: WorkflowCallOptions<MilestoneProgress, DiagnosticOutput>,
    ) => {
      throwIfAborted(options?.signal)
      options?.onProgress?.({
        step: 1,
        totalSteps: 3,
        label: "Validating app preferences payload.",
      })

      const validation = validatePersistedAppPreferences(input)
      if (!validation.ok) {
        throw createValidationAppError(
          "App preferences validation failed.",
          validation.issues,
        )
      }
      throwIfAborted(options?.signal)

      options?.onOutput?.({
        channel: "info",
        message: "Writing app preferences to store.",
      })
      options?.onProgress?.({
        step: 2,
        totalSteps: 3,
        label: "Writing app preferences to store.",
      })

      try {
        await appSettingsStore.preferences.save(
          validation.value,
          options?.signal,
        )
      } catch (error) {
        throw normalizeSettingsSaveError(error)
      }

      options?.onProgress?.({
        step: 3,
        totalSteps: 3,
        label: "App preferences saved.",
      })
    },
  }
}

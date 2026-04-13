import type {
  DiagnosticOutput,
  MilestoneProgress,
  WorkflowCallOptions,
  WorkflowHandlerMap,
} from "@repo-edu/application-contract"
import { validatePersistedAppSettings } from "@repo-edu/domain/schemas"
import type { PersistedAppSettings } from "@repo-edu/domain/settings"
import { type AppSettingsStore, createValidationAppError } from "./core.js"
import { loadSettingsOrDefault } from "./workflow-helpers.js"

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

      const savedSettings = await appSettingsStore.saveSettings(
        validation.value,
        options?.signal,
      )
      options?.onProgress?.({
        step: 3,
        totalSteps: 3,
        label: "App settings saved.",
      })

      return savedSettings
    },
  }
}

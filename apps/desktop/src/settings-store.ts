import { join } from "node:path"
import type { AppSettingsStore } from "@repo-edu/application"
import {
  validatePersistedAppCredentials,
  validatePersistedAppPreferences,
} from "@repo-edu/domain/schemas"
import type { PersistedAppPreferences } from "@repo-edu/domain/settings"
import {
  createNodeSettingsSectionStore,
  recoverUnsupportedCompositeSettingsFile,
} from "@repo-edu/host-node"

export type DesktopAppSettingsStore = AppSettingsStore & {
  readPreferencesWithoutRecovery(
    signal?: AbortSignal,
  ): Promise<PersistedAppPreferences | null>
}

function resolveSettingsDirectory(storageRoot: string): string {
  return join(storageRoot, "settings")
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError"
}

// A failed publication is terminal for the desktop, so the failure needs only
// its user-facing message and the original error as its cause.
function toPublicationFailure(error: unknown, message: string): unknown {
  if (isAbortError(error)) {
    return error
  }
  return new Error(message, { cause: error })
}

export function createDesktopAppSettingsStore(
  storageRoot: string,
): DesktopAppSettingsStore {
  const settingsDirectory = resolveSettingsDirectory(storageRoot)
  const credentials = createNodeSettingsSectionStore({
    settingsDirectory,
    fileName: "credentials.json",
    unit: "credentials",
    validate: validatePersistedAppCredentials,
  })
  const preferences = createNodeSettingsSectionStore({
    settingsDirectory,
    fileName: "preferences.json",
    unit: "preferences",
    validate: validatePersistedAppPreferences,
  })

  return {
    credentials: {
      load: credentials.load,
      save: async (section, signal) => {
        try {
          await credentials.save(section, signal)
        } catch (error) {
          throw toPublicationFailure(error, "Could not write app credentials.")
        }
      },
    },
    preferences: {
      load: preferences.load,
      save: async (section, signal) => {
        try {
          await preferences.save(section, signal)
        } catch (error) {
          throw toPublicationFailure(error, "Could not write app preferences.")
        }
      },
    },
    recoverUnsupportedComposite: (signal) =>
      recoverUnsupportedCompositeSettingsFile(settingsDirectory, signal),
    readPreferencesWithoutRecovery: preferences.readWithoutRecovery,
  }
}

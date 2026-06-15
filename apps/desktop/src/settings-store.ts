import { join } from "node:path"
import {
  type AppSettingsStore,
  classifyPersistenceWriteErrorCode,
  createPersistenceWriteError,
  isPersistenceWriteError,
} from "@repo-edu/application"
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

function toPersistenceWriteError(error: unknown, message: string): Error {
  if (isPersistenceWriteError(error)) {
    return error
  }

  return createPersistenceWriteError(
    classifyPersistenceWriteErrorCode((error as NodeJS.ErrnoException).code),
    message,
    error,
  )
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
          throw toPersistenceWriteError(
            error,
            "Could not write app credentials.",
          )
        }
      },
    },
    preferences: {
      load: preferences.load,
      save: async (section, signal) => {
        try {
          await preferences.save(section, signal)
        } catch (error) {
          throw toPersistenceWriteError(
            error,
            "Could not write app preferences.",
          )
        }
      },
    },
    recoverUnsupportedComposite: (signal) =>
      recoverUnsupportedCompositeSettingsFile(settingsDirectory, signal),
    readPreferencesWithoutRecovery: preferences.readRaw,
  }
}

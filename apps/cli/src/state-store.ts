import { join } from "node:path"
import type { AppSettingsLoader } from "@repo-edu/application"
import {
  validatePersistedAppCredentials,
  validatePersistedAppPreferences,
} from "@repo-edu/domain/schemas"
import { createNodeSettingsSectionReader } from "@repo-edu/host-node"

export function createCliAppSettingsLoader(
  storageRoot: string,
): AppSettingsLoader {
  const settingsDirectory = join(storageRoot, "settings")
  const credentials = createNodeSettingsSectionReader({
    settingsDirectory,
    fileName: "credentials.json",
    unit: "credentials",
    validate: validatePersistedAppCredentials,
  })
  const preferences = createNodeSettingsSectionReader({
    settingsDirectory,
    fileName: "preferences.json",
    unit: "preferences",
    validate: validatePersistedAppPreferences,
  })

  return {
    credentials: {
      load: async (signal) => ({
        value: await credentials(signal),
        recovery: [],
      }),
    },
    preferences: {
      load: async (signal) => ({
        value: await preferences(signal),
        recovery: [],
      }),
    },
  }
}

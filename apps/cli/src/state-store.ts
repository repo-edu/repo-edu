import { join } from "node:path"
import type { AppSettingsLoader, CourseStore } from "@repo-edu/application"
import {
  validatePersistedAppCredentials,
  validatePersistedAppPreferences,
} from "@repo-edu/domain/schemas"
import {
  createCourseStore,
  createNodeSettingsSectionReader,
} from "@repo-edu/host-node"

// The storage root is always supplied. The production entry resolves it once,
// before it claims the program gate, and in-process callers pass isolated
// roots. A default here would reach the real database without that gate.
export function createCliCourseStore(storageRoot: string): CourseStore {
  return createCourseStore(storageRoot)
}

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

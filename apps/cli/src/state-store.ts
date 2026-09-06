import { join } from "node:path"
import type { AppSettingsLoader, CourseStore } from "@repo-edu/application"
import {
  validatePersistedAppCredentials,
  validatePersistedAppPreferences,
} from "@repo-edu/domain/schemas"
import {
  createCourseStore,
  createNodeSettingsSectionReader,
  resolveRepoEduAppDataRoot,
} from "@repo-edu/host-node"

export function resolveCliStorageRoot(): string {
  return resolveRepoEduAppDataRoot()
}

export function createCliCourseStore(
  storageRoot: string = resolveCliStorageRoot(),
): CourseStore {
  return createCourseStore(storageRoot)
}

export function createCliAppSettingsLoader(
  storageRoot: string = resolveCliStorageRoot(),
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

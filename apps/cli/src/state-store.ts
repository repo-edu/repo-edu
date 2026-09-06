import { join } from "node:path"
import {
  type AppSettingsStore,
  type CourseStore,
  classifyPersistenceWriteErrorCode,
  createPersistenceWriteError,
  isPersistenceWriteError,
} from "@repo-edu/application"
import {
  validatePersistedAppCredentials,
  validatePersistedAppPreferences,
} from "@repo-edu/domain/schemas"
import {
  createCourseStore,
  createNodeSettingsSectionStore,
  recoverUnsupportedCompositeSettingsFile,
  resolveRepoEduAppDataRoot,
} from "@repo-edu/host-node"

function resolveSettingsDirectory(storageRoot: string): string {
  return join(storageRoot, "settings")
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError"
}

function toPersistenceWriteError(error: unknown, message: string): unknown {
  if (isAbortError(error)) {
    return error
  }
  if (isPersistenceWriteError(error)) {
    return error
  }

  return createPersistenceWriteError(
    classifyPersistenceWriteErrorCode((error as NodeJS.ErrnoException).code),
    message,
    error,
  )
}

export function resolveCliStorageRoot(): string {
  return resolveRepoEduAppDataRoot()
}

export function createCliCourseStore(
  storageRoot: string = resolveCliStorageRoot(),
): CourseStore {
  return createCourseStore(storageRoot)
}

export function createCliAppSettingsStore(
  storageRoot: string = resolveCliStorageRoot(),
): AppSettingsStore {
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
  }
}

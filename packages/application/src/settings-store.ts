import type { SettingsRecoveryEntry } from "@repo-edu/application-contract"
import type {
  PersistedAppCredentials,
  PersistedAppPreferences,
} from "@repo-edu/domain/settings"

/**
 * Application-owned storage for the credentials and preferences sections.
 *
 * A load returns the validated section, or null when its file is missing,
 * plus the recovery entries the desktop wrote while renaming invalid files
 * aside. The command line only loads and never recovers, so its loader
 * returns no recovery entries. Adapters reach these types through the narrow
 * `@repo-edu/application/settings-store` entry.
 */
export type SettingsSectionLoadResult<T> = {
  value: T | null
  recovery: SettingsRecoveryEntry[]
}

export type SectionStore<T> = {
  load(
    signal?: AbortSignal,
  ): Promise<SettingsSectionLoadResult<T>> | SettingsSectionLoadResult<T>
  save(section: T, signal?: AbortSignal): Promise<void> | void
}

export type AppSettingsLoader = {
  credentials: Pick<SectionStore<PersistedAppCredentials>, "load">
  preferences: Pick<SectionStore<PersistedAppPreferences>, "load">
}

export type AppSettingsStore = AppSettingsLoader & {
  credentials: SectionStore<PersistedAppCredentials>
  preferences: SectionStore<PersistedAppPreferences>
}

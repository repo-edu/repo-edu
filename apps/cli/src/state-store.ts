import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AppSettingsStore, ProfileStore } from "@repo-edu/application";
import {
  type PersistedAppSettings,
  type PersistedProfile,
  validatePersistedAppSettings,
  validatePersistedProfile,
} from "@repo-edu/domain";

const cliDataDirEnv = "REPO_EDU_CLI_DATA_DIR";

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error("Operation cancelled.");
  }
}

function resolveProfilesDirectory(storageRoot: string): string {
  return join(storageRoot, "profiles");
}

function resolveSettingsPath(storageRoot: string): string {
  return join(storageRoot, "settings", "app-settings.json");
}

function resolveProfilePath(storageRoot: string, profileId: string): string {
  return join(
    resolveProfilesDirectory(storageRoot),
    `${encodeURIComponent(profileId)}.json`,
  );
}

async function readValidatedProfile(
  profilePath: string,
): Promise<PersistedProfile> {
  const raw = await readFile(profilePath, "utf8");
  const parsed = JSON.parse(raw) as PersistedProfile;
  const validation = validatePersistedProfile(parsed);

  if (!validation.ok) {
    throw new Error(
      `Invalid persisted profile at ${profilePath}: ${validation.issues
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join("; ")}`,
    );
  }

  return validation.value;
}

export function resolveCliStorageRoot(): string {
  return process.env[cliDataDirEnv] ?? join(homedir(), ".repo-edu");
}

export function createCliProfileStore(
  storageRoot: string = resolveCliStorageRoot(),
): ProfileStore {
  return {
    async listProfiles(signal?: AbortSignal) {
      throwIfAborted(signal);

      const directory = resolveProfilesDirectory(storageRoot);
      const entries = await readdir(directory, { withFileTypes: true }).catch(
        (error: unknown) => {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return [];
          }

          throw error;
        },
      );

      const profiles: PersistedProfile[] = [];
      for (const entry of entries) {
        throwIfAborted(signal);
        if (!entry.isFile() || !entry.name.endsWith(".json")) {
          continue;
        }

        profiles.push(await readValidatedProfile(join(directory, entry.name)));
      }

      return profiles;
    },

    async loadProfile(profileId: string, signal?: AbortSignal) {
      throwIfAborted(signal);

      const profilePath = resolveProfilePath(storageRoot, profileId);
      try {
        return await readValidatedProfile(profilePath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return null;
        }

        throw error;
      }
    },

    async saveProfile(profile: PersistedProfile, signal?: AbortSignal) {
      throwIfAborted(signal);

      const validation = validatePersistedProfile(profile);
      if (!validation.ok) {
        throw new Error(
          `Invalid persisted profile: ${validation.issues
            .map((issue) => `${issue.path}: ${issue.message}`)
            .join("; ")}`,
        );
      }

      const profilesDirectory = resolveProfilesDirectory(storageRoot);
      await mkdir(profilesDirectory, { recursive: true });
      throwIfAborted(signal);

      const profilePath = resolveProfilePath(storageRoot, validation.value.id);
      await writeFile(
        profilePath,
        JSON.stringify(validation.value, null, 2),
        "utf8",
      );
      return validation.value;
    },
  };
}

export function createCliAppSettingsStore(
  storageRoot: string = resolveCliStorageRoot(),
): AppSettingsStore {
  return {
    async loadSettings(signal?: AbortSignal) {
      throwIfAborted(signal);

      const settingsPath = resolveSettingsPath(storageRoot);
      try {
        const raw = await readFile(settingsPath, "utf8");
        const parsed = JSON.parse(raw) as PersistedAppSettings;
        const validation = validatePersistedAppSettings(parsed);
        if (!validation.ok) {
          throw new Error(
            `Invalid persisted app settings at ${settingsPath}: ${validation.issues
              .map((issue) => `${issue.path}: ${issue.message}`)
              .join("; ")}`,
          );
        }

        return validation.value;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return null;
        }

        throw error;
      }
    },

    async saveSettings(settings: PersistedAppSettings, signal?: AbortSignal) {
      throwIfAborted(signal);

      const validation = validatePersistedAppSettings(settings);
      if (!validation.ok) {
        throw new Error(
          `Invalid persisted app settings: ${validation.issues
            .map((issue) => `${issue.path}: ${issue.message}`)
            .join("; ")}`,
        );
      }

      await mkdir(join(storageRoot, "settings"), { recursive: true });
      throwIfAborted(signal);

      const settingsPath = resolveSettingsPath(storageRoot);
      await writeFile(
        settingsPath,
        JSON.stringify(validation.value, null, 2),
        "utf8",
      );
      return validation.value;
    },
  };
}

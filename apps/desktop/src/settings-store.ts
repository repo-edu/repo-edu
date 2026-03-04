import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AppSettingsStore } from "@repo-edu/application";
import {
  type PersistedAppSettings,
  validatePersistedAppSettings,
} from "@repo-edu/domain";

function resolveSettingsPath(storageRoot: string): string {
  return join(storageRoot, "settings", "app-settings.json");
}

async function ensureSettingsDirectory(storageRoot: string): Promise<void> {
  await mkdir(join(storageRoot, "settings"), { recursive: true });
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error("Operation cancelled.");
  }
}

export function createDesktopAppSettingsStore(
  storageRoot: string,
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
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOENT") {
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

      await ensureSettingsDirectory(storageRoot);
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

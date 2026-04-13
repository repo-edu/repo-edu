import { mkdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import type { AppSettingsStore } from "@repo-edu/application"
import { validatePersistedAppSettings } from "@repo-edu/domain/schemas"
import type { PersistedAppSettings } from "@repo-edu/domain/settings"
import {
  cleanupAtomicTempFiles,
  createWriteQueue,
  writeTextFileAtomic,
} from "@repo-edu/host-node"

function resolveSettingsPath(storageRoot: string): string {
  return join(storageRoot, "settings", "app-settings.json")
}

async function ensureSettingsDirectory(storageRoot: string): Promise<void> {
  await mkdir(join(storageRoot, "settings"), { recursive: true })
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error("Operation cancelled.")
  }
}

export function createDesktopAppSettingsStore(
  storageRoot: string,
): AppSettingsStore {
  const enqueueWrite = createWriteQueue()

  return {
    async loadSettings(signal?: AbortSignal) {
      throwIfAborted(signal)
      await cleanupAtomicTempFiles(join(storageRoot, "settings"))
      const settingsPath = resolveSettingsPath(storageRoot)

      try {
        const raw = await readFile(settingsPath, "utf8")
        const parsed = JSON.parse(raw) as PersistedAppSettings
        const validation = validatePersistedAppSettings(parsed)
        if (!validation.ok) {
          throw new Error(
            `Invalid persisted app settings at ${settingsPath}: ${validation.issues
              .map((issue) => `${issue.path}: ${issue.message}`)
              .join("; ")}`,
          )
        }

        return validation.value
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (code === "ENOENT") {
          return null
        }

        throw error
      }
    },
    async saveSettings(settings: PersistedAppSettings, signal?: AbortSignal) {
      return await enqueueWrite(async () => {
        throwIfAborted(signal)
        const validation = validatePersistedAppSettings(settings)
        if (!validation.ok) {
          throw new Error(
            `Invalid persisted app settings: ${validation.issues
              .map((issue) => `${issue.path}: ${issue.message}`)
              .join("; ")}`,
          )
        }

        await ensureSettingsDirectory(storageRoot)
        throwIfAborted(signal)

        const settingsPath = resolveSettingsPath(storageRoot)
        await writeTextFileAtomic(
          settingsPath,
          JSON.stringify(validation.value, null, 2),
          signal,
        )
        return validation.value
      })
    },
  }
}

import { mkdir, readFile, rename, stat } from "node:fs/promises"
import { basename, dirname, extname, join } from "node:path"
import {
  cleanupAtomicTempFiles,
  createWriteQueue,
  writeTextFileAtomic,
} from "./atomic-write.js"

export type NodeSettingsRecoveryUnit =
  | "credentials"
  | "preferences"
  | "unsupported-composite"
export type NodeSettingsRecoveryReason =
  | "invalid"
  | "unparseable"
  | "unsupported"

export type NodeSettingsRecoveryEntry = {
  unit: NodeSettingsRecoveryUnit
  reason: NodeSettingsRecoveryReason
  backupPath: string
}

export type NodeSettingsValidationIssue = {
  path: string
  message: string
}

export type NodeSettingsValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: NodeSettingsValidationIssue[] }

export type NodeSettingsSectionStore<T> = {
  load(signal?: AbortSignal): Promise<{
    value: T | null
    recovery: NodeSettingsRecoveryEntry[]
  }>
  save(section: T, signal?: AbortSignal): Promise<void>
  readRaw(signal?: AbortSignal): Promise<T | null>
}

export type NodeSettingsSectionStoreOptions<T> = {
  settingsDirectory: string
  fileName: string
  unit: Exclude<NodeSettingsRecoveryUnit, "unsupported-composite">
  validate: (value: unknown) => NodeSettingsValidationResult<T>
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Operation cancelled.", "AbortError")
  }
}

function backupStem(fileName: string): string {
  const extension = extname(fileName)
  return extension.length === 0 ? fileName : basename(fileName, extension)
}

async function renameAside(
  path: string,
  marker: NodeSettingsRecoveryReason,
  signal?: AbortSignal,
): Promise<string> {
  const directory = dirname(path)
  const extension = extname(path)
  const stem = backupStem(basename(path))
  const timestamp = Date.now()

  for (let index = 0; ; index += 1) {
    throwIfAborted(signal)
    const suffix = index === 0 ? "" : `-${index}`
    const backupPath = join(
      directory,
      `${stem}.${marker}-${timestamp}${suffix}${extension}`,
    )
    try {
      await stat(backupPath)
      continue
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error
      }
    }
    await rename(path, backupPath)
    return backupPath
  }
}

async function readJsonFile(path: string): Promise<unknown | null> {
  try {
    const raw = await readFile(path, "utf8")
    return JSON.parse(raw) as unknown
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null
    }
    throw error
  }
}

export function createNodeSettingsSectionStore<T>({
  settingsDirectory,
  fileName,
  unit,
  validate,
}: NodeSettingsSectionStoreOptions<T>): NodeSettingsSectionStore<T> {
  const enqueueWrite = createWriteQueue()
  const path = join(settingsDirectory, fileName)

  async function readValidated(signal?: AbortSignal): Promise<T | null> {
    throwIfAborted(signal)
    const parsed = await readJsonFile(path)
    throwIfAborted(signal)
    if (parsed === null) return null

    const validation = validate(parsed)
    if (!validation.ok) {
      throw new Error(
        `Invalid persisted ${unit} settings at ${path}: ${validation.issues
          .map((issue) => `${issue.path}: ${issue.message}`)
          .join("; ")}`,
      )
    }
    return validation.value
  }

  return {
    async load(signal?: AbortSignal) {
      throwIfAborted(signal)
      await cleanupAtomicTempFiles(settingsDirectory)
      try {
        const parsed = await readJsonFile(path)
        throwIfAborted(signal)
        if (parsed === null) {
          return { value: null, recovery: [] }
        }

        const validation = validate(parsed)
        if (validation.ok) {
          return { value: validation.value, recovery: [] }
        }

        const backupPath = await renameAside(path, "invalid", signal)
        return {
          value: null,
          recovery: [{ unit, reason: "invalid", backupPath }],
        }
      } catch (error) {
        if (error instanceof SyntaxError) {
          const backupPath = await renameAside(path, "unparseable", signal)
          return {
            value: null,
            recovery: [{ unit, reason: "unparseable", backupPath }],
          }
        }
        throw error
      }
    },

    async save(section: T, signal?: AbortSignal) {
      await enqueueWrite(async () => {
        throwIfAborted(signal)
        await mkdir(settingsDirectory, { recursive: true })
        throwIfAborted(signal)
        await writeTextFileAtomic(
          path,
          JSON.stringify(section, null, 2),
          signal,
        )
      })
    },

    readRaw: readValidated,
  }
}

export async function recoverUnsupportedCompositeSettingsFile(
  settingsDirectory: string,
  signal?: AbortSignal,
): Promise<NodeSettingsRecoveryEntry[]> {
  throwIfAborted(signal)
  const path = join(settingsDirectory, "app-settings.json")
  try {
    const backupPath = await renameAside(path, "unsupported", signal)
    return [
      { unit: "unsupported-composite", reason: "unsupported", backupPath },
    ]
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return []
    }
    throw error
  }
}

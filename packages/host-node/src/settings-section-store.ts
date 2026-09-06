import { mkdir, rename, stat } from "node:fs/promises"
import { basename, dirname, extname, join } from "node:path"
import writeFileAtomic from "write-file-atomic"
import { createWriteQueue } from "./atomic-write.js"
import {
  createNodeSettingsSectionReader,
  type NodeSettingsSectionReaderOptions,
  readSettingsJson,
  throwIfSettingsReadAborted as throwIfAborted,
} from "./settings-section-reader.js"

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

export type NodeSettingsSectionStore<T> = {
  load(signal?: AbortSignal): Promise<{
    value: T | null
    recovery: NodeSettingsRecoveryEntry[]
  }>
  save(section: T, signal?: AbortSignal): Promise<void>
  readRaw(signal?: AbortSignal): Promise<T | null>
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

export function createNodeSettingsSectionStore<T>({
  settingsDirectory,
  fileName,
  unit,
  validate,
}: NodeSettingsSectionReaderOptions<T>): NodeSettingsSectionStore<T> {
  const enqueueWrite = createWriteQueue()
  const path = join(settingsDirectory, fileName)

  return {
    async load(signal?: AbortSignal) {
      return enqueueWrite(async () => {
        throwIfAborted(signal)
        try {
          const parsed = await readSettingsJson(path)
          throwIfAborted(signal)
          if (parsed === undefined) {
            return { value: null, recovery: [] }
          }

          const validation = validate(parsed)
          if (validation.ok) {
            return { value: validation.value, recovery: [] }
          }

          const backupPath = await renameAside(path, "invalid", signal)
          return {
            value: null,
            recovery: [{ unit, reason: "invalid" as const, backupPath }],
          }
        } catch (error) {
          if (error instanceof SyntaxError) {
            const backupPath = await renameAside(path, "unparseable", signal)
            return {
              value: null,
              recovery: [{ unit, reason: "unparseable" as const, backupPath }],
            }
          }
          throw error
        }
      })
    },

    async save(section: T, signal?: AbortSignal) {
      await enqueueWrite(async () => {
        throwIfAborted(signal)
        await mkdir(settingsDirectory, { recursive: true })
        throwIfAborted(signal)
        await writeFileAtomic(path, `${JSON.stringify(section, null, 2)}\n`)
      })
    },

    readRaw: createNodeSettingsSectionReader({
      settingsDirectory,
      fileName,
      unit,
      validate,
    }),
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

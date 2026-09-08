import { readFile } from "node:fs/promises"
import { join } from "node:path"
import type { SettingsRecoveryUnit } from "@repo-edu/application-contract"

export type NodeSettingsValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: { path: string; message: string }[] }

export type NodeSettingsSectionReaderOptions<T> = {
  settingsDirectory: string
  fileName: string
  unit: SettingsRecoveryUnit
  validate: (value: unknown) => NodeSettingsValidationResult<T>
}

export function throwIfSettingsReadAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Operation cancelled.", "AbortError")
  }
}

export async function readSettingsJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined
    throw error
  }
}

export function createNodeSettingsSectionReader<T>({
  settingsDirectory,
  fileName,
  unit,
  validate,
}: NodeSettingsSectionReaderOptions<T>): (
  signal?: AbortSignal,
) => Promise<T | null> {
  const path = join(settingsDirectory, fileName)
  return async (signal) => {
    throwIfSettingsReadAborted(signal)
    const parsed = await readSettingsJson(path)
    throwIfSettingsReadAborted(signal)
    if (parsed === undefined) return null
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
}

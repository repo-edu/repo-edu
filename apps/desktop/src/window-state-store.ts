import { mkdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import {
  cleanupAtomicTempFiles,
  writeTextFileAtomic,
} from "@repo-edu/host-node"

export type DesktopWindowState = {
  width: number
  height: number
}

export const defaultDesktopWindowState: DesktopWindowState = {
  width: 1180,
  height: 760,
}

function resolveWindowStatePath(storageRoot: string): string {
  return join(storageRoot, "settings", "window-state.json")
}

function normalizeWindowState(value: unknown): DesktopWindowState {
  if (typeof value !== "object" || value === null) {
    throw new Error("Invalid desktop window state.")
  }

  const candidate = value as { width?: unknown; height?: unknown }
  if (
    typeof candidate.width !== "number" ||
    typeof candidate.height !== "number" ||
    !Number.isFinite(candidate.width) ||
    !Number.isFinite(candidate.height)
  ) {
    throw new Error("Invalid desktop window state.")
  }

  return {
    width: Math.max(640, Math.round(candidate.width)),
    height: Math.max(480, Math.round(candidate.height)),
  }
}

export async function loadDesktopWindowState(
  storageRoot: string,
): Promise<DesktopWindowState> {
  const settingsDirectory = join(storageRoot, "settings")
  await cleanupAtomicTempFiles(settingsDirectory)

  try {
    const raw = await readFile(resolveWindowStatePath(storageRoot), "utf8")
    return normalizeWindowState(JSON.parse(raw) as unknown)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return defaultDesktopWindowState
    }

    throw error
  }
}

export async function saveDesktopWindowState(
  storageRoot: string,
  state: DesktopWindowState,
): Promise<void> {
  await mkdir(join(storageRoot, "settings"), { recursive: true })
  await writeTextFileAtomic(
    resolveWindowStatePath(storageRoot),
    JSON.stringify(normalizeWindowState(state), null, 2),
  )
}

import { mkdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import writeFileAtomic from "write-file-atomic"

export type NodeWindowState = {
  width: number
  height: number
}

export type NodeWindowStateStore = {
  load(): Promise<NodeWindowState>
  /** Rejects on write failure so the shell can report it locally. */
  save(state: NodeWindowState): Promise<void>
}

export const defaultNodeWindowState: Readonly<NodeWindowState> = Object.freeze({
  width: 1180,
  height: 760,
})

function normaliseWindowState(value: unknown): NodeWindowState {
  if (typeof value !== "object" || value === null) {
    throw new Error("Invalid window state.")
  }
  const candidate = value as { width?: unknown; height?: unknown }
  if (
    typeof candidate.width !== "number" ||
    typeof candidate.height !== "number" ||
    !Number.isFinite(candidate.width) ||
    !Number.isFinite(candidate.height)
  ) {
    throw new Error("Invalid window state.")
  }
  return {
    width: Math.max(640, Math.round(candidate.width)),
    height: Math.max(480, Math.round(candidate.height)),
  }
}

/** Best-effort geometry storage; the shell owns live state and write lifetime. */
export function createNodeWindowStateStore(
  storageRoot: string,
): NodeWindowStateStore {
  const directory = join(storageRoot, "settings")
  const path = join(directory, "window-state.json")
  return {
    async load() {
      try {
        return normaliseWindowState(JSON.parse(await readFile(path, "utf8")))
      } catch {
        return { ...defaultNodeWindowState }
      }
    },
    async save(state) {
      const value = normaliseWindowState(state)
      await mkdir(directory, { recursive: true })
      await writeFileAtomic(path, `${JSON.stringify(value, null, 2)}\n`, {
        fsync: false,
      })
    },
  }
}

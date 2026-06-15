import { randomUUID } from "node:crypto"
import { mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises"
import { basename, dirname, join } from "node:path"

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new Error("Operation cancelled.")
  }
}

export function createWriteQueue() {
  let chain: Promise<void> = Promise.resolve()

  return <T>(task: () => Promise<T>): Promise<T> => {
    const run = chain.then(task, task)
    chain = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }
}

function resolveAtomicTempPath(path: string): string {
  return join(
    dirname(path),
    `.${basename(path)}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`,
  )
}

export async function cleanupAtomicTempFiles(directory: string): Promise<void> {
  const entries = await readdir(directory).catch(() => [])
  const removals = entries
    .filter((name) => name.startsWith(".") && name.endsWith(".tmp"))
    .map((name) => rm(join(directory, name), { force: true }).catch(() => {}))
  await Promise.all(removals)
}

export async function writeTextFileAtomic(
  path: string,
  content: string,
  signal?: AbortSignal,
): Promise<void> {
  throwIfAborted(signal)
  const parentDirectory = dirname(path)
  await mkdir(parentDirectory, { recursive: true })
  throwIfAborted(signal)
  const temporaryPath = resolveAtomicTempPath(path)
  const existing = await stat(path).catch(() => null)

  try {
    await writeFile(temporaryPath, content, {
      encoding: "utf8",
      mode: existing?.mode,
    })
    throwIfAborted(signal)
    await rename(temporaryPath, path)
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => {})
    throw error
  }
}

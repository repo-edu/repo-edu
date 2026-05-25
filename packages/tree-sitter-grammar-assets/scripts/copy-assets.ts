import { randomUUID } from "node:crypto"
import { copyFile, mkdir, readdir, rename, rm } from "node:fs/promises"
import { basename, dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const transientCopyPrefix = ".repo-edu-copy-"

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error
}

async function readDirectory(path: string) {
  try {
    return await readdir(path, { withFileTypes: true })
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return []
    }
    throw error
  }
}

async function ensureDirectory(path: string) {
  try {
    await mkdir(path, { recursive: true })
  } catch (error) {
    if (isNodeError(error) && error.code === "EEXIST") {
      await rm(path, { force: true, recursive: true })
      await mkdir(path, { recursive: true })
      return
    }
    throw error
  }
}

function isBlockedByExistingDirectory(error: unknown) {
  return (
    isNodeError(error) &&
    (error.code === "EEXIST" ||
      error.code === "EISDIR" ||
      error.code === "ENOTDIR" ||
      error.code === "EPERM")
  )
}

async function replaceFile(sourceFile: string, targetFile: string) {
  const targetDirectory = dirname(targetFile)
  const temporaryFile = join(
    targetDirectory,
    `${transientCopyPrefix}${basename(targetFile)}-${process.pid}-${randomUUID()}`,
  )

  await ensureDirectory(targetDirectory)
  try {
    await copyFile(sourceFile, temporaryFile)
    try {
      await rename(temporaryFile, targetFile)
    } catch (error) {
      if (!isBlockedByExistingDirectory(error)) {
        throw error
      }

      await rm(targetFile, { force: true, recursive: true })
      await rename(temporaryFile, targetFile)
    }
  } finally {
    await rm(temporaryFile, { force: true })
  }
}

async function syncAssetsDirectory(
  sourceDirectory: string,
  targetDirectory: string,
) {
  await ensureDirectory(targetDirectory)

  const sourceEntries = await readdir(sourceDirectory, { withFileTypes: true })
  const sourceNames = new Set(sourceEntries.map((entry) => entry.name))

  for (const entry of sourceEntries) {
    const sourcePath = join(sourceDirectory, entry.name)
    const targetPath = join(targetDirectory, entry.name)

    if (entry.isDirectory()) {
      await syncAssetsDirectory(sourcePath, targetPath)
      continue
    }

    if (!entry.isFile()) {
      throw new Error(`Unsupported grammar asset entry: ${sourcePath}`)
    }

    await replaceFile(sourcePath, targetPath)
  }

  for (const entry of await readDirectory(targetDirectory)) {
    if (
      sourceNames.has(entry.name) ||
      entry.name.startsWith(transientCopyPrefix)
    ) {
      continue
    }

    await rm(join(targetDirectory, entry.name), {
      force: true,
      recursive: true,
    })
  }
}

export async function copyGrammarAssets(outputDirectory: string) {
  const sourceAssets = resolve(packageRoot, "src/assets")
  const targetAssets = resolve(packageRoot, outputDirectory, "assets")
  await syncAssetsDirectory(sourceAssets, targetAssets)
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? "").href

if (isMain) {
  await copyGrammarAssets(process.argv[2] ?? "dist")
}

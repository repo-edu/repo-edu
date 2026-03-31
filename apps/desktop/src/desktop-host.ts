import { randomUUID } from "node:crypto"
import { mkdir, readFile, stat, writeFile } from "node:fs/promises"
import { basename, dirname, extname } from "node:path"
import type { FileFormat } from "@repo-edu/domain/types"
import type {
  UserFilePort,
  UserFileReadRef,
  UserSaveTargetWriteRef,
} from "@repo-edu/host-runtime-contract"
import type {
  OpenUserFileDialogOptions,
  RendererEnvironmentSnapshot,
  RendererOpenUserFileRef,
  RendererSaveTargetRef,
  SaveUserFileDialogOptions,
} from "@repo-edu/renderer-host-contract"
import {
  type BrowserWindow,
  dialog,
  type OpenDialogOptions,
  type SaveDialogOptions,
  shell,
} from "electron"

type ReadReferenceRecord = {
  path: string
  displayName: string
  mediaType: string | null
  byteLength: number | null
}

type WriteReferenceRecord = {
  path: string
  displayName: string
  suggestedFormat: FileFormat | null
}

const openDialogFilterByFormat: Record<
  FileFormat,
  { name: string; extensions: string[] }
> = {
  csv: { name: "CSV", extensions: ["csv"] },
  xlsx: { name: "Excel", extensions: ["xlsx"] },
  json: { name: "JSON", extensions: ["json"] },
  yaml: { name: "YAML", extensions: ["yaml", "yml"] },
  txt: { name: "Text", extensions: ["txt"] },
}

const saveDialogFilterByFormat: Record<
  FileFormat,
  { name: string; extensions: string[] }
> = {
  csv: { name: "CSV", extensions: ["csv"] },
  xlsx: { name: "Excel", extensions: ["xlsx"] },
  json: { name: "JSON", extensions: ["json"] },
  yaml: { name: "YAML", extensions: ["yaml"] },
  txt: { name: "Text", extensions: ["txt"] },
}

function inferFormatFromPath(filePath: string): FileFormat | null {
  const extension = extname(filePath).toLowerCase()

  if (extension === ".csv") {
    return "csv"
  }
  if (extension === ".xlsx") {
    return "xlsx"
  }
  if (extension === ".json") {
    return "json"
  }
  if (extension === ".yaml" || extension === ".yml") {
    return "yaml"
  }
  if (extension === ".txt") {
    return "txt"
  }

  return null
}

function mediaTypeForFormat(format: FileFormat | null): string | null {
  switch (format) {
    case "csv":
      return "text/csv"
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    case "json":
      return "application/json"
    case "yaml":
      return "application/yaml"
    case "txt":
      return "text/plain"
    default:
      return null
  }
}

function byteLengthFor(text: string): number {
  return new TextEncoder().encode(text).byteLength
}

function toOpenDialogFilters(options?: OpenUserFileDialogOptions) {
  if (!options?.acceptFormats || options.acceptFormats.length === 0) {
    return undefined
  }

  return options.acceptFormats.map((format) => openDialogFilterByFormat[format])
}

function toSaveDialogFilters(format: FileFormat | null) {
  if (format === null) {
    return undefined
  }

  return [saveDialogFilterByFormat[format]]
}

export type DesktopHostEnvironment = {
  userFilePort: UserFilePort
  queueUserFilePath(path: string): void
  queueSaveTargetPath(path: string): void
  pickUserFile(
    parentWindow: BrowserWindow | null,
    options?: OpenUserFileDialogOptions,
  ): Promise<RendererOpenUserFileRef | null>
  pickSaveTarget(
    parentWindow: BrowserWindow | null,
    options?: SaveUserFileDialogOptions,
  ): Promise<RendererSaveTargetRef | null>
  pickDirectory(
    parentWindow: BrowserWindow | null,
    options?: { title?: string },
  ): Promise<string | null>
  openExternalUrl(url: string): Promise<void>
  getEnvironmentSnapshot(): Promise<RendererEnvironmentSnapshot>
}

type DesktopHostOptions = {
  queuedUserFilePaths?: readonly string[]
  queuedSaveTargetPaths?: readonly string[]
}

export function createDesktopHostEnvironment(
  options: DesktopHostOptions = {},
): DesktopHostEnvironment {
  const readableReferences = new Map<string, ReadReferenceRecord>()
  const writableReferences = new Map<string, WriteReferenceRecord>()
  const queuedUserFilePaths = [...(options.queuedUserFilePaths ?? [])]
  const queuedSaveTargetPaths = [...(options.queuedSaveTargetPaths ?? [])]
  let lastOpenedExternalUrl: string | null = null

  const registerReadable = async (
    filePath: string,
  ): Promise<RendererOpenUserFileRef> => {
    const referenceId = randomUUID()
    const displayName = basename(filePath)
    const format = inferFormatFromPath(filePath)
    const mediaType = mediaTypeForFormat(format)

    let byteLength: number | null = null
    try {
      const fileStats = await stat(filePath)
      byteLength = fileStats.size
    } catch {
      byteLength = null
    }

    readableReferences.set(referenceId, {
      path: filePath,
      displayName,
      mediaType,
      byteLength,
    })

    return {
      kind: "user-file-ref",
      referenceId,
      displayName,
      mediaType,
      byteLength,
    }
  }

  const registerWritable = (
    filePath: string,
    suggestedFormat: FileFormat | null,
  ): RendererSaveTargetRef => {
    const referenceId = randomUUID()
    const displayName = basename(filePath)

    writableReferences.set(referenceId, {
      path: filePath,
      displayName,
      suggestedFormat,
    })

    return {
      kind: "user-save-target-ref",
      referenceId,
      displayName,
      suggestedFormat,
    }
  }

  const userFilePort: UserFilePort = {
    async readText(reference: UserFileReadRef, signal?: AbortSignal) {
      if (signal?.aborted) {
        throw new Error("Operation cancelled.")
      }

      const file = readableReferences.get(reference.referenceId)
      if (!file) {
        throw new Error(`Unknown user-file reference: ${reference.referenceId}`)
      }

      const text = await readFile(file.path, "utf8")

      if (signal?.aborted) {
        throw new Error("Operation cancelled.")
      }

      return {
        displayName: file.displayName,
        mediaType: file.mediaType,
        byteLength: byteLengthFor(text),
        text,
      }
    },

    async writeText(
      reference: UserSaveTargetWriteRef,
      text: string,
      signal?: AbortSignal,
    ) {
      if (signal?.aborted) {
        throw new Error("Operation cancelled.")
      }

      const file = writableReferences.get(reference.referenceId)
      if (!file) {
        throw new Error(
          `Unknown save-target reference: ${reference.referenceId}`,
        )
      }

      await mkdir(dirname(file.path), { recursive: true })
      await writeFile(file.path, text, "utf8")

      if (signal?.aborted) {
        throw new Error("Operation cancelled.")
      }

      return {
        displayName: file.displayName,
        mediaType: mediaTypeForFormat(
          file.suggestedFormat ?? inferFormatFromPath(file.path),
        ),
        byteLength: byteLengthFor(text),
        savedAt: new Date().toISOString(),
      }
    },
  }

  const popQueuedUserFilePath = (
    acceptFormats?: readonly FileFormat[],
  ): string | null => {
    if (queuedUserFilePaths.length === 0) {
      return null
    }

    if (!acceptFormats || acceptFormats.length === 0) {
      return queuedUserFilePaths.shift() ?? null
    }

    const index = queuedUserFilePaths.findIndex((path) => {
      const format = inferFormatFromPath(path)
      return format !== null && acceptFormats.includes(format)
    })

    if (index < 0) {
      return null
    }

    const [selectedPath] = queuedUserFilePaths.splice(index, 1)
    return selectedPath ?? null
  }

  const popQueuedSaveTargetPath = (): string | null => {
    return queuedSaveTargetPaths.shift() ?? null
  }

  return {
    userFilePort,
    queueUserFilePath(path) {
      queuedUserFilePaths.push(path)
    },
    queueSaveTargetPath(path) {
      queuedSaveTargetPaths.push(path)
    },

    async pickUserFile(parentWindow, options) {
      const queuedPath = popQueuedUserFilePath(options?.acceptFormats)
      if (queuedPath) {
        return await registerReadable(queuedPath)
      }

      const dialogOptions: OpenDialogOptions = {
        title: options?.title,
        properties: ["openFile"],
        filters: toOpenDialogFilters(options),
      }
      const result = parentWindow
        ? await dialog.showOpenDialog(parentWindow, dialogOptions)
        : await dialog.showOpenDialog(dialogOptions)

      if (result.canceled || result.filePaths.length === 0) {
        return null
      }

      return await registerReadable(result.filePaths[0])
    },

    async pickSaveTarget(parentWindow, options) {
      const suggestedFormat = options?.defaultFormat ?? null
      const queuedPath = popQueuedSaveTargetPath()
      if (queuedPath) {
        return registerWritable(queuedPath, suggestedFormat)
      }

      const dialogOptions: SaveDialogOptions = {
        title: options?.title,
        defaultPath: options?.suggestedName,
        filters: toSaveDialogFilters(suggestedFormat),
      }
      const result = parentWindow
        ? await dialog.showSaveDialog(parentWindow, dialogOptions)
        : await dialog.showSaveDialog(dialogOptions)

      if (result.canceled || !result.filePath) {
        return null
      }

      return registerWritable(result.filePath, suggestedFormat)
    },

    async pickDirectory(parentWindow, options) {
      const dialogOptions: OpenDialogOptions = {
        title: options?.title,
        properties: ["openDirectory"],
      }
      const result = parentWindow
        ? await dialog.showOpenDialog(parentWindow, dialogOptions)
        : await dialog.showOpenDialog(dialogOptions)

      if (result.canceled || result.filePaths.length === 0) {
        return null
      }

      return result.filePaths[0]
    },

    async openExternalUrl(url: string) {
      await shell.openExternal(url)
      lastOpenedExternalUrl = url
    },

    async getEnvironmentSnapshot() {
      return {
        shell: "electron-renderer",
        theme: "system",
        windowChrome: "hiddenInset",
        canPromptForFiles: true,
        lastOpenedExternalUrl,
      } satisfies RendererEnvironmentSnapshot
    },
  }
}

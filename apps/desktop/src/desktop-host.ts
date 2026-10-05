import type { FileFormat } from "@repo-edu/domain/types"
import type { UserFilePort } from "@repo-edu/host-runtime-contract"
import type {
  OpenUserFileDialogOptions,
  RendererOpenUserFileRef,
  RendererSaveTargetRef,
  SaveUserFileDialogOptions,
} from "@repo-edu/renderer-host-contract"
import {
  type BrowserWindow,
  dialog,
  type OpenDialogOptions,
  type SaveDialogOptions,
} from "electron"
import {
  createDesktopUserFiles,
  inferFormatFromPath,
} from "./desktop-user-files"

const openDialogFilterByFormat: Record<
  FileFormat,
  { name: string; extensions: string[] }
> = {
  csv: { name: "CSV", extensions: ["csv"] },
  xlsx: { name: "Excel", extensions: ["xlsx"] },
  json: { name: "JSON", extensions: ["json"] },
  txt: { name: "Text", extensions: ["txt"] },
}

const saveDialogFilterByFormat: Record<
  FileFormat,
  { name: string; extensions: string[] }
> = {
  csv: { name: "CSV", extensions: ["csv"] },
  xlsx: { name: "Excel", extensions: ["xlsx"] },
  json: { name: "JSON", extensions: ["json"] },
  txt: { name: "Text", extensions: ["txt"] },
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
}

type DesktopHostOptions = {
  queuedUserFilePaths?: readonly string[]
  queuedSaveTargetPaths?: readonly string[]
}

export function createDesktopHostEnvironment(
  options: DesktopHostOptions = {},
): DesktopHostEnvironment {
  const userFiles = createDesktopUserFiles()
  const queuedUserFilePaths = [...(options.queuedUserFilePaths ?? [])]
  const queuedSaveTargetPaths = [...(options.queuedSaveTargetPaths ?? [])]

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
    userFilePort: userFiles.userFilePort,
    queueUserFilePath(path) {
      queuedUserFilePaths.push(path)
    },
    queueSaveTargetPath(path) {
      queuedSaveTargetPaths.push(path)
    },

    async pickUserFile(parentWindow, options) {
      const queuedPath = popQueuedUserFilePath(options?.acceptFormats)
      if (queuedPath) {
        return await userFiles.registerReadable(queuedPath)
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

      return await userFiles.registerReadable(result.filePaths[0])
    },

    async pickSaveTarget(parentWindow, options) {
      const suggestedFormat = options?.defaultFormat ?? null
      const queuedPath = popQueuedSaveTargetPath()
      if (queuedPath) {
        return userFiles.registerWritable(queuedPath, suggestedFormat)
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

      return userFiles.registerWritable(result.filePath, suggestedFormat)
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
  }
}

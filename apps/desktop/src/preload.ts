import { contextBridge, ipcRenderer } from "electron"
import {
  type DesktopTrpcBridge,
  desktopEntryChannel,
  desktopTrpcResponseChannel,
} from "./desktop-wire"
import {
  invokeRendererCloseHandler,
  type RendererCloseHandler,
} from "./renderer-close"
import {
  type DesktopRendererHostBridge,
  type DownloadProgress,
  desktopRendererHostChannels,
} from "./renderer-host-bridge"

const desktopTrpcBridge: DesktopTrpcBridge = {
  send(message) {
    ipcRenderer.send(desktopEntryChannel, { kind: "trpc", message })
  },
  subscribe(handler) {
    const receive = (
      _event: Electron.IpcRendererEvent,
      message: Parameters<typeof handler>[0],
    ) => handler(message)
    ipcRenderer.on(desktopTrpcResponseChannel, receive)
    return () => {
      ipcRenderer.removeListener(desktopTrpcResponseChannel, receive)
    }
  },
}

let closeCallback: RendererCloseHandler | null = null
let closeCancelCallback: ((attemptId: string) => void) | null = null

ipcRenderer.on(
  desktopRendererHostChannels.requestClose,
  async (_event, request: unknown) => {
    if (
      typeof request !== "object" ||
      request === null ||
      typeof (request as { requestId?: unknown }).requestId !== "string"
    ) {
      return
    }
    const requestId = (request as { requestId: string }).requestId
    const response = await invokeRendererCloseHandler(closeCallback, requestId)
    ipcRenderer.send(desktopEntryChannel, { kind: "close-complete", response })
  },
)

ipcRenderer.on(
  desktopRendererHostChannels.cancelClose,
  (_event, request: unknown) => {
    if (
      typeof request !== "object" ||
      request === null ||
      typeof (request as { requestId?: unknown }).requestId !== "string"
    )
      return
    const requestId = (request as { requestId: string }).requestId
    closeCancelCallback?.(requestId)
    ipcRenderer.send(desktopRendererHostChannels.closeCancelComplete, {
      requestId,
    })
  },
)

const desktopHostBridge: DesktopRendererHostBridge = {
  async bootstrapReady() {
    await ipcRenderer.invoke(desktopEntryChannel, { action: "bootstrapReady" })
  },
  async pickUserFile(options) {
    return await ipcRenderer.invoke(desktopEntryChannel, {
      action: "pickUserFile",
      input: options,
    })
  },

  async pickSaveTarget(options) {
    return await ipcRenderer.invoke(desktopEntryChannel, {
      action: "pickSaveTarget",
      input: options,
    })
  },

  async pickDirectory(options) {
    return await ipcRenderer.invoke(desktopEntryChannel, {
      action: "pickDirectory",
      input: options,
    })
  },

  async setNativeTheme(theme) {
    await ipcRenderer.invoke(desktopEntryChannel, {
      action: "setNativeTheme",
      input: theme,
    })
  },

  async revealCoursesDirectory() {
    await ipcRenderer.invoke(desktopEntryChannel, {
      action: "revealCoursesDirectory",
    })
  },

  onCloseRequest(callback) {
    closeCallback = callback
    return () => {
      if (closeCallback === callback) closeCallback = null
    }
  },

  onCloseCancel(callback) {
    closeCancelCallback = callback
    return () => {
      if (closeCancelCallback === callback) closeCancelCallback = null
    }
  },

  onUpdateAvailable(callback) {
    const handler = (
      _event: Electron.IpcRendererEvent,
      info: { version: string },
    ) => {
      callback(info)
    }
    ipcRenderer.on(desktopRendererHostChannels.onUpdateAvailable, handler)
    return () => {
      ipcRenderer.removeListener(
        desktopRendererHostChannels.onUpdateAvailable,
        handler,
      )
    }
  },

  onUpdateDownloaded(callback) {
    const handler = () => {
      callback()
    }
    ipcRenderer.on(desktopRendererHostChannels.onUpdateDownloaded, handler)
    return () => {
      ipcRenderer.removeListener(
        desktopRendererHostChannels.onUpdateDownloaded,
        handler,
      )
    }
  },

  onUpdateError(callback) {
    const handler = (
      _event: Electron.IpcRendererEvent,
      error: { message: string },
    ) => {
      callback(error)
    }
    ipcRenderer.on(desktopRendererHostChannels.onUpdateError, handler)
    return () => {
      ipcRenderer.removeListener(
        desktopRendererHostChannels.onUpdateError,
        handler,
      )
    }
  },

  onDownloadProgress(callback) {
    const handler = (
      _event: Electron.IpcRendererEvent,
      progress: DownloadProgress,
    ) => {
      callback(progress)
    }
    ipcRenderer.on(desktopRendererHostChannels.onDownloadProgress, handler)
    return () => {
      ipcRenderer.removeListener(
        desktopRendererHostChannels.onDownloadProgress,
        handler,
      )
    }
  },

  async downloadUpdate() {
    await ipcRenderer.invoke(desktopEntryChannel, { action: "downloadUpdate" })
  },

  async quitAndInstall() {
    await ipcRenderer.invoke(desktopEntryChannel, { action: "quitAndInstall" })
  },
}

process.once("loaded", () => {
  contextBridge.exposeInMainWorld("repoEduTrpc", desktopTrpcBridge)
  contextBridge.exposeInMainWorld("repoEduDesktopHost", desktopHostBridge)
})

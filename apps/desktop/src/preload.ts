import { contextBridge, ipcRenderer } from "electron"
import {
  type DesktopRendererHostBridge,
  type DownloadProgress,
  desktopRendererHostChannels,
} from "./renderer-host-bridge"

const electronTRPCChannel = "trpc-electron"

const electronTRPCBridge = {
  sendMessage(message: unknown) {
    ipcRenderer.send(electronTRPCChannel, message)
  },
  onMessage(handler: (message: unknown) => void) {
    ipcRenderer.on(electronTRPCChannel, (_event, message: unknown) => {
      handler(message)
    })
  },
}

const desktopHostBridge: DesktopRendererHostBridge = {
  async pickUserFile(options) {
    return await ipcRenderer.invoke(
      desktopRendererHostChannels.pickUserFile,
      options,
    )
  },

  async pickSaveTarget(options) {
    return await ipcRenderer.invoke(
      desktopRendererHostChannels.pickSaveTarget,
      options,
    )
  },

  async pickDirectory(options) {
    return await ipcRenderer.invoke(
      desktopRendererHostChannels.pickDirectory,
      options,
    )
  },

  async openExternalUrl(url) {
    await ipcRenderer.invoke(desktopRendererHostChannels.openExternalUrl, url)
  },

  async getEnvironmentSnapshot() {
    return await ipcRenderer.invoke(
      desktopRendererHostChannels.getEnvironmentSnapshot,
    )
  },

  async setNativeTheme(theme) {
    await ipcRenderer.invoke(desktopRendererHostChannels.setNativeTheme, theme)
  },

  async revealCoursesDirectory() {
    await ipcRenderer.invoke(desktopRendererHostChannels.revealCoursesDirectory)
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
    await ipcRenderer.invoke(desktopRendererHostChannels.downloadUpdate)
  },

  async quitAndInstall() {
    await ipcRenderer.invoke(desktopRendererHostChannels.quitAndInstall)
  },
}

process.once("loaded", () => {
  contextBridge.exposeInMainWorld("electronTRPC", electronTRPCBridge)
  contextBridge.exposeInMainWorld("repoEduDesktopHost", desktopHostBridge)
})

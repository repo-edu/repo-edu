import { contextBridge, ipcRenderer } from "electron"
import {
  type DesktopRendererHostBridge,
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
}

process.once("loaded", () => {
  contextBridge.exposeInMainWorld("electronTRPC", electronTRPCBridge)
  contextBridge.exposeInMainWorld("repoEduDesktopHost", desktopHostBridge)
})

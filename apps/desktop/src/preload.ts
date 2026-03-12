import { contextBridge, ipcRenderer } from "electron"
import { exposeElectronTRPC } from "trpc-electron/main"
import {
  type DesktopRendererHostBridge,
  desktopRendererHostChannels,
} from "./renderer-host-bridge"

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
  exposeElectronTRPC()
  contextBridge.exposeInMainWorld("repoEduDesktopHost", desktopHostBridge)
})

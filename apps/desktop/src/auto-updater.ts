import { app, type BrowserWindow } from "electron"
import { autoUpdater } from "electron-updater"
import { desktopRendererHostChannels } from "./renderer-host-bridge"

const updateCheckIntervalMs = 4 * 60 * 60 * 1000
const initialCheckDelayMs = 10_000

let initialized = false
let currentWindow: BrowserWindow | null = null

export function initAutoUpdater(mainWindow: BrowserWindow): void {
  if (!app.isPackaged || initialized) {
    return
  }

  initialized = true
  currentWindow = mainWindow

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on("update-available", (info) => {
    currentWindow?.webContents.send(
      desktopRendererHostChannels.onUpdateAvailable,
      {
        version: info.version,
      },
    )
  })

  autoUpdater.on("update-downloaded", () => {
    currentWindow?.webContents.send(
      desktopRendererHostChannels.onUpdateDownloaded,
    )
  })

  autoUpdater.on("error", (error) => {
    currentWindow?.webContents.send(desktopRendererHostChannels.onUpdateError, {
      message: error.message,
    })
  })

  setTimeout(() => {
    void autoUpdater.checkForUpdates()
  }, initialCheckDelayMs)

  setInterval(() => {
    void autoUpdater.checkForUpdates()
  }, updateCheckIntervalMs)
}

export function bindAutoUpdaterWindow(mainWindow: BrowserWindow): void {
  currentWindow = mainWindow
}

export async function downloadUpdate(): Promise<void> {
  await autoUpdater.downloadUpdate()
}

export function quitAndInstall(): void {
  autoUpdater.quitAndInstall()
}

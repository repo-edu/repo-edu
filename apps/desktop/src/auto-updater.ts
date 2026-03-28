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

  // Windows doesn't append arch to channel names, so we encode architecture in
  // the channel to select latest-windows.yml vs latest-windows-arm64.yml.
  // Linux and macOS use the default channel; electron-updater appends
  // -linux[-arm64] and -mac automatically.
  if (process.platform === "win32") {
    const channel =
      process.arch === "arm64" ? "latest-windows-arm64" : "latest-windows"

    autoUpdater.setFeedURL({
      provider: "github",
      owner: "repo-edu",
      repo: "repo-edu",
      channel,
    })
  }
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

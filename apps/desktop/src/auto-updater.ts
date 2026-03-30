import { app, type BrowserWindow, dialog } from "electron"
import { autoUpdater } from "electron-updater"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { desktopRendererHostChannels } from "./renderer-host-bridge"

const updateCheckIntervalMs = 4 * 60 * 60 * 1000
const initialCheckDelayMs = 10_000

export type AutoUpdaterState = {
  initialized: boolean
  supported: boolean
  checking: boolean
  downloading: boolean
  updateAvailable: boolean
  updateDownloaded: boolean
  availableVersion: string | null
  errorMessage: string | null
}

let initialized = false
let manualCheckInFlight = false
let currentWindow: BrowserWindow | null = null

function isUpdaterSupported(): boolean {
  if (!app.isPackaged) {
    return false
  }

  try {
    return existsSync(join(process.resourcesPath, "app-update.yml"))
  } catch {
    return false
  }
}

function getLiveWindow(): BrowserWindow | null {
  if (currentWindow && !currentWindow.isDestroyed()) {
    return currentWindow
  }
  return null
}
let autoUpdaterState: AutoUpdaterState = {
  initialized: false,
  supported: isUpdaterSupported(),
  checking: false,
  downloading: false,
  updateAvailable: false,
  updateDownloaded: false,
  availableVersion: null,
  errorMessage: null,
}
const stateListeners = new Set<(state: AutoUpdaterState) => void>()

function emitAutoUpdaterState() {
  const snapshot = getAutoUpdaterState()
  for (const listener of stateListeners) {
    listener(snapshot)
  }
}

function patchAutoUpdaterState(patch: Partial<AutoUpdaterState>) {
  autoUpdaterState = {
    ...autoUpdaterState,
    ...patch,
  }
  emitAutoUpdaterState()
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }
  return String(error)
}

export function getAutoUpdaterState(): AutoUpdaterState {
  return { ...autoUpdaterState }
}

export function onAutoUpdaterStateChange(
  listener: (state: AutoUpdaterState) => void,
): () => void {
  stateListeners.add(listener)
  listener(getAutoUpdaterState())
  return () => {
    stateListeners.delete(listener)
  }
}

export function initAutoUpdater(mainWindow: BrowserWindow): void {
  const supported = isUpdaterSupported()
  patchAutoUpdaterState({ supported })
  if (!supported || initialized) {
    return
  }

  initialized = true
  currentWindow = mainWindow
  patchAutoUpdaterState({
    initialized: true,
    errorMessage: null,
  })

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
    manualCheckInFlight = false
    patchAutoUpdaterState({
      updateAvailable: true,
      updateDownloaded: false,
      availableVersion: info.version,
      errorMessage: null,
    })
    getLiveWindow()?.webContents.send(
      desktopRendererHostChannels.onUpdateAvailable,
      {
        version: info.version,
      },
    )
  })

  autoUpdater.on("update-not-available", () => {
    patchAutoUpdaterState({
      updateAvailable: false,
      availableVersion: null,
      errorMessage: null,
    })
    if (manualCheckInFlight) {
      manualCheckInFlight = false
      const options = {
        type: "info" as const,
        message: "There are currently no updates available.",
        buttons: ["OK"],
      }
      const win = getLiveWindow()
      if (win) {
        void dialog.showMessageBox(win, options)
      } else {
        void dialog.showMessageBox(options)
      }
    }
  })

  autoUpdater.on("download-progress", (progress) => {
    getLiveWindow()?.webContents.send(
      desktopRendererHostChannels.onDownloadProgress,
      {
        percent: progress.percent,
        bytesPerSecond: progress.bytesPerSecond,
        transferred: progress.transferred,
        total: progress.total,
      },
    )
  })

  autoUpdater.on("update-downloaded", () => {
    patchAutoUpdaterState({
      downloading: false,
      updateAvailable: false,
      updateDownloaded: true,
      errorMessage: null,
    })
    getLiveWindow()?.webContents.send(
      desktopRendererHostChannels.onUpdateDownloaded,
    )
  })

  autoUpdater.on("error", (error) => {
    manualCheckInFlight = false
    patchAutoUpdaterState({
      errorMessage: error.message,
    })
    getLiveWindow()?.webContents.send(
      desktopRendererHostChannels.onUpdateError,
      {
        message: error.message,
      },
    )
  })

  setTimeout(() => {
    void checkForUpdatesNow()
  }, initialCheckDelayMs)

  setInterval(() => {
    void checkForUpdatesNow()
  }, updateCheckIntervalMs)
}

export function bindAutoUpdaterWindow(mainWindow: BrowserWindow): void {
  currentWindow = mainWindow
}

export async function checkForUpdatesNow(options?: {
  manual?: boolean
}): Promise<void> {
  if (
    !autoUpdaterState.supported ||
    !autoUpdaterState.initialized ||
    autoUpdaterState.checking
  ) {
    return
  }

  if (options?.manual) {
    manualCheckInFlight = true
  }

  patchAutoUpdaterState({
    checking: true,
    errorMessage: null,
  })
  try {
    await autoUpdater.checkForUpdates()
  } catch (error) {
    manualCheckInFlight = false
    patchAutoUpdaterState({
      errorMessage: normalizeErrorMessage(error),
    })
  } finally {
    patchAutoUpdaterState({
      checking: false,
    })
  }
}

export async function downloadUpdate(): Promise<void> {
  if (
    !autoUpdaterState.supported ||
    !autoUpdaterState.initialized ||
    autoUpdaterState.downloading
  ) {
    return
  }

  patchAutoUpdaterState({
    downloading: true,
    errorMessage: null,
  })
  try {
    await autoUpdater.downloadUpdate()
  } catch (error) {
    patchAutoUpdaterState({
      errorMessage: normalizeErrorMessage(error),
    })
  } finally {
    patchAutoUpdaterState({
      downloading: false,
    })
  }
}

export function quitAndInstall(): void {
  if (!autoUpdaterState.supported) {
    return
  }
  autoUpdater.quitAndInstall()
}

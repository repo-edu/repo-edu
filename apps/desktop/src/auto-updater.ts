import { app, type BrowserWindow } from "electron"
import { autoUpdater } from "electron-updater"
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
let currentWindow: BrowserWindow | null = null
let autoUpdaterState: AutoUpdaterState = {
  initialized: false,
  supported: app.isPackaged,
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
  if (!app.isPackaged || initialized) {
    return
  }

  initialized = true
  currentWindow = mainWindow
  patchAutoUpdaterState({
    initialized: true,
    supported: true,
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
    patchAutoUpdaterState({
      updateAvailable: true,
      updateDownloaded: false,
      availableVersion: info.version,
      errorMessage: null,
    })
    currentWindow?.webContents.send(
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
  })

  autoUpdater.on("update-downloaded", () => {
    patchAutoUpdaterState({
      downloading: false,
      updateAvailable: false,
      updateDownloaded: true,
      errorMessage: null,
    })
    currentWindow?.webContents.send(
      desktopRendererHostChannels.onUpdateDownloaded,
    )
  })

  autoUpdater.on("error", (error) => {
    patchAutoUpdaterState({
      errorMessage: error.message,
    })
    currentWindow?.webContents.send(desktopRendererHostChannels.onUpdateError, {
      message: error.message,
    })
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

export async function checkForUpdatesNow(): Promise<void> {
  if (
    !app.isPackaged ||
    !autoUpdaterState.initialized ||
    autoUpdaterState.checking
  ) {
    return
  }

  patchAutoUpdaterState({
    checking: true,
    errorMessage: null,
  })
  try {
    await autoUpdater.checkForUpdates()
  } catch (error) {
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
    !app.isPackaged ||
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
  if (!app.isPackaged) {
    return
  }
  autoUpdater.quitAndInstall()
}

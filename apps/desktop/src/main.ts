import { createRequire } from "node:module"
import os from "node:os"
import { delimiter, dirname, join, resolve } from "node:path"
import { performance } from "node:perf_hooks"
import { fileURLToPath, pathToFileURL } from "node:url"
import type { AppSettingsStore } from "@repo-edu/application"
import { defaultAppSettings } from "@repo-edu/domain/settings"
import type { PersistedAppSettings } from "@repo-edu/domain/types"
import {
  createNodeFileSystemPort,
  createNodeGitCommandPort,
  createNodeHttpPort,
} from "@repo-edu/host-node"
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  type MenuItemConstructorOptions,
  nativeTheme,
  shell,
} from "electron"
import {
  bindAutoUpdaterWindow,
  checkForUpdatesNow,
  downloadUpdate,
  getAutoUpdaterState,
  initAutoUpdater,
  onAutoUpdaterStateChange,
  quitAndInstall,
} from "./auto-updater"
import { createDesktopCourseStore } from "./course-store"
import { createDesktopHostEnvironment } from "./desktop-host"
import { seedDesktopFixtureFromEnvironment } from "./fixture-seed"
import {
  type DesktopRendererHostBridge,
  desktopRendererHostChannels,
} from "./renderer-host-bridge"
import { createDesktopAppSettingsStore } from "./settings-store"
import type { DesktopRouter } from "./trpc"
import { createDesktopRouter } from "./trpc"

const { createIPCHandler } = createRequire(import.meta.url)(
  "trpc-electron/main",
) as typeof import("trpc-electron/main")

const startupMarker = "repo-edu-desktop-cold-start"
const trpcMarker = "repo-edu-desktop-trpc"
const desktopAppName = "Repo Edu"
const docsWebsiteUrl = "https://repo-edu.github.io/repo-edu/"
const startupStartedAt = performance.now()
const isMeasureMode = process.env.REPO_EDU_DESKTOP_MEASURE === "1"
const isTRPCValidationMode = process.env.REPO_EDU_DESKTOP_VALIDATE_TRPC === "1"

const currentDir = dirname(fileURLToPath(import.meta.url))
const desktopHost = createDesktopHostEnvironment()
const nodeHttpPort = createNodeHttpPort()
const nodeGitCommandPort = createNodeGitCommandPort()
const nodeFileSystemPort = createNodeFileSystemPort()
let desktopRouter: DesktopRouter | null = null
let ipcHandler: ReturnType<typeof createIPCHandler<DesktopRouter>> | null = null
let hostIpcRegistered = false
let storageRootPath: string | null = null
let validationCourseId = ""
let updaterMenuBound = false
let quitRequested = false

const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) {
  app.quit()
}

app.setName(desktopAppName)

app.on("second-instance", () => {
  const mainWindow = BrowserWindow.getAllWindows()[0]
  if (!mainWindow) {
    return
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  }
  mainWindow.focus()
})

function resolvePreloadPath() {
  return join(currentDir, "../preload/preload.cjs")
}

function resolveRendererUrl() {
  const baseUrl =
    process.env.ELECTRON_RENDERER_URL ??
    pathToFileURL(join(currentDir, "../renderer/index.html")).toString()
  const url = new URL(baseUrl)

  if (isTRPCValidationMode) {
    url.searchParams.set("mode", "validate-trpc")
    url.searchParams.set("courseId", validationCourseId)
  }

  return url.toString()
}

function resolveStorageRootPath() {
  const override = process.env.REPO_EDU_STORAGE_ROOT?.trim()
  if (override) {
    return resolve(override)
  }
  return join(app.getPath("appData"), "repo-edu")
}

function currentStorageRootPath() {
  return storageRootPath ?? resolveStorageRootPath()
}

function parsePathQueue(value: string | undefined): string[] {
  const trimmed = value?.trim()
  if (!trimmed) {
    return []
  }

  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed) as unknown
    if (
      !Array.isArray(parsed) ||
      !parsed.every((entry) => typeof entry === "string")
    ) {
      throw new Error(
        "Path queue env vars must be JSON arrays of strings when JSON format is used.",
      )
    }
    return parsed
  }

  return trimmed
    .split(delimiter)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
}

function buildUpdateMenuItems(): MenuItemConstructorOptions[] {
  const updaterState = getAutoUpdaterState()
  const checkLabel = !updaterState.supported
    ? "Check for Updates... (Packaged builds only)"
    : !updaterState.initialized
      ? "Check for Updates... (Initializing)"
      : updaterState.checking
        ? "Checking for Updates..."
        : "Check for Updates..."
  const downloadLabel = updaterState.downloading
    ? "Downloading Update..."
    : updaterState.availableVersion
      ? `Download Update ${updaterState.availableVersion}`
      : "Download Update"

  const items: MenuItemConstructorOptions[] = [
    {
      label: checkLabel,
      enabled:
        updaterState.supported &&
        updaterState.initialized &&
        !updaterState.checking,
      click: () => {
        void checkForUpdatesNow({ manual: true })
      },
    },
    {
      label: downloadLabel,
      enabled:
        updaterState.supported &&
        updaterState.initialized &&
        updaterState.updateAvailable &&
        !updaterState.downloading,
      click: () => {
        void downloadUpdate()
      },
    },
    {
      label: "Install Update and Restart",
      enabled:
        updaterState.supported &&
        updaterState.initialized &&
        updaterState.updateDownloaded,
      click: () => {
        quitAndInstall()
      },
    },
  ]

  if (updaterState.errorMessage) {
    items.push(
      { type: "separator" },
      {
        label: `Update Error: ${updaterState.errorMessage}`,
        enabled: false,
      },
    )
  }

  return items
}

async function showAboutDialog() {
  const version = app.getVersion()
  const runtime = app.isPackaged ? "Packaged build" : "Development build"
  const detail = [
    `Version: ${version}`,
    `Electron: ${process.versions.electron}`,
    `Chrome: ${process.versions.chrome}`,
    `Node.js: ${process.versions.node}`,
    `OS: ${os.type()} ${os.arch()} ${os.release()}`,
    `Runtime: ${runtime}`,
  ].join("\n")

  const options = {
    type: "info" as const,
    title: `About ${desktopAppName}`,
    message: `${desktopAppName}`,
    detail,
    buttons: ["OK"],
    defaultId: 0,
  }
  const parent = BrowserWindow.getFocusedWindow()
  if (parent) {
    await dialog.showMessageBox(parent, options)
  } else {
    await dialog.showMessageBox(options)
  }
}

function createHelpMenu(updateItems: MenuItemConstructorOptions[]) {
  const helpItems: MenuItemConstructorOptions[] = [
    {
      label: "Documentation",
      click: () => {
        void shell.openExternal(docsWebsiteUrl)
      },
    },
  ]

  if (process.platform !== "darwin") {
    helpItems.push({ type: "separator" }, ...updateItems)
  }

  if (process.platform !== "darwin") {
    helpItems.push(
      { type: "separator" },
      {
        label: `About ${desktopAppName}`,
        click: () => {
          void showAboutDialog()
        },
      },
    )
  }

  return {
    label: "Help",
    submenu: helpItems,
  } satisfies MenuItemConstructorOptions
}

function installApplicationMenu() {
  const isMac = process.platform === "darwin"
  const updateItems = buildUpdateMenuItems()
  const template: MenuItemConstructorOptions[] = []

  if (isMac) {
    template.push({
      label: app.name,
      submenu: [
        {
          label: `About ${desktopAppName}`,
          click: () => {
            void showAboutDialog()
          },
        },
        { type: "separator" },
        ...updateItems,
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    })
  }

  template.push(
    { role: "fileMenu" },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
  )

  template.push(createHelpMenu(updateItems))

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function bindUpdaterMenu() {
  if (updaterMenuBound) {
    return
  }

  updaterMenuBound = true
  onAutoUpdaterStateChange(() => {
    installApplicationMenu()
  })
}
function registerRendererHostIpcHandlers() {
  if (hostIpcRegistered) {
    return
  }

  hostIpcRegistered = true

  ipcMain.handle(
    desktopRendererHostChannels.pickUserFile,
    async (
      event,
      options: Parameters<DesktopRendererHostBridge["pickUserFile"]>[0],
    ) => {
      const parentWindow = BrowserWindow.fromWebContents(event.sender)
      return await desktopHost.pickUserFile(parentWindow, options)
    },
  )

  ipcMain.handle(
    desktopRendererHostChannels.pickSaveTarget,
    async (
      event,
      options: Parameters<DesktopRendererHostBridge["pickSaveTarget"]>[0],
    ) => {
      const parentWindow = BrowserWindow.fromWebContents(event.sender)
      return await desktopHost.pickSaveTarget(parentWindow, options)
    },
  )

  ipcMain.handle(
    desktopRendererHostChannels.pickDirectory,
    async (
      event,
      options: Parameters<DesktopRendererHostBridge["pickDirectory"]>[0],
    ) => {
      const parentWindow = BrowserWindow.fromWebContents(event.sender)
      return await desktopHost.pickDirectory(parentWindow, options)
    },
  )

  ipcMain.handle(
    desktopRendererHostChannels.openExternalUrl,
    async (
      _event,
      url: Parameters<DesktopRendererHostBridge["openExternalUrl"]>[0],
    ) => {
      await desktopHost.openExternalUrl(url)
    },
  )

  ipcMain.handle(
    desktopRendererHostChannels.getEnvironmentSnapshot,
    async () => {
      return await desktopHost.getEnvironmentSnapshot()
    },
  )

  ipcMain.handle(
    desktopRendererHostChannels.setNativeTheme,
    (_event, theme: "light" | "dark" | "system") => {
      nativeTheme.themeSource = theme
    },
  )

  ipcMain.handle(
    desktopRendererHostChannels.revealCoursesDirectory,
    async () => {
      const coursesDir = join(currentStorageRootPath(), "courses")
      await shell.openPath(coursesDir)
    },
  )

  ipcMain.handle(desktopRendererHostChannels.downloadUpdate, async () => {
    await downloadUpdate()
  })

  ipcMain.handle(desktopRendererHostChannels.quitAndInstall, () => {
    quitAndInstall()
  })
}

function handleValidationMarker(message: string) {
  if (!isTRPCValidationMode) {
    return
  }

  try {
    const parsed = JSON.parse(message)

    if (parsed.marker !== trpcMarker) {
      return
    }

    process.stdout.write(`${JSON.stringify(parsed)}\n`)
    setTimeout(() => {
      app.quit()
    }, 50)
  } catch {
    // Ignore unrelated renderer markers.
  }
}

async function saveWindowState(appSettingsStore: AppSettingsStore) {
  const mainWindow = BrowserWindow.getAllWindows()[0]
  if (!mainWindow) return

  const [width, height] = mainWindow.getSize()
  const current = await appSettingsStore.loadSettings()
  if (!current) return

  await appSettingsStore.saveSettings({
    ...current,
    window: { width, height },
  })
}

async function createWindow(): Promise<BrowserWindow> {
  const isMac = process.platform === "darwin"
  const storageRoot = currentStorageRootPath()
  const appSettingsStore = createDesktopAppSettingsStore(storageRoot)

  let appSettings: PersistedAppSettings | null = null
  try {
    appSettings = await appSettingsStore.loadSettings()
  } catch {
    // Fall back to defaults on load failure.
  }

  const windowWidth =
    appSettings?.window.width ?? defaultAppSettings.window.width
  const windowHeight =
    appSettings?.window.height ?? defaultAppSettings.window.height

  const mainWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    show: !(isMeasureMode || isTRPCValidationMode),
    title: desktopAppName,
    backgroundColor: "#f5f5f5",
    ...(isMac
      ? {
          titleBarStyle: "hiddenInset" as const,
          trafficLightPosition: { x: 14, y: 14 },
        }
      : {}),
    webPreferences: {
      contextIsolation: true,
      preload: resolvePreloadPath(),
      sandbox: true,
    },
  })

  let resizeTimer: ReturnType<typeof setTimeout> | null = null
  let saveInFlight: Promise<void> = Promise.resolve()
  let closePhase: "idle" | "saving" | "ready" = "idle"

  mainWindow.on("resize", () => {
    if (resizeTimer) clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => {
      saveInFlight = saveWindowState(appSettingsStore).catch(() => {})
    }, 300)
  })

  mainWindow.on("close", (event) => {
    if (closePhase === "ready") {
      return
    }

    event.preventDefault()
    if (closePhase === "saving") {
      return
    }

    closePhase = "saving"
    if (resizeTimer) {
      clearTimeout(resizeTimer)
      resizeTimer = null
    }

    saveInFlight
      .then(() => saveWindowState(appSettingsStore))
      .catch(() => {
        // Best-effort persistence on shutdown.
      })
      .finally(() => {
        closePhase = "ready"
        if (!mainWindow.isDestroyed()) {
          mainWindow.close()
        }
        if (quitRequested) {
          app.quit()
        }
      })
  })

  if (!desktopRouter) {
    desktopRouter = createDesktopRouter({
      http: nodeHttpPort,
      courseStore: createDesktopCourseStore(storageRoot),
      appSettingsStore,
      userFile: desktopHost.userFilePort,
      gitCommand: nodeGitCommandPort,
      fileSystem: nodeFileSystemPort,
    })
  }

  if (!ipcHandler) {
    ipcHandler = createIPCHandler({
      router: desktopRouter,
      windows: [mainWindow],
    })
  } else {
    ipcHandler.attachWindow(mainWindow)
  }

  if (isTRPCValidationMode) {
    let validationSettled = false

    const validationPoll = setInterval(() => {
      void mainWindow.webContents
        .executeJavaScript(
          "document.querySelector('#repo-edu-trpc-marker')?.textContent ?? ''",
          true,
        )
        .then((markerText) => {
          if (
            typeof markerText === "string" &&
            markerText &&
            !validationSettled
          ) {
            validationSettled = true
            handleValidationMarker(markerText)
          }
        })
        .catch(() => {
          // Ignore validation polling errors during early page startup.
        })
    }, 50)

    const validationTimeout = setTimeout(() => {
      if (validationSettled) {
        return
      }

      validationSettled = true

      void mainWindow.webContents
        .executeJavaScript(
          "document.querySelector('#app')?.textContent ?? ''",
          true,
        )
        .then((textContent) => {
          process.stdout.write(
            `${JSON.stringify({
              marker: trpcMarker,
              timeout: true,
              textContent,
            })}\n`,
          )
        })
        .finally(() => {
          app.quit()
        })
    }, 2000)

    mainWindow.on("closed", () => {
      clearInterval(validationPoll)
      clearTimeout(validationTimeout)
    })
  }

  const rendererUrl = resolveRendererUrl()

  if (isMeasureMode) {
    mainWindow.webContents.once("did-finish-load", () => {
      const didFinishLoadMs = Number(
        (performance.now() - startupStartedAt).toFixed(2),
      )

      process.stdout.write(
        `${JSON.stringify({
          marker: startupMarker,
          didFinishLoadMs,
        })}\n`,
      )

      setTimeout(() => {
        app.quit()
      }, 50)
    })
  }

  await mainWindow.loadURL(rendererUrl)

  return mainWindow
}

if (hasSingleInstanceLock) {
  app.whenReady().then(async () => {
    storageRootPath = resolveStorageRootPath()
    bindUpdaterMenu()

    app.on("before-quit", () => {
      quitRequested = true
    })

    const seededFixture =
      await seedDesktopFixtureFromEnvironment(storageRootPath)
    if (seededFixture) {
      validationCourseId = seededFixture.courseEntityId
      for (const fixturePath of seededFixture.artifactPaths) {
        desktopHost.queueUserFilePath(fixturePath)
      }
    }

    const userFileQueue = parsePathQueue(
      process.env.REPO_EDU_TEST_USER_FILE_QUEUE,
    )
    for (const path of userFileQueue) {
      desktopHost.queueUserFilePath(path)
    }

    const saveTargetQueue = parsePathQueue(
      process.env.REPO_EDU_TEST_SAVE_TARGET_QUEUE,
    )
    for (const path of saveTargetQueue) {
      desktopHost.queueSaveTargetPath(path)
    }

    const validationCourseOverride =
      process.env.REPO_EDU_VALIDATION_COURSE_ID?.trim()
    if (validationCourseOverride) {
      validationCourseId = validationCourseOverride
    }

    registerRendererHostIpcHandlers()
    const mainWindow = await createWindow()
    initAutoUpdater(mainWindow)

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        void createWindow().then((window) => {
          bindAutoUpdaterWindow(window)
        })
      }
    })
  })
}

process.on("uncaughtException", (error) => {
  process.stderr.write(
    `[desktop] uncaught-exception ${error.stack ?? error.message}\n`,
  )
})

process.on("unhandledRejection", (reason) => {
  const text =
    reason instanceof Error ? (reason.stack ?? reason.message) : String(reason)
  process.stderr.write(`[desktop] unhandled-rejection ${text}\n`)
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit()
  }
})

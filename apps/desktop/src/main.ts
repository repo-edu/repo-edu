import { mkdirSync } from "node:fs"
import { createRequire } from "node:module"
import os from "node:os"
import { delimiter, dirname, join, resolve } from "node:path"
import { performance } from "node:perf_hooks"
import { fileURLToPath, pathToFileURL } from "node:url"
import type { AppSettingsStore } from "@repo-edu/application"
import {
  defaultAppSettings,
  type PersistedAppSettings,
  resolveActiveLlmConnection,
} from "@repo-edu/domain/settings"
import {
  createNodeFileSystemPort,
  createNodeGitCommandPort,
  createNodeHttpPort,
  createNodeLlmPort,
} from "@repo-edu/host-node"
import {
  type CacheDatabaseHandle,
  createSqliteCache,
  openCacheDatabase,
} from "@repo-edu/host-node/cache"
import {
  createExaminationArchiveStorage,
  type ExaminationArchiveDatabaseHandle,
  openExaminationArchiveDatabase,
} from "@repo-edu/host-node/examination-archive"
import type {
  ExaminationArchiveStoragePort,
  LlmPort,
  LlmRunRequest,
  LlmRunResult,
  PersistentCache,
} from "@repo-edu/host-runtime-contract"
import { createLlmTextClient } from "@repo-edu/integrations-llm"
import type {
  LlmRuntimeConfig,
  LlmTextClient,
} from "@repo-edu/integrations-llm-contract"
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
import { envDisableCache } from "./env-flags"
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
// Stable LLM port delegate. The underlying adapter is rebuilt whenever the
// active LLM connection or its credentials change so a settings save reaches
// the next workflow invocation without recreating the tRPC router.
let activeLlmPort: LlmPort = createNodeLlmPort()
const nodeLlmPort: LlmPort = {
  run(request: LlmRunRequest): Promise<LlmRunResult> {
    return activeLlmPort.run(request)
  },
}

export function createDraftLlmTextClient(draft: {
  provider: "claude" | "codex"
  authMode: "subscription" | "api"
  apiKey: string
}): LlmTextClient {
  const config = configForDraft(draft)
  return createLlmTextClient(config)
}

function configForDraft(draft: {
  provider: "claude" | "codex"
  authMode: "subscription" | "api"
  apiKey: string
}): LlmRuntimeConfig {
  const providerConfig =
    draft.authMode === "subscription"
      ? { authMode: draft.authMode }
      : { authMode: draft.authMode, apiKey: draft.apiKey }
  return draft.provider === "claude"
    ? { claude: providerConfig }
    : { codex: providerConfig }
}

function configFromSettings(settings: PersistedAppSettings): LlmRuntimeConfig {
  const active = resolveActiveLlmConnection(settings)
  if (active === null) return {}
  const providerConfig =
    active.authMode === "subscription"
      ? { authMode: active.authMode }
      : { authMode: active.authMode, apiKey: active.apiKey }
  return active.provider === "claude"
    ? { claude: providerConfig }
    : { codex: providerConfig }
}

function rebuildLlmPort(settings: PersistedAppSettings | null): void {
  activeLlmPort = createNodeLlmPort(
    settings === null ? undefined : configFromSettings(settings),
  )
}
let desktopRouter: DesktopRouter | null = null
let ipcHandler: ReturnType<typeof createIPCHandler<DesktopRouter>> | null = null
let hostIpcRegistered = false
let storageRootPath: string | null = null
let validationCourseId = ""
let updaterMenuBound = false
let quitRequested = false
let cacheDatabaseHandle: CacheDatabaseHandle | null = null
let cacheDatabaseClosed = false
let examinationArchiveHandle: ExaminationArchiveDatabaseHandle | null = null
let examinationArchiveClosed = false
export const shutdownController = new AbortController()
export type DesktopCacheSet = {
  analysisCache: PersistentCache
  blameCache: PersistentCache
}
let desktopCacheSet: DesktopCacheSet | null = null
let desktopExaminationArchive: ExaminationArchiveStoragePort | null = null
let inFlightWorkflowCount = 0
const inFlightDrainWaiters = new Set<() => void>()

const MB = 1024 * 1024

type EffectiveCacheBudgets = {
  sizeMB: { analysisMB: number; blameMB: number }
  hotMB: { analysisMB: number; blameMB: number }
  enabled: boolean
}

function resolveEffectiveCacheBudgets(
  settings: PersistedAppSettings | null,
): EffectiveCacheBudgets {
  const base = settings ?? defaultAppSettings
  return {
    sizeMB: {
      analysisMB: base.cacheSizeBudgetMB.analysisMB,
      blameMB: base.cacheSizeBudgetMB.blameMB,
    },
    hotMB: {
      analysisMB: base.cacheHotBudgetMB.analysisMB,
      blameMB: base.cacheHotBudgetMB.blameMB,
    },
    enabled: base.cacheEnabled && !envDisableCache(),
  }
}

function openCacheSetOnce(
  storageRoot: string,
  settings: PersistedAppSettings | null,
): DesktopCacheSet {
  if (desktopCacheSet) return desktopCacheSet
  const budgets = resolveEffectiveCacheBudgets(settings)

  const cacheDir = join(storageRoot, "cache")
  mkdirSync(cacheDir, { recursive: true })

  const handle = openCacheDatabase({ dbPath: join(cacheDir, "cache.db") })
  cacheDatabaseHandle = handle

  const analysisCache = createSqliteCache({
    handle,
    table: "analysis_cache",
    maxBytes: budgets.sizeMB.analysisMB * MB,
  })
  const blameCache = createSqliteCache({
    handle,
    table: "blame_cache",
    maxBytes: budgets.sizeMB.blameMB * MB,
  })

  desktopCacheSet = { analysisCache, blameCache }
  return desktopCacheSet
}

function openExaminationArchiveOnce(
  storageRoot: string,
): ExaminationArchiveStoragePort {
  if (desktopExaminationArchive) return desktopExaminationArchive
  const archiveDir = join(storageRoot, "examinations")
  mkdirSync(archiveDir, { recursive: true })
  const handle = openExaminationArchiveDatabase({
    dbPath: join(archiveDir, "archive.db"),
  })
  examinationArchiveHandle = handle
  const archive = createExaminationArchiveStorage({ handle })
  desktopExaminationArchive = archive
  return archive
}

function closeCacheDatabase() {
  if (cacheDatabaseClosed) return
  cacheDatabaseClosed = true
  const caches = desktopCacheSet
  if (caches) {
    for (const cache of [caches.analysisCache, caches.blameCache]) {
      try {
        cache.close()
      } catch {
        // Best-effort — each cache flushes independent touch metadata.
      }
    }
  }
  const handle = cacheDatabaseHandle
  desktopCacheSet = null
  if (!handle) return
  try {
    handle.close()
  } catch {
    // Best-effort — WAL durability survives close failures.
  }
  cacheDatabaseHandle = null
}

function closeExaminationArchiveDatabase() {
  if (examinationArchiveClosed) return
  examinationArchiveClosed = true
  const handle = examinationArchiveHandle
  if (!handle) return
  try {
    handle.close()
  } catch {
    // Best-effort — WAL durability survives close failures.
  }
  examinationArchiveHandle = null
  desktopExaminationArchive = null
}

function markWorkflowInvocationStarted(): () => void {
  inFlightWorkflowCount += 1
  let settled = false
  return () => {
    if (settled) return
    settled = true
    inFlightWorkflowCount = Math.max(0, inFlightWorkflowCount - 1)
    if (inFlightWorkflowCount === 0) {
      for (const resolve of inFlightDrainWaiters) {
        resolve()
      }
      inFlightDrainWaiters.clear()
    }
  }
}

function waitForInFlightWorkflows(timeoutMs: number): Promise<boolean> {
  if (inFlightWorkflowCount === 0) {
    return Promise.resolve(true)
  }

  return new Promise((resolve) => {
    let settled = false
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    const onDrained = () => {
      finish(true)
    }
    const finish = (drained: boolean) => {
      if (settled) return
      settled = true
      inFlightDrainWaiters.delete(onDrained)
      if (timeoutId !== null) {
        clearTimeout(timeoutId)
      }
      resolve(drained)
    }

    inFlightDrainWaiters.add(onDrained)
    timeoutId = setTimeout(() => {
      finish(false)
    }, timeoutMs)

    // Handle a settle race between the initial count check and waiter registration.
    if (inFlightWorkflowCount === 0) {
      finish(true)
    }
  })
}

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
    const caches = openCacheSetOnce(storageRoot, appSettings)
    const examinationArchive = openExaminationArchiveOnce(storageRoot)
    rebuildLlmPort(appSettings)
    desktopRouter = createDesktopRouter({
      http: nodeHttpPort,
      courseStore: createDesktopCourseStore(storageRoot),
      appSettingsStore,
      userFile: desktopHost.userFilePort,
      gitCommand: nodeGitCommandPort,
      fileSystem: nodeFileSystemPort,
      llm: nodeLlmPort,
      caches,
      examinationArchive,
      cacheBudgets: resolveEffectiveCacheBudgets(appSettings),
      parentAbortSignal: shutdownController.signal,
      onWorkflowInvocationStart: markWorkflowInvocationStarted,
      onAppSettingsSaved: rebuildLlmPort,
      createDraftLlmTextClient,
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

    let shutdownPhase: "idle" | "draining" | "ready" = "idle"
    app.on("before-quit", (event) => {
      quitRequested = true
      if (shutdownPhase === "ready") return
      // Shutdown: signal in-flight workflows to abort, give them a bounded
      // grace period so mid-commit cache writes complete, then close the DB.
      const gracePeriodMs = 5_000
      event.preventDefault()
      if (shutdownPhase === "draining") return
      shutdownPhase = "draining"
      if (!shutdownController.signal.aborted) {
        try {
          shutdownController.abort()
        } catch {
          // Node ignores abort on already-aborted signals; swallow other errors.
        }
      }
      void (async () => {
        await waitForInFlightWorkflows(gracePeriodMs)
        // Both databases run in WAL mode: closing checkpoints the WAL and any
        // acknowledged write is already on disk. Close even on a forced quit
        // so the archive (where data is not regenerable) never stays open.
        closeCacheDatabase()
        closeExaminationArchiveDatabase()
      })()
        .catch((error) => {
          // Close paths already catch internally; anything reaching here is
          // unexpected. Surface it to stderr so the quit still completes.
          const text =
            error instanceof Error
              ? (error.stack ?? error.message)
              : String(error)
          process.stderr.write(`[desktop] shutdown-drain-failed ${text}\n`)
        })
        .finally(() => {
          shutdownPhase = "ready"
          app.quit()
        })
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

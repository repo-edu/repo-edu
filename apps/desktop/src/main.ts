import { randomUUID } from "node:crypto"
import { mkdirSync, rmSync } from "node:fs"
import { createRequire } from "node:module"
import os from "node:os"
import { delimiter, dirname, join } from "node:path"
import { performance } from "node:perf_hooks"
import { fileURLToPath, pathToFileURL } from "node:url"
import { createSettingsWorkflowHandlers } from "@repo-edu/application"
import type { AppSettingsLoadResult } from "@repo-edu/application-contract"
import {
  defaultAppCredentials,
  type PersistedAppCredentials,
} from "@repo-edu/domain/settings"
import {
  claimProgramGate,
  createNodeFileSystemPort,
  createNodeGitCommandPort,
  createNodeHttpPort,
  createNodeLlmPort,
  createNodeLlmTextClient,
  createNodeProcessPort,
  createNodeTokenizerPort,
  isProgramGateArtifactProbe,
  type ProgramGateClaim,
  programConflictMessage,
  resolveRepoEduAppDataRoot,
  waitForProgramGateArtifactProbeRelease,
  writeProgramGateArtifactProbeMarker,
} from "@repo-edu/host-node"
import {
  createExaminationArchiveStorage,
  type ExaminationArchiveDatabaseHandle,
  openExaminationArchiveDatabase,
} from "@repo-edu/host-node/examination-archive"
import {
  createWindowsChildProcessLifetimeAdapter,
  resolveWindowsChildProcessLifetimeLauncherEntryUrl,
} from "@repo-edu/host-node/windows-child-lifetime"
import type {
  ExaminationArchiveStoragePort,
  LlmPort,
  LlmRunRequest,
  LlmRunResult,
  LlmStreamEvent,
} from "@repo-edu/host-runtime-contract"
import type {
  LlmRuntimeConfig,
  LlmTextClient,
} from "@repo-edu/integrations-llm-contract"
import {
  app,
  BrowserWindow,
  dialog,
  type IpcMainEvent,
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
import {
  isChildLifetimeArtifactProbe,
  runChildLifetimeArtifactProbe,
} from "./child-lifetime-artifact-probe"
import { createDesktopChildProcessLifetimeController } from "./child-process-lifetime"
import { resolveUnpackedCodexBinaryPath } from "./codex-binary"
import { createDesktopCodexSdkHostCommand } from "./codex-sdk-host-command"
import { createDesktopCourseStore } from "./course-store"
import { createDesktopHostEnvironment } from "./desktop-host"
import { desktopLlmRuntimeConfigFromSettings } from "./llm-runtime-config"
import {
  runWindowCloseAdmission,
  type WindowCloseAdmission,
} from "./renderer-close"
import {
  type DesktopRendererHostBridge,
  desktopRendererHostChannels,
} from "./renderer-host-bridge"
import { createDesktopAppSettingsStore } from "./settings-store"
import { createDesktopShutdown } from "./shutdown"
import type { DesktopRouter } from "./trpc"
import { createDesktopRouter } from "./trpc"
import {
  defaultDesktopWindowState,
  loadDesktopWindowState,
  saveDesktopWindowState,
} from "./window-state-store"

const desktopAppName = "Repo Edu"

function desktopErrorText(error: unknown): string {
  return error instanceof Error ? (error.stack ?? error.message) : String(error)
}

function desktopErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function terminateDesktop(label: string, error: unknown): void {
  process.stderr.write(`[desktop] ${label} ${desktopErrorText(error)}\n`)
  app.exit(1)
}

process.on("uncaughtException", (error) => {
  terminateDesktop("uncaught-exception", error)
})

process.on("unhandledRejection", (reason) => {
  terminateDesktop("unhandled-rejection", reason)
})

const { createIPCHandler } = createRequire(import.meta.url)(
  "trpc-electron/main",
) as typeof import("trpc-electron/main")

const startupMarker = "repo-edu-desktop-cold-start"
const trpcMarker = "repo-edu-desktop-trpc"
const docsWebsiteUrl = "https://repo-edu.github.io/repo-edu/"
const startupStartedAt = performance.now()
const isMeasureMode = process.env.REPO_EDU_DESKTOP_MEASURE === "1"
const isTRPCValidationMode = process.env.REPO_EDU_DESKTOP_VALIDATE_TRPC === "1"
const trpcValidationTimeoutMs = readPositiveIntegerEnv(
  "REPO_EDU_DESKTOP_VALIDATE_TRPC_TIMEOUT_MS",
  10_000,
)

const currentDir = dirname(fileURLToPath(import.meta.url))
const codexSdkHostCommand = createDesktopCodexSdkHostCommand({
  currentDir,
  executablePath: process.execPath,
})
const desktopHost = createDesktopHostEnvironment()
const childProcessLifetimeController =
  createDesktopChildProcessLifetimeController({
    appName: desktopAppName,
    showWarning: (title, message) =>
      dialog.showMessageBoxSync({
        buttons: ["OK"],
        message,
        title,
        type: "warning",
      }),
    writeStderr: (message) => process.stderr.write(message),
    windowsAdapter:
      process.platform === "win32"
        ? createWindowsChildProcessLifetimeAdapter({
            executablePath: process.execPath,
            launcherEntryPath: app.isPackaged
              ? join(
                  process.resourcesPath,
                  "host-child-lifetime",
                  "windows-launcher.cjs",
                )
              : fileURLToPath(
                  resolveWindowsChildProcessLifetimeLauncherEntryUrl(),
                ),
            runAsNode: true,
          })
        : undefined,
  })
const nodeHttpPort = createNodeHttpPort()
const nodeGitCommandPort = createNodeGitCommandPort(
  createNodeProcessPort(childProcessLifetimeController),
)
const nodeFileSystemPort = createNodeFileSystemPort()
const nodeTokenizerPort = createNodeTokenizerPort()
// Stable LLM port delegate. The underlying adapter is rebuilt whenever the
// active LLM connection or its credentials change so a settings save reaches
// the next workflow invocation without recreating the tRPC router.
let activeLlmPort: LlmPort = createNodeLlmPort(
  childProcessLifetimeController,
  undefined,
  { codexSdkHost: codexSdkHostCommand },
)
const nodeLlmPort: LlmPort = {
  run(request: LlmRunRequest): Promise<LlmRunResult> {
    return activeLlmPort.run(request)
  },
  stream(request: LlmRunRequest): AsyncIterable<LlmStreamEvent> {
    return activeLlmPort.stream(request)
  },
}

// Packaged builds need an explicit Codex binary path: the SDK otherwise
// resolves a non-spawnable `app.asar` path. In development the SDK resolves the
// binary from node_modules directly, so no override is needed.
const packagedCodexBinaryPath = app.isPackaged
  ? resolveUnpackedCodexBinaryPath(process.resourcesPath)
  : undefined

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) {
    return fallback
  }

  const value = Number.parseInt(raw, 10)
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`)
  }
  return value
}

export function createDraftLlmTextClient(draft: {
  provider: "claude" | "codex"
  authMode: "subscription" | "api"
  apiKey: string
  maxTokens?: number
}): LlmTextClient {
  const config = configForDraft(draft)
  return createNodeLlmTextClient(childProcessLifetimeController, config, {
    codexSdkHost: codexSdkHostCommand,
  })
}

function configForDraft(draft: {
  provider: "claude" | "codex"
  authMode: "subscription" | "api"
  apiKey: string
  maxTokens?: number
}): LlmRuntimeConfig {
  const providerConfig =
    draft.authMode === "subscription"
      ? { authMode: draft.authMode }
      : { authMode: draft.authMode, apiKey: draft.apiKey }
  if (draft.provider === "claude") {
    return {
      claude:
        draft.authMode === "api"
          ? {
              ...providerConfig,
              maxTokens: draft.maxTokens,
            }
          : providerConfig,
    }
  }
  return { codex: { ...providerConfig, binaryPath: packagedCodexBinaryPath } }
}

function configFromSettings(
  settings: PersistedAppCredentials,
): LlmRuntimeConfig {
  return desktopLlmRuntimeConfigFromSettings(settings, {
    codexBinaryPath: packagedCodexBinaryPath,
  })
}

// Identifies the LLM-relevant credential subset (connection records and the
// active LLM id). The port always carries the host Codex binary carrier, so
// only a change to this subset can alter the resolved runtime config.
function llmCredentialsSubsetKey(credentials: PersistedAppCredentials): string {
  return JSON.stringify({
    activeLlmConnectionId: credentials.activeLlmConnectionId,
    llmConnections: credentials.llmConnections,
  })
}

let activeLlmCredentialsKey = llmCredentialsSubsetKey(defaultAppCredentials)

function rebuildLlmPort(settings: PersistedAppCredentials | null): void {
  // The Codex binary path is a host constant the SDK needs in packaged builds,
  // so seed the port even when no credentials loaded: absent credentials
  // resolve to no active connection and contribute only the host carrier.
  const resolved = settings ?? defaultAppCredentials
  activeLlmCredentialsKey = llmCredentialsSubsetKey(resolved)
  activeLlmPort = createNodeLlmPort(
    childProcessLifetimeController,
    configFromSettings(resolved),
    { codexSdkHost: codexSdkHostCommand },
  )
}

// Credential saves rebuild the port only when the LLM subset changes, so an
// LMS or Git connection edit does not churn the provider SDK clients.
function rebuildLlmPortIfCredentialsChanged(
  credentials: PersistedAppCredentials,
): void {
  if (llmCredentialsSubsetKey(credentials) === activeLlmCredentialsKey) {
    return
  }
  rebuildLlmPort(credentials)
}
let desktopRouter: DesktopRouter | null = null
let ipcHandler: ReturnType<typeof createIPCHandler<DesktopRouter>> | null = null
let hostIpcRegistered = false
let storageRootPath: string | null = null
let validationCourseId = ""
let updaterMenuBound = false
let quitRequested = false
let examinationArchiveHandle: ExaminationArchiveDatabaseHandle | null = null
let examinationArchiveClosed = false
export const shutdownController = new AbortController()
let desktopExaminationArchive: ExaminationArchiveStoragePort | null = null
let inFlightWorkflowCount = 0
const inFlightDrainWaiters = new Set<() => void>()

function openExaminationArchiveOnce(
  storageRoot: string,
): ExaminationArchiveStoragePort {
  if (desktopExaminationArchive) return desktopExaminationArchive
  const archiveDir = join(storageRoot, "examinations")
  mkdirSync(archiveDir, { recursive: true })
  const dbPath = join(archiveDir, "archive.db")
  const handle = openOrRecreateExaminationArchive(dbPath)
  examinationArchiveHandle = handle
  const archive = createExaminationArchiveStorage({ handle })
  desktopExaminationArchive = archive
  return archive
}

// The archive opener throws on any unexpected `user_version`. When the
// mismatch is from an older known schema the archive is unrecoverable
// (column shape changed), so recreate the file and continue rather than
// crash window startup. WAL/SHM siblings come along to keep SQLite from
// reattaching to a half-deleted database.
function openOrRecreateExaminationArchive(dbPath: string) {
  try {
    return openExaminationArchiveDatabase({ dbPath })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!/unsupported user_version/.test(message)) throw error
    for (const path of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
      rmSync(path, { force: true })
    }
    return openExaminationArchiveDatabase({ dbPath })
  }
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

// repo-edu persists its own secrets (LLM API keys) as plain JSON via the
// settings store and never uses Electron `safeStorage`. Force Chromium's
// OSCrypt onto the in-process `basic` backend so the app never queries the
// Linux Secret Service / login keyring on startup. Without this, a locked or
// password-mismatched keyring blocks launch behind a GNOME unlock prompt for
// an encryption key the app does not depend on.
if (process.platform === "linux") {
  app.commandLine.appendSwitch("password-store", "basic")
}

const hasSingleInstanceLock = app.requestSingleInstanceLock()

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
  return resolveRepoEduAppDataRoot({
    platform: process.platform,
    platformAppDataDirectory: app.getPath("appData"),
  })
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

async function saveWindowState(storageRoot: string) {
  const mainWindow = BrowserWindow.getAllWindows()[0]
  if (!mainWindow) return

  const [width, height] = mainWindow.getSize()
  await saveDesktopWindowState(storageRoot, { width, height })
}

async function createWindow(): Promise<BrowserWindow> {
  const isMac = process.platform === "darwin"
  const storageRoot = currentStorageRootPath()
  const appSettingsStore = createDesktopAppSettingsStore(storageRoot)

  const windowState = await loadDesktopWindowState(storageRoot).catch(
    () => defaultDesktopWindowState,
  )

  const mainWindow = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
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

  const windowCloseAdmission = (): WindowCloseAdmission => {
    if (isTRPCValidationMode) {
      return { owner: "main-process" }
    }

    return {
      owner: "renderer-session",
      requestId: randomUUID(),
      target: {
        isUnavailable: () =>
          mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed(),
        setEnabled: (enabled) => mainWindow.setEnabled(enabled),
        send: (channel, payload) =>
          mainWindow.webContents.send(channel, payload),
      },
      transport: {
        subscribe: (channel, listener) => {
          const handler = (event: IpcMainEvent, response: unknown) => {
            if (event.sender === mainWindow.webContents) listener(response)
          }
          ipcMain.on(channel, handler)
          return () => ipcMain.removeListener(channel, handler)
        },
      },
      channels: {
        request: desktopRendererHostChannels.requestClose,
        cancel: desktopRendererHostChannels.cancelClose,
        complete: desktopRendererHostChannels.closeComplete,
        cancelComplete: desktopRendererHostChannels.closeCancelComplete,
      },
      log: (message) => process.stderr.write(`[desktop] ${message}\n`),
    }
  }

  mainWindow.on("resize", () => {
    if (resizeTimer) clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => {
      saveInFlight = saveWindowState(storageRoot).catch(() => {})
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

    void (async () => {
      const closeAdmitted = await runWindowCloseAdmission(
        windowCloseAdmission(),
      )
      if (!closeAdmitted) {
        closePhase = "idle"
        quitRequested = false
        return
      }

      try {
        await saveInFlight
        await saveWindowState(storageRoot)
      } catch {
        // Best-effort window-state persistence on shutdown.
      } finally {
        closePhase = "ready"
        const shouldQuitAfterClose = quitRequested
        if (shouldQuitAfterClose) {
          mainWindow.once("closed", () => {
            if (quitRequested) {
              app.quit()
            }
          })
        }
        if (!mainWindow.isDestroyed()) {
          mainWindow.close()
        } else if (shouldQuitAfterClose) {
          app.quit()
        }
      }
    })().catch((error) => {
      const text = error instanceof Error ? error.message : String(error)
      process.stderr.write(`[desktop] close-failed ${text}\n`)
      closePhase = "idle"
      quitRequested = false
      if (!mainWindow.isDestroyed()) mainWindow.setEnabled(true)
    })
  })

  if (!desktopRouter) {
    let initialSettingsLoadResult: AppSettingsLoadResult | null = null
    let initialSettingsLoadError: unknown
    try {
      initialSettingsLoadResult =
        await createSettingsWorkflowHandlers(appSettingsStore)[
          "settings.loadApp"
        ](undefined)
    } catch (error) {
      initialSettingsLoadError = error
    }

    const examinationArchive = openExaminationArchiveOnce(storageRoot)
    rebuildLlmPort(initialSettingsLoadResult?.credentials ?? null)
    desktopRouter = createDesktopRouter({
      http: nodeHttpPort,
      courseStore: createDesktopCourseStore(storageRoot),
      appSettingsStore,
      userFile: desktopHost.userFilePort,
      gitCommand: nodeGitCommandPort,
      fileSystem: nodeFileSystemPort,
      llm: nodeLlmPort,
      tokenizer: nodeTokenizerPort,
      examinationArchive,
      initialSettingsLoadResult: initialSettingsLoadResult ?? undefined,
      initialSettingsLoadError,
      parentAbortSignal: shutdownController.signal,
      onWorkflowInvocationStart: markWorkflowInvocationStarted,
      onAppCredentialsSaved: rebuildLlmPortIfCredentialsChanged,
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
    }, trpcValidationTimeoutMs)

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

async function startDesktop(): Promise<void> {
  bindUpdaterMenu()

  const shutdown = createDesktopShutdown({
    abortWorkflows() {
      if (!shutdownController.signal.aborted) {
        shutdownController.abort()
      }
    },
    beginWindowClose() {
      quitRequested = true
      const liveWindows = BrowserWindow.getAllWindows().filter(
        (window) => !window.isDestroyed(),
      )
      for (const window of liveWindows) {
        window.close()
      }
      return liveWindows.length > 0
    },
    closeArchive: closeExaminationArchiveDatabase,
    fail(error) {
      terminateDesktop("shutdown-drain-failed", error)
    },
    quit() {
      app.quit()
    },
    stopAndConfirmChildProcesses() {
      return childProcessLifetimeController.stopAndConfirm()
    },
    waitForWorkflows() {
      return waitForInFlightWorkflows(5_000)
    },
  })
  app.on("before-quit", shutdown.beforeQuit)

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
      void createWindow()
        .then((window) => {
          bindAutoUpdaterWindow(window)
        })
        .catch((error) => {
          terminateDesktop("activate-failed", error)
        })
    }
  })
}

function reportProgramGateFailure(message: string): void {
  dialog.showErrorBox(`${desktopAppName} could not start`, message)
  app.exit(1)
}

async function bootstrapDesktop(): Promise<void> {
  if (isChildLifetimeArtifactProbe()) {
    await runChildLifetimeArtifactProbe({
      childProcessLifetimeController,
      codexSdkHostCommand,
      resourcesPath: process.resourcesPath,
      executablePath: process.execPath,
      isPackaged: app.isPackaged,
    })
    app.exit(0)
    return
  }

  const artifactProbe = isProgramGateArtifactProbe()
  let claim: ProgramGateClaim
  let claimStartedAt = 0
  try {
    storageRootPath = resolveStorageRootPath()
    claimStartedAt = performance.now()
    claim = await claimProgramGate(storageRootPath)
  } catch (error) {
    reportProgramGateFailure(
      `Program gate failed: ${desktopErrorMessage(error)}`,
    )
    return
  }
  const claimDurationMs = performance.now() - claimStartedAt

  if (claim.status === "busy") {
    if (artifactProbe) {
      await writeProgramGateArtifactProbeMarker("busy", claimDurationMs)
      process.stderr.write(`${programConflictMessage}\n`)
      app.exit(1)
      return
    }
    reportProgramGateFailure(programConflictMessage)
    return
  }

  // The listener retains the connection for the full process lifetime and
  // closes it only when no further product work can run.
  process.once("exit", claim.release)

  if (artifactProbe) {
    await writeProgramGateArtifactProbeMarker("held", claimDurationMs)
    await waitForProgramGateArtifactProbeRelease()
    app.exit(0)
    return
  }

  await app.whenReady()
  await startDesktop()
}

if (hasSingleInstanceLock) {
  void bootstrapDesktop().catch((error) => {
    terminateDesktop("startup-failed", error)
  })
} else {
  app.quit()
}

app.on("window-all-closed", () => {
  app.quit()
})

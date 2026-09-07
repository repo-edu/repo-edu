import os from "node:os"
import { delimiter, dirname, join } from "node:path"
import { performance } from "node:perf_hooks"
import { fileURLToPath, pathToFileURL } from "node:url"
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
import type { ExaminationArchiveDatabaseHandle } from "@repo-edu/host-node/examination-archive"
import { createWindowsChildProcessLifetimeAdapter } from "@repo-edu/host-node/windows-child-lifetime"
import type {
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
  ipcMain,
  Menu,
  type MenuItemConstructorOptions,
  MessageChannelMain,
  nativeTheme,
  shell,
} from "electron"
import {
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
import { loadDesktopBootstrap } from "./desktop-bootstrap"
import { installDesktopEntryGateway } from "./desktop-entry-gateway"
import { createDesktopHostEnvironment } from "./desktop-host"
import { createDesktopMenuTemplate } from "./desktop-menu"
import { installDesktopSessionLifetime } from "./desktop-session-lifetime"
import { endDesktopHost, isDesktopEnding } from "./desktop-terminal"
import { installDesktopTerminalSources } from "./desktop-terminal-sources"
import type { DesktopDirectMessage } from "./desktop-wire"
import { HostAdmission } from "./host-admission"
import type { HostAdmissionEffect, HostRequest } from "./host-admission-model"
import { desktopLlmRuntimeConfigFromSettings } from "./llm-runtime-config"
import {
  createDesktopWorkflowRegistry,
  createDesktopWorkflowRouter,
} from "./trpc"
import { saveDesktopWindowState } from "./window-state-store"
import {
  resolveDevelopmentWindowsChildLifetimeRuntime,
  resolvePackagedWindowsChildLifetimeRuntime,
} from "./windows-child-lifetime-runtime"

/** Performs all pre-ready installation synchronously; importing this module starts nothing. */
export function installDesktopApplication(): void {
  // Every switch must precede both exclusion mechanisms and Electron readiness.
  if (process.platform === "linux") {
    // Repo Edu does not use safeStorage or the Linux login keyring.
    app.commandLine.appendSwitch("password-store", "basic")
  }
  if (!app.requestSingleInstanceLock()) {
    app.exit(0)
    return
  }

  const desktopAppName = "Repo Edu"

  function desktopErrorText(error: unknown): string {
    return error instanceof Error
      ? (error.stack ?? error.message)
      : String(error)
  }

  function desktopErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
  }

  const startupMarker = "repo-edu-desktop-cold-start"
  const trpcMarker = "repo-edu-desktop-trpc"
  const docsWebsiteUrl = "https://repo-edu.github.io/repo-edu/"
  const startupStartedAt = performance.now()
  const isMeasureMode = process.env.REPO_EDU_DESKTOP_MEASURE === "1"
  const isTRPCValidationMode =
    process.env.REPO_EDU_DESKTOP_VALIDATE_TRPC === "1"
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
      showWarning: (title, message) => {
        // Shutdown presents one fatal warning from the controller's ending.
        if (isDesktopEnding(admission.getSnapshot())) return
        dialog.showMessageBoxSync({
          buttons: ["OK"],
          message,
          title,
          type: "warning",
        })
      },
      writeStderr: (message) => process.stderr.write(message),
      windowsAdapter:
        process.platform === "win32"
          ? createWindowsChildProcessLifetimeAdapter(
              app.isPackaged
                ? resolvePackagedWindowsChildLifetimeRuntime(
                    process.resourcesPath,
                    process.execPath,
                  )
                : resolveDevelopmentWindowsChildLifetimeRuntime(
                    currentDir,
                    process.execPath,
                  ),
            )
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

  function createDraftLlmTextClient(draft: {
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
  function llmCredentialsSubsetKey(
    credentials: PersistedAppCredentials,
  ): string {
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
  let desktopGateway: ReturnType<typeof installDesktopEntryGateway> | null =
    null
  let storageRootPath: string | null = null
  let validationCourseId = ""
  let updaterMenuBound = false
  let examinationArchiveHandle: ExaminationArchiveDatabaseHandle | null = null
  let examinationArchiveClosed = false
  const admission = new HostAdmission(performAdmissionEffect)
  const terminalSources = installDesktopTerminalSources({
    app,
    process,
    terminal: admission.terminal,
  })

  function closeRequest(): HostRequest {
    return { cancel() {} }
  }

  function requestUpdateRestart(): void {
    admission.dispatch({ type: "update-restart", request: closeRequest() })
  }

  function performAdmissionEffect(effect: HostAdmissionEffect): void {
    if (effect.type === "disable-input") {
      disableInput()
      return
    }
    // The request transport sends admission and preparation on the retained port.
    if (effect.type === "prepare-command") return
    // The validated input receiver owns the async handler body after this
    // reducer transition has established executing.running.
    if (effect.type === "execute-command") return
    // The preparation sender must publish committed stamps before cancellation.
    if (effect.type === "settle-cancelled-preparation") return
    if (effect.type === "release-command") {
      desktopGateway?.requests.release(effect.request)
      return
    }
    if (effect.type === "prepare-close") {
      const mainWindow = BrowserWindow.getAllWindows()[0]
      if (!mainWindow || isTRPCValidationMode) {
        admission.dispatch({ type: "close-ready", request: effect.request })
        return
      }
      mainWindow.setEnabled(false)
      if (!desktopGateway) {
        admission.terminal(
          new Error("The interactive desktop has no entry gateway."),
        )
        return
      }
      desktopGateway.prepareClose(effect.request)
      return
    }
    if (effect.type === "end-host") {
      void endDesktopHost({
        reason: effect.reason,
        controller: childProcessLifetimeController,
        snapshot: admission.getSnapshot,
        disableInput,
        closeStorage: closeExaminationArchiveDatabase,
        warn: (message) =>
          dialog.showErrorBox(
            `${desktopAppName} could not confirm shutdown`,
            message,
          ),
        report: (error) => {
          process.stderr.write(
            `[desktop] shutdown-failed ${desktopErrorText(error)}\n`,
          )
        },
        exit: (code) => app.exit(code),
        installUpdate: quitAndInstall,
      })
      return
    }
    // Request-port execution is connected by the later command steps.
    admission.terminal(new Error(`Unconnected request effect: ${effect.type}`))
  }

  function disableInput(): void {
    for (const window of BrowserWindow.getAllWindows()) window.setEnabled(false)
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
  }

  app.setName(desktopAppName)
  installDesktopSessionLifetime({
    app,
    getWindow: () => BrowserWindow.getAllWindows()[0],
    close: () => app.quit(),
  })
  app.on("before-quit", (event) => {
    event.preventDefault()
    admission.dispatch({
      type: "host-start",
      source: "application-quit",
      request: closeRequest(),
    })
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
          admission.dispatch({
            type: "host-start",
            source: "menu-update-restart",
            request: closeRequest(),
          })
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

  function installApplicationMenu() {
    const template = createDesktopMenuTemplate({
      isMac: process.platform === "darwin",
      appName: desktopAppName,
      updateItems: buildUpdateMenuItems(),
      documentation: () => {
        void shell.openExternal(docsWebsiteUrl)
      },
      about: () => {
        void showAboutDialog()
      },
      close: () => {
        admission.dispatch({
          type: "host-start",
          source: "menu-close",
          request: closeRequest(),
        })
      },
      quit: () => {
        admission.dispatch({
          type: "host-start",
          source: "menu-quit",
          request: closeRequest(),
        })
      },
    })
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
  function runRendererHostAction(
    parent: BrowserWindow,
    message: DesktopDirectMessage,
  ) {
    switch (message.action) {
      case "pickUserFile":
        admission.admitShell(message.action)
        return desktopHost.pickUserFile(parent, message.input)
      case "pickSaveTarget":
        admission.admitShell(message.action)
        return desktopHost.pickSaveTarget(parent, message.input)
      case "pickDirectory":
        admission.admitShell(message.action)
        return desktopHost.pickDirectory(parent, message.input)
      case "setNativeTheme":
        admission.admitShell(message.action)
        nativeTheme.themeSource = message.input
        return
      case "downloadUpdate":
        admission.admitShell(message.action)
        return downloadUpdate()
      case "quitAndInstall":
        return requestUpdateRestart()
      case "bootstrapReady":
        if (
          admission.dispatch({ type: "bootstrap-acknowledged" }) !== "accepted"
        ) {
          throw new Error("The desktop could not accept bootstrap readiness.")
        }
    }
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

  async function createWindow(): Promise<BrowserWindow | null> {
    const isMac = process.platform === "darwin"
    const storageRoot = currentStorageRootPath()
    const {
      appSettingsStore,
      settings,
      courseStore,
      windowStateStore,
      windowState,
      archiveHandle,
      examinationArchive,
    } = await loadDesktopBootstrap(storageRoot, admission)
    if (admission.getSnapshot().phase !== "starting") {
      archiveHandle.close()
      return null
    }
    examinationArchiveHandle = archiveHandle

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
        devTools: !app.isPackaged,
      },
    })

    terminalSources.observeRenderer(mainWindow.webContents)
    let resizeTimer: ReturnType<typeof setTimeout> | null = null
    mainWindow.on("resize", () => {
      if (resizeTimer) clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => {
        saveDesktopWindowState(windowStateStore, mainWindow.getSize())
      }, 300)
    })

    mainWindow.on("close", (event) => {
      event.preventDefault()
      if (resizeTimer) {
        clearTimeout(resizeTimer)
        resizeTimer = null
      }
      saveDesktopWindowState(windowStateStore, mainWindow.getSize())
      admission.dispatch({
        type: "host-start",
        source: "window-close",
        request: closeRequest(),
      })
    })

    {
      rebuildLlmPort(settings.credentials)
      const desktopWorkflows = createDesktopWorkflowRegistry({
        http: nodeHttpPort,
        courseStore,
        appSettingsStore,
        userFile: desktopHost.userFilePort,
        gitCommand: nodeGitCommandPort,
        fileSystem: nodeFileSystemPort,
        llm: nodeLlmPort,
        tokenizer: nodeTokenizerPort,
        examinationArchive,
        initialSettingsLoadResult: settings,
        onAppCredentialsSaved: rebuildLlmPortIfCredentialsChanged,
        createDraftLlmTextClient,
      })
      desktopGateway = installDesktopEntryGateway({
        createRequestChannel: () => new MessageChannelMain(),
        ipc: ipcMain,
        window: mainWindow,
        rendererUrl: resolveRendererUrl(),
        router: createDesktopWorkflowRouter(desktopWorkflows),
        handlers: desktopWorkflows,
        admission,
        direct: (message) => runRendererHostAction(mainWindow, message),
      })
      mainWindow.once("closed", () => {
        desktopGateway?.dispose()
        desktopGateway = null
      })
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

    await desktopGateway.loadRenderer()

    return mainWindow
  }

  async function startDesktop(): Promise<void> {
    bindUpdaterMenu()

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

    const mainWindow = await createWindow()
    if (mainWindow) initAutoUpdater(mainWindow)
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

    await ready
    if (admission.getSnapshot().phase === "starting") await startDesktop()
  }

  // Register readiness without keeping Electron's entry import pending.
  const ready = app.whenReady()
  void bootstrapDesktop().catch((error) => {
    process.stderr.write(
      `[desktop] startup-failed ${desktopErrorText(error)}\n`,
    )
    admission.terminal(error)
  })
}

import { dirname, join } from "node:path"
import { performance } from "node:perf_hooks"
import { fileURLToPath, pathToFileURL } from "node:url"
import {
  createNodeFileSystemPort,
  createNodeGitCommandPort,
  createNodeHttpPort,
} from "@repo-edu/host-node"
import { app, BrowserWindow, ipcMain, nativeTheme, shell } from "electron"
import { createIPCHandler } from "trpc-electron/main"
import { createDesktopHostEnvironment } from "./desktop-host"
import { createDesktopProfileStore } from "./profile-store"
import {
  type DesktopRendererHostBridge,
  desktopRendererHostChannels,
} from "./renderer-host-bridge"
import { createDesktopAppSettingsStore } from "./settings-store"
import type { DesktopRouter } from "./trpc"
import { createDesktopRouter } from "./trpc"

const startupMarker = "repo-edu-desktop-cold-start"
const trpcMarker = "repo-edu-desktop-trpc"
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

function resolvePreloadPath() {
  return join(currentDir, "../preload/preload.cjs")
}

function resolveRendererUrl() {
  const baseUrl = process.env.ELECTRON_RENDERER_URL
  const validationSuffix = isTRPCValidationMode ? "?mode=validate-trpc" : ""

  if (baseUrl) {
    return `${baseUrl}${validationSuffix}`
  }

  const fileUrl = pathToFileURL(
    join(currentDir, "../renderer/index.html"),
  ).toString()

  return `${fileUrl}${validationSuffix}`
}

function resolveStorageRootPath() {
  return join(app.getPath("appData"), "repo-edu")
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
    desktopRendererHostChannels.revealProfilesDirectory,
    async () => {
      const profilesDir = join(resolveStorageRootPath(), "profiles")
      await shell.openPath(profilesDir)
    },
  )
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

async function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    show: !(isMeasureMode || isTRPCValidationMode),
    title: "Repo Edu Desktop",
    backgroundColor: "#f5f5f5",
    webPreferences: {
      contextIsolation: true,
      preload: resolvePreloadPath(),
      sandbox: true,
    },
  })

  if (!desktopRouter) {
    const storageRoot = resolveStorageRootPath()
    desktopRouter = createDesktopRouter({
      http: nodeHttpPort,
      profileStore: createDesktopProfileStore(storageRoot),
      appSettingsStore: createDesktopAppSettingsStore(storageRoot),
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
}

app.whenReady().then(async () => {
  registerRendererHostIpcHandlers()
  await createWindow()

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow()
    }
  })
})

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

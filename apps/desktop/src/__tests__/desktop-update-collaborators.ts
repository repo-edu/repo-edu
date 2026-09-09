import { createRequire } from "node:module"

const require = createRequire(import.meta.url)

/** Real packaged updater implementations; substitute only download and OS work. */
export function updateCollaborators(platform: "win32" | "linux" | "darwin") {
  const updaterClass = {
    win32: "NsisUpdater",
    linux: "DebUpdater",
    darwin: "MacUpdater",
  }[platform]
  const updaterPath = require.resolve(`electron-updater/out/${updaterClass}.js`)
  return {
    "./auto-updater": null,
    "electron-updater": `
      import { ${updaterClass} } from ${JSON.stringify(updaterPath)}
      import { app } from "electron"
      export const autoUpdater = new ${updaterClass}(null, {
        version: "1.0.0", name: "RepoEdu", isPackaged: true,
        whenReady: async () => {},
        quit: () => app.quit(), relaunch: () => trace("updater-relaunch"),
        onQuit: handler => app.once("quit", (_, code) => handler(code))
      })
      autoUpdater.logger = null
      autoUpdater.downloadedUpdateHelper = {
        file: "/downloaded/update", downloadedFileInfo: {}
      }
      autoUpdater.spawnLog = async () => trace("updater-spawn")
      autoUpdater.hasCommand = () => true
      autoUpdater.detectPackageManager = () => "dpkg"
      autoUpdater.runCommandWithSudoIfNeeded = () => {
        trace("updater-package-install")
        if (process.env.ENTRY_CASE.includes("install-error")) throw new Error("installation failed")
      }
      globalThis.updater = autoUpdater
    `,
    electron: `
      import { EventEmitter } from "node:events"
      export const app = new EventEmitter()
      app.isPackaged = true
      app.commandLine = { appendSwitch() {} }
      app.requestSingleInstanceLock = () => true
      app.setName = () => {}
      app.getPath = () => "/unused"
      app.whenReady = async () => {}
      app.exit = code => { trace("app-exit:" + code); process.exit(code) }
      app.quit = () => {
        let prevented = false
        app.emit("before-quit", { preventDefault() { prevented = true } })
        if (prevented) { trace("quit-prevented"); return }
        trace("quit-allowed")
        for (const window of BrowserWindow.getAllWindows()) {
          window.emit("close", { preventDefault() { prevented = true } })
          if (prevented) { trace("window-close-prevented"); return }
          trace("window-close-allowed")
          window.emit("closed")
        }
        app.emit("quit", {}, 0)
        process.exit(0)
      }
      export const autoUpdater = new EventEmitter()
      autoUpdater.checkForUpdates = () => {
        trace("native-update-stage")
        setImmediate(() => autoUpdater.emit("update-downloaded"))
      }
      autoUpdater.quitAndInstall = () => {
        trace("native-update-install")
        app.quit()
      }
      export class BrowserWindow extends EventEmitter {
        static windows = []
        static getAllWindows() { return this.windows }
        constructor() {
          super()
          BrowserWindow.windows.push(this)
          this.webContents = new EventEmitter()
          this.webContents.send = () => {}
        }
        isDestroyed() { return false }
        setEnabled() { trace("disable") }
        getSize() { return [1000, 800] }
      }
      export const dialog = {
        showErrorBox: (_title, message) => { trace("warning"); trace(message) },
        showMessageBoxSync: ({ message }) => { trace("restart-refused"); trace(message) }
      }
      export const Menu = { buildFromTemplate: items => items, setApplicationMenu() {} }
      export const ipcMain = {}, MessageChannelMain = {}, nativeTheme = {}, shell = {}
      globalThis.afterEntry = async () => {
        const turn = () => new Promise(resolve => setImmediate(resolve))
        holdGate()
        await turn()
        updater.emit("update-downloaded")
        updater.addQuitHandler?.()
        trace("auto-install:" + updater.autoInstallOnAppQuit)
        if (process.env.ENTRY_CASE.includes("mac-staged")) autoUpdater.emit("update-downloaded")
        if (process.env.ENTRY_CASE.includes("menu-refused")) {
          if (process.env.ENTRY_CASE.includes("command")) {
            gateway.admission.dispatch({ type: "exclusive-intent", command: "repo.clone", request: { cancel() {} } })
          }
          const before = gateway.admission.getSnapshot()
          menuRestart()
          if (gateway.admission.getSnapshot() !== before) throw new Error("Refusal changed admission")
          app.quit()
          confirmEnding()
          return
        }
        const retire = gateway.admission.startWorkflow("course.list", { cancel() { trace("cancel-call") } })
        trace("ordinary-started")
        if (process.env.ENTRY_CASE.includes("ordinary-close")) app.quit()
        else if (process.env.ENTRY_CASE.includes("menu")) menuRestart()
        else gateway.direct({ action: "quitAndInstall" })
        trace("phase:" + gateway.admission.getSnapshot().phase)
        retire()
        trace("ordinary-retired")
        finishPreparation()
        trace("ending-pending")
        app.quit()
        if (process.env.ENTRY_CASE.includes("superseded")) gateway.admission.terminal(new Error("failure during ending"))
        confirmEnding()
      }
    `,
    "./desktop-bootstrap": `
      import { defaultAppCredentials } from "@repo-edu/domain/settings"
      export const loadDesktopBootstrap = async () => ({
        settings: { credentials: defaultAppCredentials },
        windowState: { width: 1000, height: 800 },
        archiveHandle: { close: () => trace("close-storage") }
      })
    `,
    "./desktop-entry-gateway": `
      export const installDesktopEntryGateway = options => {
        globalThis.gateway = options
        return {
          loadRenderer: async () => {
            if (!process.env.ENTRY_CASE.includes("menu-refused-starting")) options.direct({ action: "bootstrapReady" })
          },
          prepareClose: request => {
            trace("prepare-close")
            globalThis.finishPreparation = () => {
              trace("renderer-ready")
              options.admission.dispatch({ type: "close-ready", request })
            }
          },
          dispose: () => trace("dispose-gateway")
        }
      }
    `,
    "./desktop-menu": `
      export const createDesktopMenuTemplate = options => {
        globalThis.menuRestart = options.updateItems.find(item => item.label === "Install Update and Restart").click
        return []
      }
    `,
    "./desktop-host": `
      export const createDesktopHostEnvironment = () => ({})
    `,
    "./child-process-lifetime": `
      export const createDesktopChildProcessLifetimeController = () => ({
        stopAndConfirm: () => {
          trace("stop-owned-work")
          return new Promise(resolve => globalThis.confirmEnding = () => {
            const outcome = process.env.ENTRY_CASE.includes("unconfirmed") ? "unconfirmed" : "confirmed"
            trace(outcome)
            resolve({ outcome })
          })
        }
      })
    `,
  }
}

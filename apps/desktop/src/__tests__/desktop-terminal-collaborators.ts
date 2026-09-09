/** Keep the real entry, composition, gateway, request protocol and terminal owner.
 * Replace Electron and external work so each process can pause its ending. */
export function terminalCollaborators(
  trigger: string,
  unconfirmed = false,
  cascade = true,
  acknowledgeBootstrap = true,
) {
  return {
    "./desktop-entry-gateway": null,
    "./desktop-bootstrap": `
      import { defaultAppCredentials } from "@repo-edu/domain/settings"
      export const loadDesktopBootstrap = async () => ({
        settings: { credentials: defaultAppCredentials },
        windowState: { width: 1000, height: 800 },
        archiveHandle: { close: () => trace("close-storage") }
      })
    `,
    "./trpc": `
      import { initTRPC } from "@trpc/server"
      export const createDesktopWorkflowRouter = () => initTRPC.create().router({})
      export const createDesktopWorkflowRegistry = () => new Proxy({}, {
        get() { trace("unexpected-workflow"); throw new Error("Unexpected workflow") }
      })
    `,
    "./desktop-host": `
      export const createDesktopHostEnvironment = () => new Proxy({}, {
        get(_target, key) {
          if (key === "userFilePort") return {}
          trace("unexpected-shell"); throw new Error("Unexpected shell work")
        }
      })
    `,
    "./child-process-lifetime": `
      export const createDesktopChildProcessLifetimeController = options => ({
        stopAndConfirm() {
          trace("stop-owned-work")
          return new Promise(resolve => {
            globalThis.finishEnding = () => {
              if (${unconfirmed}) {
                options.showWarning("warning", "first expired tree")
                options.showWarning("warning", "second expired tree")
              }
              trace(${JSON.stringify(unconfirmed ? "unconfirmed" : "confirmed")})
              resolve({ outcome: ${JSON.stringify(unconfirmed ? "unconfirmed" : "confirmed")} })
            }
          })
        }
      })
    `,
    electron: `
      import assert from "node:assert/strict"
      import { EventEmitter } from "node:events"
      import { desktopEntryChannel } from "./desktop-wire"
      export const app = new EventEmitter()
      app.isPackaged = false
      app.commandLine = { appendSwitch() {} }
      app.requestSingleInstanceLock = () => true
      app.setName = () => {}
      app.getPath = () => "/unused"
      app.whenReady = async () => {}
      app.exit = code => { trace("app-exit:" + code); process.exit(code) }
      app.quit = () => app.emit("before-quit", { preventDefault() {} })
      export const ipcMain = new EventEmitter()
      const invokes = new Map()
      ipcMain.handle = (channel, handler) => invokes.set(channel, handler)
      ipcMain.removeHandler = channel => invokes.delete(channel)
      export class Port extends EventEmitter {
        postMessage(message) { trace("port:" + message.type) }
        start() {}
        close() { this.emit("close") }
        receive(data, ports = []) { this.emit("message", { data, ports }) }
      }
      let closePort
      export class MessageChannelMain {
        constructor() { this.port1 = closePort = new Port(); this.port2 = new Port() }
      }
      export class BrowserWindow extends EventEmitter {
        static windows = []
        static getAllWindows() { return this.windows }
        constructor() {
          super()
          BrowserWindow.windows.push(this)
          this.webContents = new EventEmitter()
          this.webContents.isDestroyed = () => false
          this.webContents.getURL = () => this.webContents.mainFrame.url
          this.webContents.setWindowOpenHandler = handler => { this.openWindow = handler }
          this.webContents.send = () => trace("unexpected-response")
          this.webContents.postMessage = () => trace("close-transferred")
        }
        isDestroyed() { return false }
        setEnabled() { trace("disable") }
        getSize() { return [1000, 800] }
        async loadURL(url) {
          this.webContents.mainFrame = { url, parent: null, detached: false, isDestroyed: () => false }
          this.webContents.emit("did-start-navigation", { url, isMainFrame: true, isSameDocument: false })
          this.webContents.emit("did-frame-navigate", {}, url, 200, "OK", true)
        }
      }
      export const dialog = {
        showErrorBox: (title, message) => { trace("warning:" + title); trace(message) },
        showMessageBoxSync: () => trace("unexpected-session-warning")
      }
      export const Menu = { buildFromTemplate: items => items, setApplicationMenu() {} }
      export const nativeTheme = {}, shell = {}
      globalThis.afterEntry = async () => {
        const turn = () => new Promise(resolve => setImmediate(resolve))
        holdGate()
        await turn()
        const window = BrowserWindow.getAllWindows()[0]
        assert.ok(window, "Bootstrap created the renderer")
        const contents = window.webContents
        const event = { sender: contents, senderFrame: contents.mainFrame, ports: [] }
        const invoke = (raw, sender = event) => invokes.get(desktopEntryChannel)(sender, raw)
        const send = (raw, ports = [], sender = event) => ipcMain.emit(desktopEntryChannel, { ...sender, ports }, raw)
        if (${acknowledgeBootstrap}) {
          invoke({ action: "bootstrapReady" })
          trace("interactive")
        }
        const command = () => {
          const port = new Port()
          send({ kind: "command-intent", workflowId: "userFile.exportPreview" }, [port])
          return port
        }
        ${trigger}
        await turn()
        trace("ending-pending")
        assert.equal(typeof finishEnding, "function", "The installed source reached the controller")
        // A second installed source during ending must not start another stop.
        if (${cascade}) app.emit("child-process-gone", {}, { type: "GPU", reason: "crashed" })
        finishEnding()
      }
    `,
  }
}

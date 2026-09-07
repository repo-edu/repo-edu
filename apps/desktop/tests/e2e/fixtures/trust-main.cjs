require("tsx/cjs")

const { app, BrowserWindow, ipcMain, Menu, MessageChannelMain } = require("electron")
const { join } = require("node:path")
const {
  installDesktopEntryGateway,
} = require("../../../src/desktop-entry-gateway.ts")
const { HostAdmission } = require("../../../src/host-admission.ts")
const { createDesktopWorkflowRouter } = require("../../../src/trpc.ts")

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  globalThis.desktopTrustTest = {
    async open(rendererUrl) {
      const events = []
      const direct = []
      const workflows = []
      const admission = new HostAdmission(() => {})
      const dispatch = admission.dispatch.bind(admission)
      admission.dispatch = (event) => {
        events.push(event.type)
        return dispatch(event)
      }
      const window = new BrowserWindow({
        show: false,
        webPreferences: {
          contextIsolation: true,
          sandbox: true,
          preload: join(__dirname, "trust-preload.cjs"),
        },
      })
      const gateway = installDesktopEntryGateway({
        createRequestChannel: () => new MessageChannelMain(),
        ipc: ipcMain,
        window,
        rendererUrl,
        admission,
        router: createDesktopWorkflowRouter({
          "course.list": async () => {
            workflows.push("course.list")
            return []
          },
        }),
        direct: (message) => {
          direct.push(message.action)
        },
      })
      window.once("closed", () => gateway.dispose())
      this.window = window
      this.events = events
      this.direct = direct
      this.workflows = workflows
      this.gateway = gateway
      admission.dispatch({ type: "bootstrap-acknowledged" })
      events.length = 0
      await gateway.loadRenderer()
    },
    snapshot() {
      return {
        events: this.events,
        direct: this.direct,
        workflows: this.workflows,
      }
    },
  }
})

require("tsx/cjs")
const { app, BrowserWindow, ipcMain, Menu, MessageChannelMain } = require("electron")
const { installDesktopEntryGateway } = require("../../../src/desktop-entry-gateway.ts")
const { HostAdmission } = require("../../../src/host-admission.ts")
const { createDesktopWorkflowRouter } = require("../../../src/trpc.ts")
app.commandLine.appendSwitch("js-flags", "--expose-gc")

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  const events = []
  let gateway
  const admission = new HostAdmission((effect) => {
    events.push(effect.type)
    if (effect.type === "release-command") gateway.requests.release(effect.request)
    if (effect.type === "prepare-close") gateway.prepareClose(effect.request)
  })
  const window = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, preload: process.argv.find((arg) => arg.startsWith("--test-preload=")).slice("--test-preload=".length) },
  })
  const rendererUrl = process.argv.find((arg) => arg.startsWith("--test-url=")).slice("--test-url=".length)
  gateway = installDesktopEntryGateway({
    ipc: ipcMain, window, rendererUrl, admission,
    createRequestChannel: () => new MessageChannelMain(),
    router: createDesktopWorkflowRouter({}),
    direct() {},
    requestBody(request, message) {
      events.push(message.type)
      if (message.type === "bundle") {
        if (admission.getSnapshot().phase === "preparing") admission.dispatch({ type: "preparation-committed", request })
        gateway.requests.persistenceCommitted(request, {})
      } else if (message.type === "input") {
        admission.dispatch({ type: "input-prepared", request })
        gateway.requests.progress(request, { step: 1, totalSteps: 1, label: "Export" })
        gateway.requests.output(request, { channel: "info", message: "Written" })
        admission.dispatch({ type: "outcome-fixed", request })
        gateway.requests.settlement(request, {
          workflowId: "userFile.exportPreview",
          outcome: { disposition: "completed", completion: { status: "succeeded", result: { workflowId: "userFile.exportPreview", displayName: "preview.txt", preview: "text", savedAt: "now" } } },
          authoritative: undefined,
        })
      } else if (message.type === "acknowledged") admission.dispatch({ type: "settlement-acknowledged", request })
      else if (message.type === "close-ready") {
        gateway.requests.acknowledgeClose(request)
        admission.dispatch({ type: "close-ready", request })
      }
    },
  })
  window.once("closed", () => gateway.dispose())
  globalThis.requestPortTest = {
    window,
    dropHostPort() { gateway.requests.dispose() },
    close() { admission.dispatch({ type: "host-start", source: "window-close", request: { cancel() {} } }) },
    snapshot() { return { phase: admission.getSnapshot().phase, events } },
  }
  admission.dispatch({ type: "bootstrap-acknowledged" })
  gateway.loadRenderer()
})

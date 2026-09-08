require("tsx/cjs")
const { app, BrowserWindow, ipcMain, Menu, MessageChannelMain } = require("electron")
const { installDesktopEntryGateway } = require("../../../src/desktop-entry-gateway.ts")
const { HostAdmission } = require("../../../src/host-admission.ts")
const { createDesktopWorkflowRouter } = require("../../../src/trpc.ts")
app.commandLine.appendSwitch("js-flags", "--expose-gc")

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  const events = []
  const dispatches = []
  const ports = []
  const listeners = new Map()
  function track(port) {
    const record = { reference: new WeakRef(port), closed: false }
    ports.push(record)
    port.once("close", () => { record.closed = true })
    return port
  }
  const handlers = {
    "userFile.exportPreview": async (_input, context) => {
      events.push("handler")
      context.onProgress({ step: 1, totalSteps: 1, label: "Export" })
      context.onOutput({ channel: "info", message: "Written" })
      return { workflowId: "userFile.exportPreview", displayName: "preview.txt", preview: "text", savedAt: "now" }
    },
  }
  let gateway
  const admission = new HostAdmission((effect) => {
    events.push(effect.type)
    if (effect.type === "release-command") gateway.requests.release(effect.request)
    if (effect.type === "prepare-close") gateway.prepareClose(effect.request)
  })
  const dispatch = admission.dispatch.bind(admission)
  admission.dispatch = (event) => {
    dispatches.push(event.type)
    return dispatch(event)
  }
  const window = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, preload: process.argv.find((arg) => arg.startsWith("--test-preload=")).slice("--test-preload=".length) },
  })
  const rendererUrl = process.argv.find((arg) => arg.startsWith("--test-url=")).slice("--test-url=".length)
  gateway = installDesktopEntryGateway({
    ipc: {
      on(channel, receive) {
        const listener = (event, raw) => {
          for (const port of event.ports) track(port)
          receive(event, raw)
        }
        listeners.set(receive, listener)
        ipcMain.on(channel, listener)
      },
      handle: ipcMain.handle.bind(ipcMain),
      removeListener(channel, receive) {
        ipcMain.removeListener(channel, listeners.get(receive))
        listeners.delete(receive)
      },
      removeHandler: ipcMain.removeHandler.bind(ipcMain),
    }, window, rendererUrl, admission,
    createRequestChannel: () => {
      const channel = new MessageChannelMain()
      track(channel.port1)
      return channel
    },
    router: createDesktopWorkflowRouter(handlers),
    handlers,
    direct() {},
  })
  window.once("closed", () => gateway.dispose())
  globalThis.requestPortTest = {
    window,
    dropHostPort() { gateway.requests.dispose() },
    close() { admission.dispatch({ type: "host-start", source: "window-close", request: { cancel() {} } }) },
    snapshot() { return { phase: admission.getSnapshot().phase, events, dispatches, ports: ports.map(({ reference, closed }) => ({ closed, messages: reference.deref()?.listenerCount("message") ?? 0, closes: reference.deref()?.listenerCount("close") ?? 0 })) } },
  }
  admission.dispatch({ type: "bootstrap-acknowledged" })
  gateway.loadRenderer()
})

import { EventEmitter } from "node:events"
import type { WorkflowHandlerMap } from "@repo-edu/application-contract"
import { workflowCatalog } from "@repo-edu/application-contract"
import type { TRPCResponseMessage } from "@trpc/server/rpc"
import type {
  BrowserWindow,
  IpcMain,
  IpcMainEvent,
  IpcMainInvokeEvent,
} from "electron"
import { installDesktopEntryGateway } from "../desktop-entry-gateway"
import { endDesktopHost } from "../desktop-terminal"
import { desktopEntryChannel } from "../desktop-wire"
import { HostAdmission } from "../host-admission"
import type {
  HostAdmissionEffect,
  HostAdmissionState,
} from "../host-admission-model"

export function observeTerminalEnding(
  effect: HostAdmissionEffect,
  snapshot: () => HostAdmissionState,
  trace: string[],
) {
  if (effect.type === "disable-input") trace.push("disable")
  if (effect.type !== "end-host") return
  return endDesktopHost({
    reason: effect.reason,
    snapshot,
    controller: {
      async stopAndConfirm() {
        trace.push("stop")
        return { outcome: "confirmed" }
      },
    },
    closeStorage: () => trace.push("close-storage"),
    warn: () => trace.push("warn"),
    report: () => trace.push("report"),
    exit: (code) => trace.push(`exit:${code}`),
    installUpdate: () => trace.push("install"),
  })
}

import { createDesktopWorkflowRouter } from "../trpc"

export function transportHarness(
  handler: WorkflowHandlerMap[keyof WorkflowHandlerMap],
  rendererUrl = "file:///app/index.html",
  load = true,
) {
  const responses: TRPCResponseMessage[] = []
  const effects: HostAdmissionEffect[] = []
  const direct: unknown[] = []
  const terminalTrace: string[] = []
  const admission = new HostAdmission((effect) => {
    effects.push(effect)
    void observeTerminalEnding(effect, admission.getSnapshot, terminalTrace)
  })
  const listeners = new Map<
    string,
    (event: IpcMainEvent, raw: unknown) => void
  >()
  const handlers = new Map<
    string,
    (event: IpcMainInvokeEvent, raw: unknown) => unknown
  >()
  const ipc = {
    on(channel, receive) {
      listeners.set(channel, receive)
      return this
    },
    handle(channel, receive) {
      handlers.set(channel, receive)
    },
    removeListener(channel) {
      listeners.delete(channel)
      return this
    },
    removeHandler(channel) {
      handlers.delete(channel)
    },
  } as Pick<IpcMain, "on" | "handle" | "removeListener" | "removeHandler">
  const mainFrame = {
    url: rendererUrl,
    parent: null,
    detached: false,
    isDestroyed: () => false,
  }
  const contents = Object.assign(new EventEmitter(), {
    mainFrame,
    isDestroyed: () => false,
    getURL: () => rendererUrl,
    send: (_channel: string, message: TRPCResponseMessage) =>
      responses.push(message),
    setWindowOpenHandler(handler: () => { action: string }) {
      this.openWindow = handler
    },
    openWindow: (): { action: string } => ({ action: "allow" }),
  })
  const window = {
    webContents: contents,
    isDestroyed: () => false,
    async loadURL(url: string) {
      contents.emit("did-start-navigation", {
        url,
        isMainFrame: true,
        isSameDocument: false,
      })
      contents.emit("did-frame-navigate", {}, url, 200, "OK", true)
    },
  } as unknown as BrowserWindow
  const event = {
    sender: contents,
    senderFrame: mainFrame,
  } as unknown as IpcMainEvent
  const registry = Object.fromEntries(
    Object.keys(workflowCatalog).map((id) => [id, handler]),
  ) as WorkflowHandlerMap
  const gateway = installDesktopEntryGateway({
    createRequestChannel() {
      throw new Error("This harness does not create close ports.")
    },
    ipc,
    window,
    rendererUrl,
    router: createDesktopWorkflowRouter(registry),
    handlers: registry,
    admission,
    direct(message) {
      direct.push(message)
    },
  })
  if (load) void gateway.loadRenderer()
  return {
    admission,
    responses,
    terminalTrace,
    effects,
    gateway,
    event,
    direct,
    contents,
    listeners,
    handlers,
    receive(raw: unknown, sender = event) {
      listeners.get(desktopEntryChannel)?.(sender, raw)
    },
    invoke(raw: unknown, sender = event) {
      return handlers.get(desktopEntryChannel)?.(
        sender as unknown as IpcMainInvokeEvent,
        raw,
      )
    },
  }
}

export const flushTransport = () =>
  new Promise<void>((resolve) => setImmediate(resolve))
export const startMessage = (path: string, input: unknown, id = 1) => ({
  kind: "trpc",
  message: { id, method: "subscription", params: { path, input } },
})
export const stopMessage = (id = 1) => ({
  kind: "trpc",
  message: { id, method: "subscription.stop" },
})

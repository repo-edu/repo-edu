import { randomUUID } from "node:crypto"
import { workflowInputSchemas } from "@repo-edu/application-contract"
import type {
  BrowserWindow,
  IpcMain,
  IpcMainEvent,
  IpcMainInvokeEvent,
} from "electron"
import { installDesktopRendererDocument } from "./desktop-renderer-document"
import { createDesktopTrpcAdapter } from "./desktop-trpc-adapter"
import {
  type DesktopDirectMessage,
  desktopDirectMessageSchema,
  desktopEntryChannel,
  desktopEntryMessageSchema,
  desktopTrpcResponseChannel,
} from "./desktop-wire"
import type { HostAdmission } from "./host-admission"
import type { HostRequest } from "./host-admission-model"
import { desktopRendererHostChannels } from "./renderer-host-bridge"
import type { DesktopRouter } from "./trpc"

/** The sole registration owner for renderer-originated Electron messages. */
export function installDesktopEntryGateway(options: {
  ipc: Pick<IpcMain, "on" | "handle" | "removeListener" | "removeHandler">
  window: BrowserWindow
  rendererUrl: string
  router: DesktopRouter
  admission: HostAdmission
  direct(message: DesktopDirectMessage): unknown
}) {
  const { ipc, window, admission } = options
  let close: { requestId: string; request: HostRequest } | null = null
  const document = installDesktopRendererDocument({
    window,
    rendererUrl: options.rendererUrl,
    terminal: (error) => admission.dispatch({ type: "terminal", error }),
  })
  const { terminal, proveSender } = document
  const adapter = createDesktopTrpcAdapter({
    router: options.router,
    admission,
    send: (response) =>
      window.webContents.send(desktopTrpcResponseChannel, response),
  })

  const receive = (event: IpcMainEvent, raw: unknown) => {
    if (!proveSender(event)) return
    const envelope = desktopEntryMessageSchema.safeParse(raw)
    if (!envelope.success) {
      terminal(
        new Error("Malformed desktop gateway message.", {
          cause: envelope.error,
        }),
      )
      return
    }
    if (admission.getSnapshot().phase === "terminal") return
    const entry = envelope.data
    if (entry.kind === "close-complete") {
      if (
        !close ||
        entry.response.requestId !== close.requestId ||
        !entry.response.ok
      ) {
        terminal(new Error("Invalid renderer close completion."))
        return
      }
      const { request } = close
      close = null
      admission.dispatch({ type: "close-ready", request })
      return
    }
    const message = entry.message
    if (message.method === "subscription") {
      const input = workflowInputSchemas[message.params.path].safeParse(
        message.params.input,
      )
      if (!input.success) {
        terminal(
          new Error("Malformed desktop workflow input.", {
            cause: input.error,
          }),
        )
        return
      }
      message.params.input = input.data
    }
    try {
      adapter.receive(message)
    } catch (error) {
      terminal(error)
    }
  }
  const invoke = (event: IpcMainInvokeEvent, raw: unknown) => {
    if (!proveSender(event)) return
    const message = desktopDirectMessageSchema.safeParse(raw)
    if (!message.success) {
      terminal(
        new Error("Malformed desktop gateway action.", {
          cause: message.error,
        }),
      )
      return
    }
    if (admission.getSnapshot().phase === "terminal") return
    return options.direct(message.data)
  }
  ipc.on(desktopEntryChannel, receive)
  ipc.handle(desktopEntryChannel, invoke)

  return {
    loadRenderer: document.load,
    prepareClose(request: HostRequest) {
      close = { requestId: randomUUID(), request }
      window.webContents.send(desktopRendererHostChannels.requestClose, {
        requestId: close.requestId,
      })
    },
    dispose() {
      document.dispose()
      ipc.removeListener(desktopEntryChannel, receive)
      ipc.removeHandler(desktopEntryChannel)
      close = null
    },
  }
}

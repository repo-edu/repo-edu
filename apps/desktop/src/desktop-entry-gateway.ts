import { workflowInputSchemas } from "@repo-edu/application-contract"
import type {
  BrowserWindow,
  IpcMain,
  IpcMainEvent,
  IpcMainInvokeEvent,
  MessagePortMain,
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
import {
  createHostRequestTransport,
  mainRequestPort,
} from "./host-request-transport"
import {
  commitRequestPersistence,
  type PreparationHandlers,
} from "./request-persistence"
import { type RequestMessage, requestPortChannel } from "./request-port-wire"
import type { DesktopRouter } from "./trpc"

/** The sole registration owner for renderer-originated Electron messages. */
export function installDesktopEntryGateway(options: {
  ipc: Pick<IpcMain, "on" | "handle" | "removeListener" | "removeHandler">
  window: BrowserWindow
  rendererUrl: string
  router: DesktopRouter
  admission: HostAdmission
  preparationHandlers: PreparationHandlers
  direct(message: DesktopDirectMessage): unknown
  createRequestChannel(): { port1: MessagePortMain; port2: MessagePortMain }
  requestBody?(
    request: HostRequest,
    message: RequestMessage<unknown, unknown, unknown, unknown>,
  ): void
}) {
  const { ipc, window, admission } = options
  const document = installDesktopRendererDocument({
    window,
    rendererUrl: options.rendererUrl,
    terminal: (error) => admission.dispatch({ type: "terminal", error }),
  })
  const { terminal, proveSender } = document
  const requests = createHostRequestTransport({
    admission,
    receive(request, message) {
      if (message.type === "close-ready") {
        requests.acknowledgeClose(request)
        admission.dispatch({ type: "close-ready", request })
        return
      }
      if (message.type === "bundle") {
        void commitRequestPersistence({
          request,
          bundle: message.bundle,
          admission,
          handlers: options.preparationHandlers,
          transport: requests,
        })
        return
      }
      if (options.requestBody) options.requestBody(request, message)
      else terminal(new Error("The request body is not connected."))
    },
    cancel() {
      terminal(new Error("The command effect is not connected."))
    },
  })
  const adapter = createDesktopTrpcAdapter({
    router: options.router,
    admission,
    send: (response) =>
      window.webContents.send(desktopTrpcResponseChannel, response),
  })

  const receive = (event: IpcMainEvent, raw: unknown) => {
    if (!proveSender(event)) {
      for (const port of event.ports ?? []) port.close()
      return
    }
    const envelope = desktopEntryMessageSchema.safeParse(raw)
    if (!envelope.success) {
      terminal(
        new Error("Malformed desktop gateway message.", {
          cause: envelope.error,
        }),
      )
      for (const port of event.ports ?? []) port.close()
      return
    }
    const ports = event.ports ?? []
    const entry = envelope.data
    if (ports.length !== (entry.kind === "command-intent" ? 1 : 0)) {
      terminal(new Error("Invalid desktop gateway port transfer."))
      for (const port of ports) port.close()
      return
    }
    if (admission.getSnapshot().phase === "terminal") {
      for (const port of ports) port.close()
      return
    }
    if (entry.kind === "command-intent") {
      requests.acceptCommand(entry.workflowId, mainRequestPort(ports[0]))
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
    requests,
    prepareClose(request: HostRequest) {
      try {
        const { port1, port2 } = options.createRequestChannel()
        try {
          requests.prepareClose(request, mainRequestPort(port1))
          window.webContents.postMessage(
            requestPortChannel,
            { kind: "close" },
            [port2],
          )
        } catch (error) {
          port1.close()
          port2.close()
          throw error
        }
      } catch (error) {
        terminal(error)
      }
    },
    dispose() {
      document.dispose()
      ipc.removeListener(desktopEntryChannel, receive)
      ipc.removeHandler(desktopEntryChannel)
      requests.dispose()
    },
  }
}

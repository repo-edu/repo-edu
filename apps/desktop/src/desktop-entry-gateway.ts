import {
  type ExclusiveRequestOperation,
  type WorkflowHandlerMap,
  workflowInputSchemas,
} from "@repo-edu/application-contract"
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
import { executeHostCommand } from "./host-command-execution"
import {
  createHostRequestTransport,
  mainRequestPort,
} from "./host-request-transport"
import { commitRequestPersistence } from "./request-persistence"
import { requestPortChannel } from "./request-port-wire"
import type { DesktopRouter } from "./trpc"

/** The sole registration owner for renderer-originated Electron messages. */
export function installDesktopEntryGateway(options: {
  ipc: Pick<IpcMain, "on" | "handle" | "removeListener" | "removeHandler">
  window: BrowserWindow
  rendererUrl: string
  router: DesktopRouter
  admission: HostAdmission
  handlers: WorkflowHandlerMap
  direct(message: DesktopDirectMessage): unknown
  createRequestChannel(): { port1: MessagePortMain; port2: MessagePortMain }
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
    receive(request, message, signal) {
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
          handlers: options.handlers,
          transport: requests,
        })
        return
      }
      if (message.type === "input" && signal) {
        void executeHostCommand({
          request,
          operation: message.input as ExclusiveRequestOperation,
          signal,
          admission,
          handlers: options.handlers,
          transport: requests,
        }).catch(terminal)
        return
      }
      if (message.type === "acknowledged") {
        admission.dispatch({ type: "settlement-acknowledged", request })
        return
      }
      terminal(
        new Error(`Unexpected renderer request message ${message.type}.`),
      )
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

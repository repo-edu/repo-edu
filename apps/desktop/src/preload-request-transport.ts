import type {
  ExclusiveCommandId,
  ExclusiveRequestOperation,
  ExclusiveTerminalSettlement,
  MilestoneProgress,
  WorkflowOutput,
} from "@repo-edu/application-contract"
import { commandPayloadSchemas } from "./request-command-schemas"
import {
  createRequestPortEndpoint,
  type RequestPort,
} from "./request-port-endpoint"
import {
  closePayloadSchemas,
  commandIntentSchema,
  type RequestPersistenceBundle,
  type RequestPersistenceResult,
} from "./request-port-wire"

export type RendererRequest = {
  persist(bundle: RequestPersistenceBundle): void
  prepareInput(input: ExclusiveRequestOperation): void
  cancel(): void
  acknowledgeSettlement(): void
  readyToClose(): void
}
export type RendererRequestObserver = {
  admission(status: "accepted" | "busy"): void
  prepare(): void
  persisted(result: RequestPersistenceResult): void
  progress(progress: MilestoneProgress): void
  output(output: WorkflowOutput<ExclusiveCommandId>): void
  settlement(settlement: ExclusiveTerminalSettlement): void
  released(): void
  closeAcknowledged(): void
  failed(message: string): void
}
export type DesktopRequestBridge = {
  command(
    command: ExclusiveCommandId,
    observer: RendererRequestObserver,
  ): RendererRequest
  onClose(
    handler: (request: RendererRequest) => RendererRequestObserver,
  ): () => void
}

export function rendererRequestPort(port: MessagePort): RequestPort {
  return {
    postMessage: (message) => port.postMessage(message),
    start: () => port.start(),
    close: () => port.close(),
    listen(message, closed, malformed) {
      const receive = (event: MessageEvent) => message(event.data, event.ports)
      port.addEventListener("message", receive)
      port.addEventListener("close", closed)
      port.addEventListener("messageerror", malformed)
      return () => {
        port.removeEventListener("message", receive)
        port.removeEventListener("close", closed)
        port.removeEventListener("messageerror", malformed)
      }
    },
  }
}

/** Retains renderer endpoints before transferring their peer. Raw ports stay isolated. */
export function createPreloadRequestTransport(options: {
  channel(command: ExclusiveCommandId): {
    renderer: RequestPort
    transfer(): void
  }
  terminal(error: unknown): void
}) {
  const retained = new Set<ReturnType<typeof createRequestPortEndpoint>>()
  let closeHandler:
    | ((request: RendererRequest) => RendererRequestObserver)
    | null = null

  function attach(
    port: RequestPort,
    command?: ExclusiveCommandId,
    observer?: RendererRequestObserver,
  ) {
    const endpoint = createRequestPortEndpoint<
      unknown,
      unknown,
      unknown,
      unknown
    >({
      port,
      side: "renderer",
      kind: command ? "command" : "close",
      schemas: command ? commandPayloadSchemas(command) : closePayloadSchemas,
      permit() {},
      receive(message) {
        if (!observer)
          throw new Error("The renderer request has no session owner.")
        switch (message.type) {
          case "admission":
            observer.admission(message.status)
            break
          case "prepare":
            observer.prepare()
            break
          case "persisted":
            observer.persisted(message.result)
            break
          case "progress":
            observer.progress(message.progress as MilestoneProgress)
            break
          case "output":
            observer.output(
              message.output as WorkflowOutput<ExclusiveCommandId>,
            )
            break
          case "settlement":
            observer.settlement(
              message.settlement as ExclusiveTerminalSettlement,
            )
            break
          case "released":
            observer.released()
            break
          case "close-acknowledged":
            observer.closeAcknowledged()
            break
        }
      },
      terminal(error) {
        options.terminal(error)
        observer?.failed(error instanceof Error ? error.message : String(error))
      },
      retired: () => {
        retained.delete(endpoint)
      },
    })
    retained.add(endpoint)
    const request: RendererRequest = {
      persist: (bundle) => endpoint.send({ type: "bundle", bundle }),
      prepareInput: (input) => endpoint.send({ type: "input", input }),
      cancel: () => endpoint.send({ type: "cancel" }),
      acknowledgeSettlement: () => endpoint.send({ type: "acknowledged" }),
      readyToClose: () => endpoint.send({ type: "close-ready" }),
    }
    try {
      if (!command) {
        const handler = closeHandler
        closeHandler = null
        if (!handler)
          throw new Error("The renderer has no available close owner.")
        observer = handler(request)
      }
      endpoint.start()
    } catch (error) {
      endpoint.fail(error)
    }
    return { request, endpoint }
  }

  const bridge: DesktopRequestBridge = {
    command(command, observer) {
      try {
        commandIntentSchema.parse({
          kind: "command-intent",
          workflowId: command,
        })
        const channel = options.channel(command)
        const { request, endpoint } = attach(
          channel.renderer,
          command,
          observer,
        )
        try {
          channel.transfer()
        } catch (error) {
          endpoint.fail(error)
        }
        return request
      } catch (error) {
        options.terminal(error)
        throw error
      }
    },
    onClose(handler) {
      if (closeHandler)
        throw new Error("The renderer already has a close owner.")
      closeHandler = handler
      return () => {
        if (closeHandler === handler) closeHandler = null
      }
    },
  }
  return {
    bridge,
    close(port: RequestPort) {
      attach(port)
    },
    dispose() {
      for (const endpoint of [...retained]) endpoint.dispose()
      closeHandler = null
    },
  }
}

declare global {
  interface Window {
    repoEduRequests?: DesktopRequestBridge
  }
}

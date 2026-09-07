import type {
  ExclusiveCommandId,
  ExclusiveTerminalSettlement,
  WorkflowOutput,
  WorkflowProgress,
} from "@repo-edu/application-contract"
import type { MessagePortMain } from "electron"
import type { HostAdmission } from "./host-admission"
import type { HostRequest } from "./host-admission-model"
import { commandPayloadSchemas } from "./request-command-schemas"
import {
  createRequestPortEndpoint,
  type RequestPort,
} from "./request-port-endpoint"
import {
  closePayloadSchemas,
  type RequestMessage,
  type RequestPersistenceResult,
} from "./request-port-wire"

export function mainRequestPort(port: MessagePortMain): RequestPort {
  return {
    postMessage: (message) => port.postMessage(message),
    start: () => port.start(),
    close: () => port.close(),
    listen(message, closed) {
      const receive = (event: { data: unknown; ports: MessagePortMain[] }) =>
        message(event.data, event.ports)
      port.on("message", receive)
      port.on("close", closed)
      return () => {
        port.removeListener("message", receive)
        port.removeListener("close", closed)
      }
    },
  }
}

type Message = RequestMessage<unknown, unknown, unknown, unknown>
type Endpoint = ReturnType<
  typeof createRequestPortEndpoint<unknown, unknown, unknown, unknown>
>

/** Owns live endpoint retention. The admission reducer remains the host authority. */
export function createHostRequestTransport(options: {
  admission: HostAdmission
  receive(request: HostRequest, message: Message, signal?: AbortSignal): void
  cancel?(request: HostRequest): void
}) {
  const retained = new Map<HostRequest, Endpoint>()
  const terminal = options.admission.terminal

  function attach(
    request: HostRequest,
    port: RequestPort,
    command?: ExclusiveCommandId,
    signal?: AbortSignal,
  ) {
    if (retained.has(request)) {
      port.close()
      throw new Error("The request already owns a port.")
    }
    const endpoint = createRequestPortEndpoint<
      unknown,
      unknown,
      unknown,
      unknown
    >({
      port,
      side: "host",
      kind: command ? "command" : "close",
      schemas: command ? commandPayloadSchemas(command) : closePayloadSchemas,
      permit(message) {
        const state = options.admission.getSnapshot()
        if (message.type === "admission" && message.status === "busy") return
        if (message.type === "released" && state.phase === "interactive") return
        if (!("request" in state) || state.request !== request)
          throw new Error("Message from a non-current request port.")
        switch (message.type) {
          case "admission":
          case "prepare":
          case "bundle":
            if (
              (state.phase === "preparing" &&
                state.stage === "bundle-pending") ||
              state.phase === "closing.preparing"
            )
              return
            break
          case "persisted":
            if (
              (state.phase === "preparing" &&
                state.stage === "input-pending") ||
              (state.phase === "executing.settling" &&
                state.cancellationAccepted) ||
              state.phase === "closing.preparing"
            )
              return
            break
          case "input":
            if (state.phase === "preparing" && state.stage === "input-pending")
              return
            break
          case "progress":
          case "output":
            if (state.phase === "executing.running") return
            break
          case "cancel":
            if (
              (state.phase === "preparing" ||
                state.phase === "executing.running" ||
                state.phase === "executing.settling") &&
              !state.cancellationAccepted
            )
              return
            break
          case "settlement":
          case "acknowledged":
            if (state.phase === "executing.settling") return
            break
          case "close-ready":
          case "close-acknowledged":
            if (state.phase === "closing.preparing") return
            break
        }
        throw new Error(
          `Request-port ${message.type} is invalid in host ${state.phase}.`,
        )
      },
      receive(message) {
        if (message.type === "cancel")
          options.admission.dispatch({ type: "cancel-request", request })
        else options.receive(request, message, signal)
      },
      terminal,
      retired: () => {
        retained.delete(request)
      },
    })
    retained.set(request, endpoint)
    endpoint.start()
    return endpoint
  }

  function send(request: HostRequest, message: Message) {
    const endpoint = retained.get(request)
    if (!endpoint) {
      terminal(new Error("The request has no retained port."))
      return
    }
    endpoint.send(message)
  }

  return {
    acceptCommand(command: ExclusiveCommandId, port: RequestPort) {
      const abort = new AbortController()
      const request: HostRequest = {
        cancel: () => {
          abort.abort()
          options.cancel?.(request)
        },
      }
      const endpoint = attach(request, port, command, abort.signal)
      const decision = options.admission.dispatch({
        type: "exclusive-intent",
        command,
        request,
      })
      if (decision !== "accepted" && decision !== "busy") {
        endpoint.dispose()
        return request
      }
      endpoint.send({ type: "admission", status: decision })
      if (decision === "accepted") endpoint.send({ type: "prepare" })
      return request
    },
    prepareClose(request: HostRequest, port: RequestPort) {
      const endpoint = attach(request, port)
      endpoint.send({ type: "prepare" })
    },
    persistenceCommitted(
      request: HostRequest,
      result: RequestPersistenceResult,
    ) {
      send(request, { type: "persisted", result })
    },
    progress(
      request: HostRequest,
      progress: WorkflowProgress<ExclusiveCommandId>,
    ) {
      send(request, { type: "progress", progress })
    },
    output(request: HostRequest, output: WorkflowOutput<ExclusiveCommandId>) {
      send(request, { type: "output", output })
    },
    settlement(request: HostRequest, settlement: ExclusiveTerminalSettlement) {
      send(request, { type: "settlement", settlement })
    },
    release(request: HostRequest) {
      send(request, { type: "released" })
    },
    acknowledgeClose(request: HostRequest) {
      send(request, { type: "close-acknowledged" })
    },
    dispose() {
      for (const endpoint of [...retained.values()]) endpoint.dispose()
    },
  }
}

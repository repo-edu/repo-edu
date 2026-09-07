import {
  advanceRequestProtocol,
  createRequestMessageParser,
  type RequestPortSide,
  type RequestPortState,
} from "./request-port-protocol"
import type { RequestMessage, RequestPayloadSchemas } from "./request-port-wire"

export type RequestPort = {
  postMessage(message: unknown): void
  start(): void
  close(): void
  listen(
    message: (
      data: unknown,
      transferredPorts: readonly { close(): void }[],
    ) => void,
    closed: () => void,
    malformed: () => void,
  ): () => void
}

/** Retained by the transport until a final message or explicit terminal disposal. */
export function createRequestPortEndpoint<I, P, O, S>(options: {
  port: RequestPort
  side: RequestPortSide
  kind: "command" | "close"
  schemas: RequestPayloadSchemas<I, P, O, S>
  permit(message: RequestMessage<I, P, O, S>, sender: RequestPortSide): void
  receive(message: RequestMessage<I, P, O, S>): void
  terminal(error: unknown): void
  retired(): void
}) {
  let state: RequestPortState = {
    stage: options.kind === "command" ? "admission" : "prepare",
    cancellationSeen: false,
  }
  let unlisten: (() => void) | undefined
  const parse = createRequestMessageParser(options.schemas)
  const dispose = () => {
    if (!unlisten) return
    const remove = unlisten
    unlisten = undefined
    state = { ...state, stage: "finished" }
    remove()
    options.port.close()
    options.retired()
  }
  const fail = (error: unknown) => {
    state = { ...state, stage: "finished" }
    try {
      options.terminal(error)
    } finally {
      dispose()
    }
  }
  const accept = (raw: unknown, sender: RequestPortSide) => {
    const message = parse(raw)
    options.permit(message, sender)
    state = advanceRequestProtocol(state, options.kind, sender, message)
    return message
  }
  unlisten = options.port.listen(
    (raw, ports) => {
      try {
        if (ports.length !== 0) {
          for (const port of ports) port.close()
          throw new Error("A request message transferred an unexpected port.")
        }
        const message = accept(
          raw,
          options.side === "host" ? "renderer" : "host",
        )
        options.receive(message)
        if (state.stage === "finished") dispose()
      } catch (error) {
        fail(error)
      }
    },
    () => {
      if (state.stage !== "finished")
        fail(new Error("The current request port closed unexpectedly."))
      else dispose()
    },
    () => fail(new Error("The request port could not decode a message.")),
  )
  return {
    start() {
      options.port.start()
    },
    send(message: RequestMessage<I, P, O, S>) {
      try {
        const parsed = accept(message, options.side)
        options.port.postMessage(parsed)
        if (state.stage === "finished") dispose()
      } catch (error) {
        fail(error)
      }
    },
    dispose,
    fail,
  }
}

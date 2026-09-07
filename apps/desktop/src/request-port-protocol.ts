import { z } from "zod"
import {
  type RequestMessage,
  type RequestPayloadSchemas,
  requestMessageSchemas,
} from "./request-port-wire"

export type RequestPortStage =
  | "admission"
  | "prepare"
  | "bundle"
  | "persisting"
  | "input"
  | "running"
  | "acknowledgement"
  | "release"
  | "close-ready"
  | "close-acknowledgement"
  | "finished"
export type RequestPortSide = "host" | "renderer"
export type RequestPortState = {
  stage: RequestPortStage
  cancellationSeen: boolean
}

export function advanceRequestProtocol(
  state: RequestPortState,
  kind: "command" | "close",
  sender: RequestPortSide,
  message: RequestMessage<unknown, unknown, unknown, unknown>,
): RequestPortState {
  if (message.type === "cancel" && state.cancellationSeen)
    throw new Error("Duplicate request-port cancellation.")
  return {
    stage: advanceRequestPort(state.stage, kind, sender, message),
    cancellationSeen: state.cancellationSeen || message.type === "cancel",
  }
}

const envelope = z.object({ type: z.string() })

/** Pure wire ordering, shared by preload and main. No identities cross the wire. */
export function advanceRequestPort(
  stage: RequestPortStage,
  kind: "command" | "close",
  sender: RequestPortSide,
  message: RequestMessage<unknown, unknown, unknown, unknown>,
): RequestPortStage {
  const { type } = message
  if (sender === "host") {
    if (type === "admission" && kind === "command" && stage === "admission")
      return message.status === "busy" ? "finished" : "prepare"
    if (type === "prepare" && stage === "prepare") return "bundle"
    if (type === "persisted" && stage === "persisting")
      return kind === "command" ? "input" : "close-ready"
    if ((type === "progress" || type === "output") && stage === "running")
      return stage
    if (
      type === "settlement" &&
      kind === "command" &&
      (stage === "running" || stage === "input")
    )
      return "acknowledgement"
    if (type === "released" && stage === "release") return "finished"
    if (type === "close-acknowledged" && stage === "close-acknowledgement")
      return "finished"
  } else {
    if (type === "bundle" && stage === "bundle") return "persisting"
    if (type === "input" && kind === "command" && stage === "input")
      return "running"
    if (type === "acknowledged" && stage === "acknowledgement") return "release"
    if (type === "close-ready" && stage === "close-ready")
      return "close-acknowledgement"
    if (
      type === "cancel" &&
      kind === "command" &&
      ["bundle", "persisting", "input", "running", "acknowledgement"].includes(
        stage,
      )
    )
      return stage
  }
  throw new Error(
    `Request-port ${sender} message ${type} is invalid in ${stage}.`,
  )
}

export function createRequestMessageParser<I, P, O, S>(
  payloads: RequestPayloadSchemas<I, P, O, S>,
) {
  const schemas = requestMessageSchemas(payloads)
  return (raw: unknown): RequestMessage<I, P, O, S> => {
    const { type } = envelope.parse(raw)
    if (!Object.hasOwn(schemas, type))
      throw new Error("Unknown request-port message.")
    return schemas[type as keyof typeof schemas].parse(raw) as RequestMessage<
      I,
      P,
      O,
      S
    >
  }
}

import {
  HostAdmissionRefusedError,
  type OrdinaryWorkflowId,
} from "@repo-edu/application-contract"
import {
  callTRPCProcedure,
  getTRPCErrorFromUnknown,
  getTRPCErrorShape,
  transformTRPCResponse,
} from "@trpc/server"
import { isObservable } from "@trpc/server/observable"
import { parseTRPCMessage, type TRPCResponseMessage } from "@trpc/server/rpc"
import type { DesktopTrpcMessage } from "./desktop-wire"
import type { HostAdmission } from "./host-admission"
import type { DesktopRouter, DesktopWorkflowContext } from "./trpc"

/** Receives only gateway-validated messages. No Electron registration lives here. */
export function createDesktopTrpcAdapter(options: {
  router: DesktopRouter
  admission: HostAdmission
  send(response: TRPCResponseMessage): void
}) {
  const { router, admission } = options
  const calls = new Map<number, AbortController>()
  const terminal = admission.terminal

  function send(response: TRPCResponseMessage): void {
    if (admission.getSnapshot().phase === "terminal") return
    try {
      // The public transformer preserves the message envelope, including its id.
      options.send(
        transformTRPCResponse(
          router._def._config,
          response,
        ) as TRPCResponseMessage,
      )
    } catch (error) {
      terminal(error)
    }
  }

  function receive(validated: DesktopTrpcMessage): void {
    // The public RPC parser runs only after the gateway has proved the entire input.
    const message = parseTRPCMessage(validated, router._def._config.transformer)
    const id = validated.id
    if (message.method === "subscription.stop") {
      const call = calls.get(id)
      if (call && !call.signal.aborted) {
        call.abort()
        send({ id, result: { type: "stopped" } })
      }
      return
    }
    if (calls.has(id)) {
      terminal(new Error("Duplicate active desktop call identity."))
      return
    }
    const controller = new AbortController()
    const { path, input } = message.params
    const reportError = (cause: unknown) =>
      send({
        id,
        error: getTRPCErrorShape({
          config: router._def._config,
          error: getTRPCErrorFromUnknown(cause),
          type: "subscription",
          path,
          input,
          ctx: undefined,
        }),
      })
    let retire: () => void
    try {
      retire = admission.startWorkflow(path as OrdinaryWorkflowId, {
        cancel: () => controller.abort(),
      })
    } catch (error) {
      if (error instanceof HostAdmissionRefusedError) {
        send({
          id,
          result: { type: "data", data: { type: "admission-refused" } },
        })
        send({ id, result: { type: "stopped" } })
        return
      }
      reportError(error)
      return
    }
    // Identity and host admission precede the first asynchronous procedure lookup.
    calls.set(id, controller)
    const settle = () => {
      if (calls.get(id) !== controller) return
      calls.delete(id)
      retire()
    }
    const ctx: DesktopWorkflowContext = {
      signal: controller.signal,
      settle,
      terminal,
    }
    void callTRPCProcedure({
      router,
      path,
      type: "subscription",
      ctx,
      getRawInput: async () => input,
      signal: controller.signal,
      batchIndex: 0,
    })
      .then((stream) => {
        if (controller.signal.aborted) {
          settle()
          return
        }
        if (!isObservable(stream))
          throw new Error("Desktop procedure did not return an observable.")
        send({ id, result: { type: "started" } })
        stream.subscribe({
          next(data) {
            if (!controller.signal.aborted)
              send({ id, result: { type: "data", data } })
          },
          error(error) {
            settle()
            if (!controller.signal.aborted) reportError(error)
          },
          complete() {
            settle()
            if (!controller.signal.aborted)
              send({ id, result: { type: "stopped" } })
          },
        })
      })
      .catch((error) => {
        settle()
        if (!controller.signal.aborted) reportError(error)
      })
  }

  return { receive }
}

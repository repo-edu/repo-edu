import type { OrdinaryWorkflowId } from "@repo-edu/application-contract"
import { TRPCClientError, type TRPCLink } from "@trpc/client"
import { observable } from "@trpc/server/observable"
import type { DesktopTrpcBridge } from "./desktop-wire"
import type { DesktopRouter } from "./trpc"

export function desktopTrpcLink(
  bridge: DesktopTrpcBridge,
): TRPCLink<DesktopRouter> {
  return () =>
    ({ op }) =>
      observable((observer) => {
        if (op.type !== "subscription") {
          observer.error(
            TRPCClientError.from(
              new Error("Desktop workflows require subscriptions."),
            ),
          )
          return
        }
        const unsubscribe = bridge.subscribe((message) => {
          if (message.id !== op.id) return
          if ("error" in message) {
            observer.error(TRPCClientError.from(message))
          } else if (message.result.type === "stopped") {
            observer.complete()
          } else {
            observer.next({ result: message.result })
          }
        })
        try {
          bridge.send({
            id: op.id,
            method: "subscription",
            params: { path: op.path as OrdinaryWorkflowId, input: op.input },
          })
        } catch (error) {
          observer.error(TRPCClientError.from(error as Error))
        }
        return () => {
          unsubscribe()
          bridge.send({ id: op.id, method: "subscription.stop" })
        }
      })
}

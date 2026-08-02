import type { RendererHost } from "@repo-edu/renderer-host-contract"
import type { SessionController } from "./session-controller.js"

export function registerRendererCloseHandlers(
  rendererHost: Pick<RendererHost, "onCloseRequest" | "onCloseCancel">,
  controller: Pick<SessionController, "requestClose" | "cancelClose">,
): () => void {
  const unsubscribeClose = rendererHost.onCloseRequest((attemptId) =>
    controller.requestClose(attemptId),
  )
  const unsubscribeCancel = rendererHost.onCloseCancel((attemptId) => {
    controller.cancelClose(attemptId)
  })

  return () => {
    unsubscribeClose()
    unsubscribeCancel()
  }
}

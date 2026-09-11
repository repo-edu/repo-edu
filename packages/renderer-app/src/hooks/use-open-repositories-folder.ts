import { useCallback } from "react"
import { useRendererHost } from "../contexts/renderer-host.js"
import { useSessionController } from "../session/session-controller-context.js"
import { useToastStore } from "../stores/toast-store.js"
import { getErrorMessage } from "../utils/error-message.js"

export function useOpenRepositoriesFolder() {
  const rendererHost = useRendererHost()
  const controller = useSessionController()
  const addToast = useToastStore((state) => state.addToast)

  return useCallback(async () => {
    await controller.operations.execute("pickDirectory", async (scope) => {
      try {
        const dir = await scope.direct("pickDirectory", () =>
          rendererHost.pickDirectory({
            title: "Open folder of repositories",
          }),
        )
        if (dir) await scope.activateSurface({ kind: "folder", path: dir })
      } catch (error) {
        addToast(getErrorMessage(error), { tone: "error" })
      }
    })
  }, [addToast, controller, rendererHost])
}

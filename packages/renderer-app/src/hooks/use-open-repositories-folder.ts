import { useCallback } from "react"
import { useRendererHost } from "../contexts/renderer-host.js"
import { useSessionController } from "../session/session-controller-context.js"

export function useOpenRepositoriesFolder() {
  const rendererHost = useRendererHost()
  const controller = useSessionController()

  return useCallback(async () => {
    await controller.operations.execute("pickDirectory", async (scope) => {
      const dir = await scope.direct("pickDirectory", () =>
        rendererHost.pickDirectory({
          title: "Open folder of repositories",
        }),
      )
      if (dir) await scope.activateSurface({ kind: "folder", path: dir })
    })
  }, [controller, rendererHost])
}

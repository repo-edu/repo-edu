import { useCallback } from "react"
import { useRendererHost } from "../contexts/renderer-host.js"
import { useSessionController } from "../session/session-controller-context.js"

export function useOpenRepositoriesFolder() {
  const rendererHost = useRendererHost()
  const controller = useSessionController()

  return useCallback(async () => {
    const dir = await rendererHost.pickDirectory({
      title: "Open folder of repositories",
    })
    if (!dir) return
    await controller.activateSurface({
      kind: "folder",
      path: dir,
    })
  }, [controller, rendererHost])
}

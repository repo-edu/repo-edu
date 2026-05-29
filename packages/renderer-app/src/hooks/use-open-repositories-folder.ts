import { useCallback } from "react"
import { useRendererHost } from "../contexts/renderer-host.js"
import { useSessionController } from "../session/session-controller-context.js"
import { useAnalysisStore } from "../stores/analysis-store.js"

export function useOpenRepositoriesFolder() {
  const rendererHost = useRendererHost()
  const controller = useSessionController()
  const requestRepoDiscovery = useAnalysisStore((s) => s.requestRepoDiscovery)

  return useCallback(async () => {
    const dir = await rendererHost.pickDirectory({
      title: "Open folder of repositories",
    })
    if (!dir) return
    const activated = await controller.activateSurface({
      kind: "folder",
      path: dir,
    })
    if (activated) {
      requestRepoDiscovery(dir)
    }
  }, [controller, rendererHost, requestRepoDiscovery])
}

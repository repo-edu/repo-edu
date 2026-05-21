import { useCallback } from "react"
import { useRendererHost } from "../contexts/renderer-host.js"
import { useAnalysisStore } from "../stores/analysis-store.js"
import { useActiveSurfaceNavigation } from "./use-active-surface-navigation.js"

export function useOpenRepositoriesFolder() {
  const rendererHost = useRendererHost()
  const activateSurface = useActiveSurfaceNavigation()
  const requestRepoDiscovery = useAnalysisStore((s) => s.requestRepoDiscovery)

  return useCallback(async () => {
    const dir = await rendererHost.pickDirectory({
      title: "Open folder of repositories",
    })
    if (!dir) return
    const activated = await activateSurface(
      { kind: "folder", path: dir },
      { recordRecent: true, preferredTab: "analysis" },
    )
    if (activated) {
      requestRepoDiscovery(dir)
    }
  }, [activateSurface, rendererHost, requestRepoDiscovery])
}

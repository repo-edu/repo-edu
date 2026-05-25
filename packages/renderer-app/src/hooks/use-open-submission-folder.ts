import { useCallback } from "react"
import { useRendererHost } from "../contexts/renderer-host.js"
import { useActiveSurfaceNavigation } from "./use-active-surface-navigation.js"

export function useOpenSubmissionFolder(options: { courseId?: string } = {}) {
  const rendererHost = useRendererHost()
  const activateSurface = useActiveSurfaceNavigation()
  const courseId = options.courseId

  return useCallback(async () => {
    const dir = await rendererHost.pickDirectory({
      title: "Open student submission folder",
    })
    if (!dir) return
    await activateSurface(
      courseId === undefined
        ? { kind: "submission", path: dir }
        : { kind: "submission", path: dir, courseId },
      { recordRecent: true, preferredTab: "analysis" },
    )
  }, [activateSurface, courseId, rendererHost])
}

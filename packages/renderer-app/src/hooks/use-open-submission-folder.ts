import { useCallback } from "react"
import { useRendererHost } from "../contexts/renderer-host.js"
import { useSessionController } from "../session/session-controller-context.js"

export function useOpenSubmissionFolder(options: { courseId?: string } = {}) {
  const rendererHost = useRendererHost()
  const controller = useSessionController()
  const courseId = options.courseId

  return useCallback(async () => {
    const dir = await rendererHost.pickDirectory({
      title: "Open student submission folder",
    })
    if (!dir) return
    await controller.activateSurface(
      courseId === undefined
        ? { kind: "submission", path: dir }
        : { kind: "submission", path: dir, courseId },
    )
  }, [controller, courseId, rendererHost])
}

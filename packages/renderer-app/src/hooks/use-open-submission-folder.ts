import { useCallback } from "react"
import { useRendererHost } from "../contexts/renderer-host.js"
import { useSessionController } from "../session/session-controller-context.js"
import { useToastStore } from "../stores/toast-store.js"
import { getErrorMessage } from "../utils/error-message.js"

export function useOpenSubmissionFolder(options: { courseId?: string } = {}) {
  const rendererHost = useRendererHost()
  const controller = useSessionController()
  const addToast = useToastStore((state) => state.addToast)
  const courseId = options.courseId

  return useCallback(async () => {
    await controller.operations.execute("pickDirectory", async (scope) => {
      try {
        const dir = await scope.direct("pickDirectory", () =>
          rendererHost.pickDirectory({
            title: "Open student submission folder",
          }),
        )
        if (!dir) return
        await scope.activateSurface(
          courseId === undefined
            ? { kind: "submission", path: dir }
            : { kind: "submission", path: dir, courseId },
        )
      } catch (error) {
        addToast(getErrorMessage(error), { tone: "error" })
      }
    })
  }, [addToast, controller, courseId, rendererHost])
}

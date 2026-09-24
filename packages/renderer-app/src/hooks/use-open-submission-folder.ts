import { useCallback } from "react"
import {
  normalizeConfiguredExtensions,
  openSubmissionFolder,
} from "../components/tabs/examination/submission-file-listing.js"
import { selectDefaultExtensions } from "../session/selectors.js"
import { useSessionController } from "../session/session-controller-context.js"
import { useDirectoryPicker } from "./use-picker.js"

export function useOpenSubmissionFolder(options: { courseId?: string } = {}) {
  const pickDirectory = useDirectoryPicker()
  const controller = useSessionController()
  const courseId = options.courseId

  return useCallback(async () => {
    await pickDirectory(
      { title: "Open student submission folder" },
      async (directory, scope) => {
        await openSubmissionFolder(
          scope,
          courseId === undefined
            ? { path: directory }
            : { path: directory, courseId },
          normalizeConfiguredExtensions(
            selectDefaultExtensions(controller.getSnapshot()),
          ),
          false,
        )
      },
    )
  }, [controller, courseId, pickDirectory])
}

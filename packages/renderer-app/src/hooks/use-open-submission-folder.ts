import { useCallback } from "react"
import { useDirectoryPicker } from "./use-picker.js"

export function useOpenSubmissionFolder(options: { courseId?: string } = {}) {
  const pickDirectory = useDirectoryPicker()
  const courseId = options.courseId

  return useCallback(async () => {
    await pickDirectory(
      { title: "Open student submission folder" },
      async (directory, scope) => {
        await scope.activateSurface(
          courseId === undefined
            ? { kind: "submission", path: directory }
            : { kind: "submission", path: directory, courseId },
        )
      },
    )
  }, [courseId, pickDirectory])
}

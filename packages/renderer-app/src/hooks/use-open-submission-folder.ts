import { useMemo } from "react"
import { openSubmissionFolder } from "../components/tabs/examination/submission-file-listing.js"
import {
  bindSessionStart,
  type SessionStart,
} from "../session/session-start.js"
import { useDirectoryPicker } from "./use-picker.js"

export function useOpenSubmissionFolder() {
  const pickDirectory = useDirectoryPicker()

  return useMemo(
    () =>
      bindSessionStart(
        "openSubmission",
        async (start: SessionStart, courseId?: string) => {
          await pickDirectory(
            start,
            { title: "Open student submission folder" },
            async (directory, scope) => {
              await openSubmissionFolder(
                scope,
                courseId === undefined
                  ? { path: directory }
                  : { path: directory, courseId },
                "picker",
              )
            },
          )
        },
      ),
    [pickDirectory],
  )
}

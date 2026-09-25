import { useMemo } from "react"
import {
  bindSessionStart,
  type SessionStart,
} from "../session/session-start.js"
import { useDirectoryPicker } from "./use-picker.js"

export function useOpenRepositoriesFolder() {
  const pickDirectory = useDirectoryPicker()

  return useMemo(
    () =>
      bindSessionStart("openRepositories", async (start: SessionStart) => {
        await pickDirectory(
          start,
          { title: "Open folder of repositories" },
          async (directory, scope) => {
            await scope.activateSurface({ kind: "folder", path: directory })
          },
        )
      }),
    [pickDirectory],
  )
}

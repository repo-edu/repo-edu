import { useCallback } from "react"
import { useDirectoryPicker } from "./use-picker.js"

export function useOpenRepositoriesFolder() {
  const pickDirectory = useDirectoryPicker()

  return useCallback(async () => {
    await pickDirectory(
      { title: "Open folder of repositories" },
      async (directory, scope) => {
        await scope.activateSurface({ kind: "folder", path: directory })
      },
    )
  }, [pickDirectory])
}

import { EmptyState } from "@repo-edu/ui"
import { useEffect } from "react"
import { useAnalysisStore } from "../../../stores/analysis-store.js"
import { useCourseStore } from "../../../stores/course-store.js"
import { BlameTab } from "./BlameTab.js"

export function BlamePanel() {
  const result = useAnalysisStore((s) => s.result)
  const activeBlameFile = useAnalysisStore((s) => s.activeBlameFile)
  const blameErrorMessage = useAnalysisStore((s) => s.blameErrorMessage)
  const focusedFilePath = useAnalysisStore((s) => s.focusedFilePath)
  const openFileForBlame = useAnalysisStore((s) => s.openFileForBlame)
  const blameSkip =
    useCourseStore((s) => s.course?.analysisInputs.blameSkip) ?? false

  useEffect(() => {
    if (blameSkip) return
    if (!result) return
    if (activeBlameFile) return
    if (!focusedFilePath) return
    openFileForBlame(focusedFilePath)
  }, [blameSkip, result, activeBlameFile, focusedFilePath, openFileForBlame])

  return (
    <div className="flex h-full min-h-0 flex-col">
      {blameErrorMessage && (
        <div className="border-b border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {blameErrorMessage}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-auto">
        {activeBlameFile ? (
          <BlameTab filePath={activeBlameFile} />
        ) : (
          <div className="flex h-full items-center justify-center">
            <EmptyState message="Select a file in the sidebar." />
          </div>
        )}
      </div>
    </div>
  )
}

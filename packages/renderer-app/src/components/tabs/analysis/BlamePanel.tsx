import { EmptyState } from "@repo-edu/ui"
import { useEffect } from "react"
import { useAnalysisStore } from "../../../stores/analysis-store.js"
import { BlameTab } from "./BlameTab.js"

export function BlamePanel() {
  const result = useAnalysisStore((s) => s.result)
  const activeBlameFile = useAnalysisStore((s) => s.activeBlameFile)
  const blameWorkflowStatus = useAnalysisStore((s) => s.blameWorkflowStatus)
  const blameProgress = useAnalysisStore((s) => s.blameProgress)
  const blameErrorMessage = useAnalysisStore((s) => s.blameErrorMessage)
  const focusedFilePath = useAnalysisStore((s) => s.focusedFilePath)
  const openFileForBlame = useAnalysisStore((s) => s.openFileForBlame)
  const blameSkip = useAnalysisStore((s) => s.config.blameSkip ?? false)

  useEffect(() => {
    if (blameSkip) return
    if (!result) return
    if (activeBlameFile) return
    if (!focusedFilePath) return
    openFileForBlame(focusedFilePath)
  }, [blameSkip, result, activeBlameFile, focusedFilePath, openFileForBlame])

  const isRunning = blameWorkflowStatus === "running"

  return (
    <div className="flex h-full min-h-0 flex-col">
      {isRunning && blameProgress && (
        <div className="border-b px-3 py-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{blameProgress.label}</span>
            <span>
              {blameProgress.processedFiles}/{blameProgress.totalFiles}
            </span>
          </div>
          <div className="mt-1 h-1 w-full rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{
                width: `${blameProgress.totalFiles > 0 ? Math.round((blameProgress.processedFiles / blameProgress.totalFiles) * 100) : 0}%`,
              }}
            />
          </div>
        </div>
      )}

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

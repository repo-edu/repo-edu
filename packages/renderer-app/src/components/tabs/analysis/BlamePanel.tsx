import { EmptyState } from "@repo-edu/ui"
import { useEffect, useMemo } from "react"
import { useAnalysisCoordinator } from "../../../analysis/analysis-query-coordinator.js"
import { useAnalysisContext } from "../../../hooks/use-analysis-context.js"
import { useAnalysisStore } from "../../../stores/analysis-store.js"
import { BlameTab } from "./BlameTab.js"

export function BlamePanel() {
  const { result, blameErrorMessage } = useAnalysisCoordinator()
  const activeBlameFile = useAnalysisStore((s) => s.activeBlameFile)
  const focusedFilePath = useAnalysisStore((s) => s.focusedFilePath)
  const openFileForBlame = useAnalysisStore((s) => s.openFileForBlame)
  const blameSkip = useAnalysisContext().analysisInputs.blameSkip ?? false
  const resultFilePaths = useMemo(
    () => result?.fileStats.map((file) => file.path) ?? [],
    [result],
  )
  const effectiveActiveBlameFile =
    activeBlameFile !== null && resultFilePaths.includes(activeBlameFile)
      ? activeBlameFile
      : focusedFilePath !== null && resultFilePaths.includes(focusedFilePath)
        ? focusedFilePath
        : null

  useEffect(() => {
    if (blameSkip) return
    if (effectiveActiveBlameFile !== null) return
    const firstPath = resultFilePaths[0]
    if (firstPath === undefined) return
    openFileForBlame(firstPath)
  }, [blameSkip, effectiveActiveBlameFile, openFileForBlame, resultFilePaths])

  return (
    <div className="flex h-full min-h-0 flex-col">
      {blameErrorMessage && (
        <div className="border-b border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {blameErrorMessage}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-auto">
        {effectiveActiveBlameFile ? (
          <BlameTab filePath={effectiveActiveBlameFile} />
        ) : (
          <div className="flex h-full items-center justify-center">
            <EmptyState message="Select a file in the sidebar." />
          </div>
        )}
      </div>
    </div>
  )
}

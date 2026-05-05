import { useAnalysisStore } from "../../../stores/analysis-store.js"

export function BlameProgressBar() {
  const blameWorkflowStatus = useAnalysisStore((s) => s.blameWorkflowStatus)
  const blameProgress = useAnalysisStore((s) => s.blameProgress)

  if (blameWorkflowStatus !== "running" || !blameProgress) return null

  const percent =
    blameProgress.totalFiles > 0
      ? Math.round(
          (blameProgress.processedFiles / blameProgress.totalFiles) * 100,
        )
      : 0

  return (
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
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}

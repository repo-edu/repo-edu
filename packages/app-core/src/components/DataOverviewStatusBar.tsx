import { AlertTriangle } from "@repo-edu/ui/components/icons"
import { useDataOverview } from "../hooks/useDataOverview"
import { useUiStore } from "../stores/uiStore"

export function DataOverviewStatusBar() {
  const { issueSummary } = useDataOverview()
  const setDataOverviewOpen = useUiStore((state) => state.setDataOverviewOpen)

  const hasIssues = issueSummary.length > 0
  const visibleIssues = issueSummary.slice(0, 3)
  const extraCount = issueSummary.length - visibleIssues.length
  const summaryText = visibleIssues
    .map((item) => `${item.count} ${item.label}`)
    .join(" · ")

  return (
    <div
      className={`overflow-hidden transition-[max-height,opacity] duration-200 ease-out ${
        hasIssues ? "max-h-12 opacity-100" : "max-h-0 opacity-0"
      }`}
    >
      <button
        type="button"
        className="flex w-full items-center gap-2 bg-warning-muted px-3 py-2 text-sm text-warning"
        onClick={() => setDataOverviewOpen(true)}
        aria-live="polite"
      >
        <AlertTriangle className="size-4" />
        <span className="truncate">
          {summaryText}
          {extraCount > 0 ? ` · +${extraCount} more` : ""}
        </span>
        <span className="ml-auto text-muted-foreground">Details</span>
      </button>
    </div>
  )
}

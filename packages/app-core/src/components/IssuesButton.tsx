/**
 * IssuesButton - Opens the Issues sheet.
 * Shows a warning-colored issue count badge when issues exist.
 */

import { Button, Tooltip, TooltipContent, TooltipTrigger } from "@repo-edu/ui"
import { useIssues } from "../hooks/useIssues"
import { useProfileStore } from "../stores/profileStore"
import { useUiStore } from "../stores/uiStore"

export function IssuesButton() {
  const setIssuesPanelOpen = useUiStore((state) => state.setIssuesPanelOpen)
  const hasRoster = useProfileStore((state) => !!state.document?.roster)
  const { issueCards, checksDirty, checksStatus, runChecks } = useIssues()
  const issueCount = issueCards.length
  const isRunningChecks = checksStatus === "running"

  const handleClick = () => {
    setIssuesPanelOpen(true)
    if (hasRoster && !isRunningChecks) {
      void runChecks()
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 px-2 relative"
          onClick={handleClick}
        >
          <span className="text-xs">Issues</span>
          {issueCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-warning text-warning-foreground text-[10px] font-medium leading-none">
              {issueCount}
            </span>
          )}
          {checksDirty && issueCount === 0 && (
            <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-muted-foreground" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {checksDirty ? "Issues (checks out of date)" : "Issues"}
      </TooltipContent>
    </Tooltip>
  )
}

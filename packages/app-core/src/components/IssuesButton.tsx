/**
 * IssuesButton - Opens the Issues sheet.
 * Shows a warning-colored issue count badge when issues exist.
 */

import { Button, Tooltip, TooltipContent, TooltipTrigger } from "@repo-edu/ui"
import { useIssues } from "../hooks/useIssues"
import { useUiStore } from "../stores/uiStore"

export function IssuesButton() {
  const setIssuesPanelOpen = useUiStore((state) => state.setIssuesPanelOpen)
  const { issueCards } = useIssues()
  const issueCount = issueCards.length

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 px-2 relative"
          onClick={() => setIssuesPanelOpen(true)}
        >
          <span className="text-xs">Issues</span>
          {issueCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-warning text-warning-foreground text-[10px] font-medium leading-none">
              {issueCount}
            </span>
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>Issues</TooltipContent>
    </Tooltip>
  )
}

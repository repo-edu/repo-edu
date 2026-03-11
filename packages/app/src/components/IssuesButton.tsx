import { Button, Tooltip, TooltipContent, TooltipTrigger } from "@repo-edu/ui"
import { useIssues } from "../hooks/use-issues.js"
import { useProfileStore } from "../stores/profile-store.js"
import { useUiStore } from "../stores/ui-store.js"

export function IssuesButton() {
  const { issueCards, checksDirty, checksStatus } = useIssues()
  const hasRoster = useProfileStore((state) => !!state.profile?.roster)
  const runChecks = useProfileStore((state) => state.runChecks)
  const setIssuesSheetOpen = useUiStore((s) => s.setIssuesSheetOpen)

  const issueCount = issueCards.length
  const isRunningChecks = checksStatus === "running"
  const handleClick = () => {
    setIssuesSheetOpen(true)
    if (hasRoster && !isRunningChecks) {
      runChecks("username")
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
          <span className="text-[13px]">Issues</span>
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

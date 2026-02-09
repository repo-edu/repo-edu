import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@repo-edu/ui"
import { Lock } from "@repo-edu/ui/components/icons"

interface GroupLockIconProps {
  origin: "lms" | "system"
  /** True when the group appears in a local/import set (not its native LMS set). */
  inLocalSet?: boolean
}

function getTooltipText(origin: "lms" | "system", inLocalSet: boolean): string {
  if (origin === "system") {
    return "System groups are auto-managed and cannot be edited"
  }
  if (inLocalSet) {
    return "This group originated from an LMS sync and cannot be edited"
  }
  return "This group is synced from LMS and cannot be edited"
}

export function GroupLockIcon({
  origin,
  inLocalSet = false,
}: GroupLockIconProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Lock className="size-3 shrink-0 text-muted-foreground" />
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {getTooltipText(origin, inLocalSet)}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

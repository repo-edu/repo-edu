import type { RosterMember } from "@repo-edu/backend-interface/types"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@repo-edu/ui"
import { X } from "@repo-edu/ui/components/icons"

interface MemberChipProps {
  member: RosterMember
  isStaff: boolean
  onRemove?: () => void
}

export function MemberChip({ member, isStaff, onRemove }: MemberChipProps) {
  const chip = (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs bg-muted text-muted-foreground">
      <span>{member.name}</span>
      {onRemove && (
        <button
          type="button"
          className="ml-0.5 rounded-full p-0.5 hover:bg-foreground/10"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          aria-label={`Remove ${member.name}`}
        >
          <X className="size-2.5" />
        </button>
      )}
    </span>
  )

  if (!isStaff) return chip

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>{chip}</TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          Non-student role
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

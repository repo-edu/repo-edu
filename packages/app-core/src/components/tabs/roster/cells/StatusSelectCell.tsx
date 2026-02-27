import type {
  MemberStatus,
  RosterMember,
} from "@repo-edu/backend-interface/types"
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo-edu/ui"
import {
  Check,
  EllipsisVertical,
  RotateCcw,
  Trash2,
} from "@repo-edu/ui/components/icons"
import { formatStudentStatus } from "../../../../utils/labels"

const statuses: MemberStatus[] = ["active", "dropped", "incomplete"]

interface StatusCellProps {
  status: MemberStatus
  lmsStatus?: MemberStatus | null
  source: RosterMember["source"]
  onChange: (status: MemberStatus) => void
  onDeletePermanent: () => void
}

export function StatusCell({
  status,
  lmsStatus,
  source,
  onChange,
  onDeletePermanent,
}: StatusCellProps) {
  const isOverridden = lmsStatus != null && status !== lmsStatus
  const canDeletePermanently = source === "local"

  return (
    <span className="inline-flex items-center gap-0.5">
      <span className="text-sm">{formatStudentStatus(status)}</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-6 w-6 p-0">
            <EllipsisVertical className="size-3.5 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {statuses.map((s) => (
            <DropdownMenuItem
              key={s}
              disabled={s === status}
              onSelect={() => onChange(s)}
              className="gap-1"
            >
              <Check
                className={`size-3.5 ${s === status ? "opacity-100" : "opacity-0"}`}
              />
              {formatStudentStatus(s)}
            </DropdownMenuItem>
          ))}
          {isOverridden && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => onChange(lmsStatus)}
                className="gap-1"
              >
                <RotateCcw className="size-3.5" />
                Revert to LMS ({formatStudentStatus(lmsStatus)})
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator />
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <DropdownMenuItem
                  disabled={!canDeletePermanently}
                  onSelect={() => {
                    if (canDeletePermanently) {
                      onDeletePermanent()
                    }
                  }}
                  className="gap-1 text-destructive focus:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                  Delete permanently...
                </DropdownMenuItem>
              </span>
            </TooltipTrigger>
            {!canDeletePermanently && (
              <TooltipContent side="bottom" className="max-w-56">
                Only local members can be deleted. Use Dropped to exclude from
                group coverage.
              </TooltipContent>
            )}
          </Tooltip>
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  )
}

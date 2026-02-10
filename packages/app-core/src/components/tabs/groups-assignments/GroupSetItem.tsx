import type {
  Assignment,
  GroupSet,
  GroupSetConnection,
} from "@repo-edu/backend-interface/types"
import {
  Button,
  cn,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@repo-edu/ui"
import {
  ChevronRight,
  Layers,
  Loader2,
  Lock,
  Plus,
  Users,
} from "@repo-edu/ui/components/icons"
import type { KeyboardEvent } from "react"
import type { SidebarSelection } from "../../../stores/uiStore"
import {
  formatExactTimestamp,
  formatRelativeTime,
} from "../../../utils/relativeTime"
import { AssignmentItem } from "./AssignmentItem"

interface GroupSetItemProps {
  groupSet: GroupSet
  assignments: Assignment[]
  groupCount: number
  selection: SidebarSelection
  expanded: boolean
  onSelect: (selection: SidebarSelection) => void
  onToggleExpanded: (groupSetId: string) => void
  onAddAssignment: (groupSetId: string) => void
  isBusy?: boolean
  disableActions?: boolean
  tabIndex?: number
  onGroupSetKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void
  onAssignmentKeyDown?: (
    event: KeyboardEvent<HTMLButtonElement>,
    assignmentId: string,
  ) => void
  getAssignmentTabIndex?: (assignmentId: string) => number
}

function connectionBadge(connection: GroupSetConnection | null): string {
  if (!connection) return "Local"
  switch (connection.kind) {
    case "system":
      return "System"
    case "canvas":
      return "Canvas"
    case "moodle":
      return "Moodle"
    case "import":
      return "Import"
  }
}

function connectionTimestamp(
  connection: GroupSetConnection | null,
): { relative: string; exact: string | null } | null {
  if (!connection) return null
  switch (connection.kind) {
    case "canvas":
    case "moodle":
      return {
        relative: `synced ${formatRelativeTime(connection.last_updated)}`,
        exact: formatExactTimestamp(connection.last_updated),
      }
    case "import":
      return {
        relative: `imported ${formatRelativeTime(connection.last_updated)}`,
        exact: formatExactTimestamp(connection.last_updated),
      }
    default:
      return null
  }
}

function systemSetDescription(
  connection: GroupSetConnection | null,
): string | null {
  if (!connection || connection.kind !== "system") return null
  if (connection.system_type === "staff") {
    return "All non-student roles"
  }
  return null
}

export function GroupSetItem({
  groupSet,
  assignments,
  groupCount,
  selection,
  expanded,
  onSelect,
  onToggleExpanded,
  onAddAssignment,
  isBusy = false,
  disableActions = false,
  tabIndex,
  onGroupSetKeyDown,
  onAssignmentKeyDown,
  getAssignmentTabIndex,
}: GroupSetItemProps) {
  const connection = groupSet.connection
  const isSelected =
    selection?.kind === "group-set" && selection.id === groupSet.id
  const isSystem = connection?.kind === "system"
  const badge = connectionBadge(connection)
  const timestamp = connectionTimestamp(connection)
  const isReadOnly = connection !== null && connection.kind !== "import"
  const staffTooltip = systemSetDescription(connection)

  return (
    <div>
      <div
        className={cn(
          "flex items-center rounded-md",
          isSelected ? "bg-accent text-accent-foreground" : "hover:bg-muted/50",
        )}
      >
        {/* Expand/collapse toggle */}
        <button
          type="button"
          className="p-1 shrink-0"
          onClick={() => onToggleExpanded(groupSet.id)}
          aria-label={expanded ? "Collapse" : "Expand"}
          tabIndex={-1}
        >
          <ChevronRight
            className={cn(
              "size-3 transition-transform",
              expanded && "rotate-90",
            )}
          />
        </button>

        {/* Main clickable area */}
        <button
          type="button"
          className="flex-1 text-left py-1.5 pr-1 min-w-0"
          onClick={() => onSelect({ kind: "group-set", id: groupSet.id })}
          onKeyDown={onGroupSetKeyDown}
          tabIndex={tabIndex}
          data-sidebar-item-id={`group-set:${groupSet.id}`}
          aria-expanded={expanded}
        >
          <div className="flex items-center gap-1.5">
            {isSystem ? (
              staffTooltip ? (
                <TooltipProvider delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Users className="size-3.5 shrink-0 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent side="right" className="text-xs">
                      {staffTooltip}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                <Users className="size-3.5 shrink-0 text-muted-foreground" />
              )
            ) : isReadOnly ? (
              <Lock className="size-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <Layers className="size-3.5 shrink-0 text-muted-foreground" />
            )}
            <span className="truncate text-sm font-medium">
              {groupSet.name}
            </span>
            {isBusy && (
              <Loader2 className="size-3.5 shrink-0 text-muted-foreground animate-spin" />
            )}
          </div>
          <div className="flex items-center gap-1 pl-5 text-[11px] text-muted-foreground">
            <span>{badge}</span>
            <span>·</span>
            <span>
              {groupCount} group{groupCount !== 1 ? "s" : ""}
            </span>
            {timestamp && (
              <>
                <span>·</span>
                {timestamp.exact ? (
                  <TooltipProvider delayDuration={300}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-default">
                          {timestamp.relative}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">
                        {timestamp.exact}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <span>{timestamp.relative}</span>
                )}
              </>
            )}
          </div>
        </button>

        {/* Add assignment button */}
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 shrink-0 mr-1"
                disabled={disableActions}
                onClick={(e) => {
                  e.stopPropagation()
                  onAddAssignment(groupSet.id)
                }}
              >
                <Plus className="size-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              Add assignment
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Nested assignments */}
      {expanded && assignments.length > 0 && (
        <div className="space-y-0.5 mt-0.5">
          {assignments.map((assignment) => (
            <AssignmentItem
              key={assignment.id}
              assignment={assignment}
              groupSet={groupSet}
              selection={selection}
              onSelect={onSelect}
              onKeyDown={(event) => onAssignmentKeyDown?.(event, assignment.id)}
              tabIndex={getAssignmentTabIndex?.(assignment.id) ?? -1}
            />
          ))}
        </div>
      )}
      {expanded && assignments.length === 0 && (
        <p className="pl-8 py-1 text-[11px] text-muted-foreground">
          Add an assignment using the + button
        </p>
      )}
    </div>
  )
}

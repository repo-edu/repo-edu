import type {
  GroupSet,
  GroupSetConnection,
} from "@repo-edu/backend-interface/types"
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@repo-edu/ui"
import {
  Copy,
  Download,
  EllipsisVertical,
  Layers,
  Loader2,
  Lock,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  Users,
} from "@repo-edu/ui/components/icons"
import type { KeyboardEvent } from "react"
import type { SidebarSelection } from "../../../stores/uiStore"
import {
  formatExactTimestamp,
  formatRelativeTime,
} from "../../../utils/relativeTime"

interface GroupSetItemActions {
  onAddAssignment?: () => void
  onRename?: () => void
  onSync?: () => void
  onReimport?: () => void
  onExport?: () => void
  onCopy?: () => void
  onDelete?: () => void
}

interface GroupSetItemProps {
  groupSet: GroupSet
  groupCount: number
  selection: SidebarSelection
  onSelect: (selection: SidebarSelection) => void
  actions?: GroupSetItemActions
  disabled?: boolean
  isBusy?: boolean
  tabIndex?: number
  onKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void
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
  groupCount,
  selection,
  onSelect,
  actions,
  disabled = false,
  isBusy = false,
  tabIndex,
  onKeyDown,
}: GroupSetItemProps) {
  const connection = groupSet.connection
  const isSelected =
    selection?.kind === "group-set" && selection.id === groupSet.id
  const isSystem = connection?.kind === "system"
  const badge = connectionBadge(connection)
  const timestamp = connectionTimestamp(connection)
  const isReadOnly = connection !== null && connection.kind !== "import"
  const staffTooltip = systemSetDescription(connection)
  const hasActions =
    actions &&
    (actions.onAddAssignment ||
      actions.onRename ||
      actions.onSync ||
      actions.onReimport ||
      actions.onExport ||
      actions.onCopy ||
      actions.onDelete)

  return (
    <div
      className={cn(
        "flex items-center rounded-md",
        isSelected ? "bg-selection" : "hover:bg-muted/50",
      )}
    >
      <button
        type="button"
        className="flex-1 text-left py-1.5 px-2 min-w-0"
        onClick={() => onSelect({ kind: "group-set", id: groupSet.id })}
        onKeyDown={onKeyDown}
        tabIndex={tabIndex}
        data-sidebar-item-id={`group-set:${groupSet.id}`}
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
          <span className="truncate text-sm font-medium">{groupSet.name}</span>
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
      {hasActions && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 shrink-0 mr-1"
              disabled={disabled}
              onClick={(e) => e.stopPropagation()}
            >
              <EllipsisVertical className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {actions.onRename && (
              <DropdownMenuItem disabled={disabled} onClick={actions.onRename}>
                <Pencil className="size-3.5 mr-2" />
                Rename
              </DropdownMenuItem>
            )}
            {actions.onReimport && (
              <DropdownMenuItem
                disabled={disabled}
                onClick={actions.onReimport}
              >
                <Download className="size-3.5 mr-2" />
                Import
              </DropdownMenuItem>
            )}
            {actions.onSync && (
              <DropdownMenuItem disabled={disabled} onClick={actions.onSync}>
                <RefreshCw className="size-3.5 mr-2" />
                Sync
              </DropdownMenuItem>
            )}
            {actions.onExport && (
              <DropdownMenuItem disabled={disabled} onClick={actions.onExport}>
                <Upload className="size-3.5 mr-2" />
                Export
              </DropdownMenuItem>
            )}
            {actions.onCopy && (
              <DropdownMenuItem disabled={disabled} onClick={actions.onCopy}>
                <Copy className="size-3.5 mr-2" />
                Copy
              </DropdownMenuItem>
            )}
            {actions.onAddAssignment && (
              <DropdownMenuItem
                disabled={disabled}
                onClick={actions.onAddAssignment}
              >
                <Plus className="size-3.5 mr-2" />
                Add Assignment
              </DropdownMenuItem>
            )}
            {actions.onDelete && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  disabled={disabled}
                  onClick={actions.onDelete}
                >
                  <Trash2 className="size-3.5 mr-2" />
                  Delete
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}

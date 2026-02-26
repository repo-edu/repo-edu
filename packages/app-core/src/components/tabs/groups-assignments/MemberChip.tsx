import type { RosterMember } from "@repo-edu/backend-interface/types"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Label,
  RadioGroup,
  RadioGroupItem,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@repo-edu/ui"
import {
  ChevronRight,
  EllipsisVertical,
  Layers,
  Plus,
  Trash2,
  Users,
} from "@repo-edu/ui/components/icons"
import { useState } from "react"
import type { EditableGroupTarget } from "../../../stores/profileStore"
import { ConnectionBadge, connectionKindLabel } from "./ConnectionBadge"

type ActionMode = "copy" | "move"

interface MemberChipProps {
  member: RosterMember
  isStaff: boolean
  sourceGroupId: string
  sourceGroupEditable: boolean
  editableTargets: EditableGroupTarget[]
  /** Set of group IDs this member already belongs to (for dedup filtering) */
  memberGroupIds: Set<string>
  onRemove?: () => void
  onMove?: (targetGroupId: string) => void
  onCopy?: (targetGroupId: string) => void
  onMoveToNewGroupSet?: () => void
  onCopyToNewGroupSet?: () => void
  onMoveToNewGroup?: (groupSetId: string) => void
  onCopyToNewGroup?: (groupSetId: string) => void
}

/**
 * Build the list of group set targets for move or copy, filtering out groups
 * where the member is already present and the current source group.
 */
function buildTargets(
  editableTargets: EditableGroupTarget[],
  sourceGroupId: string,
  memberGroupIds: Set<string>,
) {
  return editableTargets
    .map((gs) => ({
      ...gs,
      groups: gs.groups.filter(
        (g) => g.id !== sourceGroupId && !memberGroupIds.has(g.id),
      ),
    }))
    .filter((gs) => gs.groups.length > 0)
}

export function MemberChip({
  member,
  isStaff,
  sourceGroupId,
  sourceGroupEditable,
  editableTargets,
  memberGroupIds,
  onRemove,
  onMove,
  onCopy,
  onMoveToNewGroupSet,
  onCopyToNewGroupSet,
  onMoveToNewGroup,
  onCopyToNewGroup,
}: MemberChipProps) {
  // copyTargets is the superset — move uses the same filter but is only
  // available when the source group is editable.
  const targets = buildTargets(editableTargets, sourceGroupId, memberGroupIds)

  const hasMove =
    sourceGroupEditable && (targets.length > 0 || !!onMoveToNewGroupSet)
  const hasCopy = targets.length > 0 || !!onCopyToNewGroupSet
  const hasRemove = !!onRemove
  const hasActions = hasCopy || hasMove || hasRemove

  const chip = (
    <span className="inline-flex items-center rounded-full pl-2 pr-1 py-0.5 text-xs bg-muted text-muted-foreground">
      <span>{member.name}</span>
      {hasActions && (
        <MemberActionsDropdown
          memberName={member.name}
          targets={targets}
          hasCopy={hasCopy}
          hasMove={hasMove}
          hasRemove={hasRemove}
          onCopy={onCopy}
          onMove={onMove}
          onRemove={onRemove}
          onCopyToNewGroupSet={onCopyToNewGroupSet}
          onMoveToNewGroupSet={onMoveToNewGroupSet}
          onCopyToNewGroup={onCopyToNewGroup}
          onMoveToNewGroup={onMoveToNewGroup}
        />
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

// ---------------------------------------------------------------------------
// Unified actions dropdown with copy/move mode toggle
// ---------------------------------------------------------------------------

function MemberActionsDropdown({
  memberName,
  targets,
  hasCopy,
  hasMove,
  hasRemove,
  onCopy,
  onMove,
  onRemove,
  onCopyToNewGroupSet,
  onMoveToNewGroupSet,
  onCopyToNewGroup,
  onMoveToNewGroup,
}: {
  memberName: string
  targets: EditableGroupTarget[]
  hasCopy: boolean
  hasMove: boolean
  hasRemove: boolean
  onCopy?: (targetGroupId: string) => void
  onMove?: (targetGroupId: string) => void
  onRemove?: () => void
  onCopyToNewGroupSet?: () => void
  onMoveToNewGroupSet?: () => void
  onCopyToNewGroup?: (groupSetId: string) => void
  onMoveToNewGroup?: (groupSetId: string) => void
}) {
  const [mode, setMode] = useState<ActionMode>("copy")
  const hasBoth = hasCopy && hasMove
  const hasNewGroupSet = !!onCopyToNewGroupSet || !!onMoveToNewGroupSet

  const onSelectGroup =
    mode === "move" ? (onMove ?? onCopy) : (onCopy ?? onMove)
  const onNewGroupSet =
    mode === "move"
      ? (onMoveToNewGroupSet ?? onCopyToNewGroupSet)
      : (onCopyToNewGroupSet ?? onMoveToNewGroupSet)
  const onNewGroup =
    mode === "move"
      ? (onMoveToNewGroup ?? onCopyToNewGroup)
      : (onCopyToNewGroup ?? onMoveToNewGroup)

  return (
    <DropdownMenu onOpenChange={(open) => !open && setMode("copy")}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="rounded-full p-0.5 hover:bg-foreground/10"
          onClick={(e) => e.stopPropagation()}
          aria-label={`Actions for ${memberName}`}
        >
          <EllipsisVertical className="size-2.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        {/* Mode toggle or static label */}
        {hasBoth ? (
          <>
            <div className="px-2 py-1.5">
              <RadioGroup
                size="xs"
                value={mode}
                onValueChange={(v) => setMode(v as ActionMode)}
                className="flex gap-4"
              >
                <div className="flex items-center gap-1">
                  <RadioGroupItem
                    value="copy"
                    id="mode-copy"
                    className="size-3 [&_svg]:size-1.5"
                  />
                  <Label
                    htmlFor="mode-copy"
                    className="font-normal text-xs cursor-pointer"
                  >
                    Copy to
                  </Label>
                </div>
                <div className="flex items-center gap-1">
                  <RadioGroupItem
                    value="move"
                    id="mode-move"
                    className="size-3 [&_svg]:size-1.5"
                  />
                  <Label
                    htmlFor="mode-move"
                    className="font-normal text-xs cursor-pointer"
                  >
                    Move to
                  </Label>
                </div>
              </RadioGroup>
            </div>
            <DropdownMenuSeparator />
          </>
        ) : (
          <>
            <DropdownMenuLabel>Copy to…</DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        )}

        {/* New Group Set */}
        {hasNewGroupSet && (
          <DropdownMenuItem onClick={onNewGroupSet}>
            <Plus className="size-3.5 mr-2" />
            New Group Set
          </DropdownMenuItem>
        )}

        {/* Group set targets */}
        {hasNewGroupSet && targets.length > 0 && <DropdownMenuSeparator />}
        {targets.map((gs) => (
          <GroupSetSubmenu
            key={gs.groupSetId}
            groupSet={gs}
            showBadge
            onSelect={(groupId) => onSelectGroup?.(groupId)}
            onNewGroup={() => onNewGroup?.(gs.groupSetId)}
          />
        ))}

        {/* Remove action */}
        {hasRemove && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => onRemove?.()}
            >
              <Trash2 className="size-3.5 mr-2" />
              Remove from group
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ---------------------------------------------------------------------------
// Group set submenu
// ---------------------------------------------------------------------------

function GroupSetSubmenu({
  groupSet,
  showBadge,
  onSelect,
  onNewGroup,
}: {
  groupSet: EditableGroupTarget
  showBadge: boolean
  onSelect: (groupId: string) => void
  onNewGroup: () => void
}) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Layers className="size-3.5 shrink-0 text-muted-foreground mr-1.5" />
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="truncate">{groupSet.groupSetName}</span>
          {showBadge && (
            <ConnectionBadge
              label={connectionKindLabel(groupSet.connectionKind)}
            />
          )}
        </span>
        <ChevronRight className="size-3.5 ml-auto" />
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-48">
        <DropdownMenuItem onClick={onNewGroup}>
          <Plus className="size-3.5 mr-2" />
          New Group
        </DropdownMenuItem>
        {groupSet.groups.length > 0 && <DropdownMenuSeparator />}
        {groupSet.groups.map((group) => (
          <DropdownMenuItem key={group.id} onClick={() => onSelect(group.id)}>
            <Users className="size-3.5 mr-2" />
            {group.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}

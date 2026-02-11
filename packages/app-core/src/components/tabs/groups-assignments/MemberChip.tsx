import type { RosterMember } from "@repo-edu/backend-interface/types"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@repo-edu/ui"
import {
  ArrowRightLeft,
  ChevronRight,
  Copy,
  Plus,
  X,
} from "@repo-edu/ui/components/icons"
import type { EditableGroupTarget } from "../../../stores/profileStore"

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
  const moveTargets = sourceGroupEditable
    ? buildTargets(editableTargets, sourceGroupId, memberGroupIds)
    : []
  const copyTargets = buildTargets(
    editableTargets,
    sourceGroupId,
    memberGroupIds,
  )

  const hasMove =
    sourceGroupEditable && (moveTargets.length > 0 || onMoveToNewGroupSet)
  const hasCopy = copyTargets.length > 0 || onCopyToNewGroupSet
  const hasRemove = !!onRemove

  const chip = (
    <span className="inline-flex items-center gap-0.5 rounded-full pl-2 pr-1 py-0.5 text-xs bg-muted text-muted-foreground">
      <span className="pr-0.5">{member.name}</span>
      {hasCopy && (
        <ActionDropdown
          icon={<Copy className="size-2.5" />}
          label={`Copy ${member.name}`}
          targets={copyTargets}
          onSelect={(groupId) => onCopy?.(groupId)}
          onNewGroupSet={onCopyToNewGroupSet}
          onNewGroup={(gsId) => onCopyToNewGroup?.(gsId)}
        />
      )}
      {hasMove && (
        <ActionDropdown
          icon={<ArrowRightLeft className="size-2.5" />}
          label={`Move ${member.name}`}
          targets={moveTargets}
          onSelect={(groupId) => onMove?.(groupId)}
          onNewGroupSet={onMoveToNewGroupSet}
          onNewGroup={(gsId) => onMoveToNewGroup?.(gsId)}
        />
      )}
      {hasRemove && (
        <button
          type="button"
          className="rounded-full p-0.5 hover:bg-foreground/10 hover:text-destructive"
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

function ActionDropdown({
  icon,
  label,
  targets,
  onSelect,
  onNewGroupSet,
  onNewGroup,
}: {
  icon: React.ReactNode
  label: string
  targets: EditableGroupTarget[]
  onSelect: (groupId: string) => void
  onNewGroupSet?: () => void
  onNewGroup: (groupSetId: string) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="rounded-full p-0.5 hover:bg-foreground/10"
          onClick={(e) => e.stopPropagation()}
          aria-label={label}
        >
          {icon}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        {onNewGroupSet && (
          <>
            <DropdownMenuItem onClick={onNewGroupSet}>
              <Plus className="size-3.5 mr-2" />
              New Group Set
            </DropdownMenuItem>
            {targets.length > 0 && <DropdownMenuSeparator />}
          </>
        )}
        {targets.map((gs) => (
          <GroupSetSubmenu
            key={gs.groupSetId}
            groupSet={gs}
            onSelect={onSelect}
            onNewGroup={() => onNewGroup(gs.groupSetId)}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function GroupSetSubmenu({
  groupSet,
  onSelect,
  onNewGroup,
}: {
  groupSet: EditableGroupTarget
  onSelect: (groupId: string) => void
  onNewGroup: () => void
}) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        {groupSet.groupSetName}
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
            {group.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}

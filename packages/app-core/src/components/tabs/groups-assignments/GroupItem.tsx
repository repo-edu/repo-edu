import type { Group, RosterMember } from "@repo-edu/backend-interface/types"
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
} from "@repo-edu/ui"
import {
  AlertTriangle,
  EllipsisVertical,
  Pencil,
  Trash2,
  Users,
  X,
} from "@repo-edu/ui/components/icons"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  type EditableGroupTarget,
  selectGroupReferenceCount,
  useProfileStore,
} from "../../../stores/profileStore"
import { GroupLockIcon } from "./GroupLockIcon"
import { MemberChip } from "./MemberChip"

interface GroupItemProps {
  group: Group
  groupSetId: string
  members: RosterMember[]
  staffIds: Set<string>
  isSetEditable: boolean
  disabled?: boolean
  editableTargets: EditableGroupTarget[]
  memberGroupIndex: Map<string, Set<string>>
  onRemoveFromSet?: () => void
  onDeleteGroup?: () => void
}

export function GroupItem({
  group,
  groupSetId,
  members,
  staffIds,
  isSetEditable,
  disabled = false,
  editableTargets,
  memberGroupIndex,
  onRemoveFromSet,
  onDeleteGroup,
}: GroupItemProps) {
  const isEditable = group.origin === "local"
  const isLocked = group.origin !== "local"
  const referenceCount = useProfileStore(selectGroupReferenceCount(group.id))
  const isShared = referenceCount > 1
  const updateGroup = useProfileStore((state) => state.updateGroup)
  const removeGroupFromSet = useProfileStore(
    (state) => state.removeGroupFromSet,
  )
  const moveMemberToGroup = useProfileStore((state) => state.moveMemberToGroup)
  const copyMemberToGroup = useProfileStore((state) => state.copyMemberToGroup)
  const createGroupSetWithMember = useProfileStore(
    (state) => state.createGroupSetWithMember,
  )
  const createGroupInSetWithMember = useProfileStore(
    (state) => state.createGroupInSetWithMember,
  )

  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(group.name)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const handleSaveName = useCallback(() => {
    if (disabled) {
      setIsEditing(false)
      setEditName(group.name)
      return
    }
    const trimmed = editName.trim()
    if (trimmed && trimmed !== group.name) {
      updateGroup(group.id, { name: trimmed })
    }
    setIsEditing(false)
    setEditName(group.name)
  }, [editName, group.name, group.id, updateGroup])

  const handleRemoveMember = useCallback(
    (memberId: string) => {
      if (!isEditable || disabled) return
      const newMemberIds = group.member_ids.filter((id) => id !== memberId)
      updateGroup(group.id, { member_ids: newMemberIds })
    },
    [disabled, group.id, group.member_ids, isEditable, updateGroup],
  )

  return (
    <div className="py-1.5 space-y-1">
      {/* Group header */}
      <div className="flex items-center gap-2">
        {isLocked && (
          <GroupLockIcon
            origin={group.origin as "lms" | "system"}
            inLocalSet={isSetEditable}
          />
        )}

        {isEditing ? (
          <Input
            ref={inputRef}
            value={editName}
            disabled={disabled}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleSaveName}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSaveName()
              if (e.key === "Escape") {
                setIsEditing(false)
                setEditName(group.name)
              }
            }}
            className="h-6 text-sm px-1.5 py-0"
          />
        ) : (
          <button
            type="button"
            className={cn(
              "text-sm font-medium truncate text-left",
              isEditable && "hover:underline cursor-pointer",
            )}
            onClick={() => {
              if (isEditable && !disabled) {
                setEditName(group.name)
                setIsEditing(true)
              }
            }}
            disabled={!isEditable || disabled}
          >
            {group.name}
          </button>
        )}

        <span className="text-xs text-muted-foreground ml-auto shrink-0">
          {members.length} member{members.length !== 1 ? "s" : ""}
        </span>

        {/* Actions: inline remove button for read-only groups, full menu for editable */}
        {!isEditable && isSetEditable && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
            disabled={disabled}
            onClick={() => {
              if (disabled) return
              removeGroupFromSet(groupSetId, group.id)
              onRemoveFromSet?.()
            }}
          >
            <Trash2 className="size-3.5" />
          </Button>
        )}
        {isEditable && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                disabled={disabled}
              >
                <EllipsisVertical className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem
                disabled={disabled}
                onClick={() => {
                  if (disabled) return
                  setEditName(group.name)
                  setIsEditing(true)
                }}
              >
                <Pencil className="size-3.5 mr-2" />
                Rename
              </DropdownMenuItem>
              {isSetEditable && (
                <DropdownMenuItem
                  disabled={disabled}
                  onClick={() => {
                    if (disabled) return
                    removeGroupFromSet(groupSetId, group.id)
                    onRemoveFromSet?.()
                  }}
                >
                  <X className="size-3.5 mr-2" />
                  Remove from set
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                disabled={disabled}
                onClick={() => onDeleteGroup?.()}
              >
                <Trash2 className="size-3.5 mr-2" />
                {isShared ? "Delete from all sets" : "Delete"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Shared-group banner — only relevant for editable groups */}
      {isShared && isEditable && (
        <div className="flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
          <AlertTriangle className="size-3 shrink-0" />
          <span>
            Shared by {referenceCount} group sets. Changes apply everywhere.
          </span>
        </div>
      )}

      {/* Member chips */}
      {members.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {members.map((member) => (
            <MemberChip
              key={member.id}
              member={member}
              isStaff={staffIds.has(member.id)}
              sourceGroupId={group.id}
              sourceGroupEditable={isEditable}
              editableTargets={editableTargets}
              memberGroupIds={memberGroupIndex.get(member.id) ?? EMPTY_SET}
              onRemove={
                isEditable && !disabled
                  ? () => handleRemoveMember(member.id)
                  : undefined
              }
              onMove={
                isEditable && !disabled
                  ? (targetGroupId) =>
                      moveMemberToGroup(member.id, group.id, targetGroupId)
                  : undefined
              }
              onCopy={
                !disabled
                  ? (targetGroupId) =>
                      copyMemberToGroup(member.id, targetGroupId)
                  : undefined
              }
              onMoveToNewGroupSet={
                isEditable && !disabled
                  ? () => createGroupSetWithMember(member.id, group.id, "move")
                  : undefined
              }
              onCopyToNewGroupSet={
                !disabled
                  ? () =>
                      createGroupSetWithMember(
                        member.id,
                        isEditable ? group.id : null,
                        "copy",
                      )
                  : undefined
              }
              onMoveToNewGroup={
                isEditable && !disabled
                  ? (groupSetId) =>
                      createGroupInSetWithMember(
                        member.id,
                        groupSetId,
                        group.id,
                        "move",
                      )
                  : undefined
              }
              onCopyToNewGroup={
                !disabled
                  ? (groupSetId) =>
                      createGroupInSetWithMember(
                        member.id,
                        groupSetId,
                        isEditable ? group.id : null,
                        "copy",
                      )
                  : undefined
              }
            />
          ))}
        </div>
      )}

      {members.length === 0 && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users className="size-3" />
          <span>No members</span>
        </div>
      )}
    </div>
  )
}

const EMPTY_SET = new Set<string>()

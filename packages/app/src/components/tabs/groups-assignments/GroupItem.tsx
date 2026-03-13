import type { Group, RosterMember } from "@repo-edu/domain"
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
  EllipsisVertical,
  Pencil,
  Trash2,
  Users,
  X,
} from "@repo-edu/ui/components/icons"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  type EditableGroupTarget,
  selectOtherGroupSetNames,
  useCourseStore,
} from "../../../stores/course-store.js"
import { GroupLockIcon } from "./GroupLockIcon.js"
import { MemberChip } from "./MemberChip.js"

type GroupItemProps = {
  group: Group
  groupSetId: string
  members: RosterMember[]
  staffIds: Set<string>
  isSetEditable: boolean
  disabled?: boolean
  editableTargets: EditableGroupTarget[]
  memberGroupIndex: Map<string, Set<string>>
  onDeleteGroup?: () => void
  repoNamePreview?: string | null
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
  onDeleteGroup,
  repoNamePreview,
}: GroupItemProps) {
  const isEditable = group.origin === "local"
  const isLocked = group.origin !== "local"

  const otherSetNames = useMemo(
    () => selectOtherGroupSetNames(group.id, groupSetId),
    [group.id, groupSetId],
  )
  const otherNames = useCourseStore(otherSetNames)
  const isShared = otherNames.length > 0

  const updateGroup = useCourseStore((s) => s.updateGroup)
  const removeGroupFromSet = useCourseStore((s) => s.removeGroupFromSet)
  const moveMemberToGroup = useCourseStore((s) => s.moveMemberToGroup)
  const copyMemberToGroup = useCourseStore((s) => s.copyMemberToGroup)

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
  }, [editName, group.name, group.id, updateGroup, disabled])

  const handleRemoveMember = useCallback(
    (memberId: string) => {
      if (!isEditable || disabled) return
      updateGroup(group.id, {
        memberIds: group.memberIds.filter((id) => id !== memberId),
      })
    },
    [disabled, group.id, group.memberIds, isEditable, updateGroup],
  )

  return (
    <div className="py-1.5 space-y-1">
      {/* Group header */}
      <div className="flex items-center gap-2">
        <Users className="size-3 shrink-0 text-muted-foreground" />

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

        {isLocked && (
          <GroupLockIcon
            origin={group.origin as "lms" | "system"}
            inLocalSet={isSetEditable}
          />
        )}

        {repoNamePreview && (
          <span className="text-xs text-muted-foreground truncate ml-1">
            Repo: {repoNamePreview}
          </span>
        )}

        <span className="text-sm ml-auto mr-4 shrink-0">{members.length}</span>

        {/* Actions menu for editable groups */}
        {isEditable && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 shrink-0"
                disabled={disabled}
              >
                <EllipsisVertical className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem
                disabled={disabled}
                onClick={() => {
                  setEditName(group.name)
                  setIsEditing(true)
                }}
              >
                <Pencil className="size-3.5 mr-2" />
                Rename
              </DropdownMenuItem>
              {isShared && (
                <DropdownMenuItem
                  disabled={disabled}
                  onClick={() => removeGroupFromSet(groupSetId, group.id)}
                >
                  <X className="size-3.5 mr-2" />
                  Remove from set
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                disabled={disabled}
                onClick={onDeleteGroup}
              >
                <Trash2 className="size-3.5 mr-2" />
                Delete group
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Remove button for locked groups in editable sets */}
        {!isEditable && isSetEditable && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive shrink-0"
            onClick={() => removeGroupFromSet(groupSetId, group.id)}
            disabled={disabled}
            title="Remove from group set"
          >
            <X className="size-3.5" />
          </Button>
        )}
      </div>

      {/* Shared group warning */}
      {isShared && (
        <p className="text-[11px] text-muted-foreground pl-5">
          Also in: {otherNames.join(", ")}
        </p>
      )}

      {/* Member chips */}
      {members.length > 0 && (
        <div className="flex flex-wrap gap-1 pl-5">
          {members.map((member) => (
            <MemberChip
              key={member.id}
              member={member}
              isStaff={staffIds.has(member.id)}
              sourceGroupId={group.id}
              sourceGroupEditable={isEditable}
              editableTargets={editableTargets}
              memberGroupIds={memberGroupIndex.get(member.id) ?? new Set()}
              onRemove={
                isEditable && !disabled
                  ? () => handleRemoveMember(member.id)
                  : undefined
              }
              onMove={
                isEditable && !disabled
                  ? (targetId) =>
                      moveMemberToGroup(member.id, group.id, targetId)
                  : undefined
              }
              onCopy={
                !disabled
                  ? (targetId) => copyMemberToGroup(member.id, targetId)
                  : undefined
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}

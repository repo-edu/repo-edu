import type { Group } from "@repo-edu/domain"
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
  X,
} from "@repo-edu/ui/components/icons"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  selectOtherGroupSetNames,
  useCourseStore,
} from "../../../stores/course-store.js"
import { GroupLockIcon } from "./GroupLockIcon.js"

type GroupNameCellProps = {
  group: Group
  groupSetId: string
  isSetEditable: boolean
  disabled: boolean
  onDeleteGroup: () => void
}

export function GroupNameCell({
  group,
  groupSetId,
  isSetEditable,
  disabled,
  onDeleteGroup,
}: GroupNameCellProps) {
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

  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1.5">
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
        <p className="text-[11px] text-muted-foreground">
          Also in: {otherNames.join(", ")}
        </p>
      )}
    </div>
  )
}

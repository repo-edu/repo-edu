import type {
  Assignment,
  AssignmentMetadata,
} from "@repo-edu/backend-interface/types"
import { Button, EmptyState, Input, Separator, Text } from "@repo-edu/ui"
import { ArrowRightLeft, Trash2, Users } from "@repo-edu/ui/components/icons"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  selectGroupSetById,
  useProfileStore,
} from "../../../stores/profileStore"
import { useUiStore } from "../../../stores/uiStore"

interface AssignmentPanelProps {
  assignmentId: string
}

export function AssignmentPanel({ assignmentId }: AssignmentPanelProps) {
  const assignment = useProfileStore(
    (state) =>
      state.document?.roster?.assignments.find((a) => a.id === assignmentId) ??
      null,
  )
  const updateAssignment = useProfileStore((state) => state.updateAssignment)
  const deleteAssignment = useProfileStore((state) => state.deleteAssignment)
  const setSidebarSelection = useUiStore((state) => state.setSidebarSelection)
  const setChangeGroupSetAssignmentId = useUiStore(
    (state) => state.setChangeGroupSetAssignmentId,
  )
  const isOperationActive = useUiStore(
    (state) => state.groupSetOperation !== null,
  )

  if (!assignment) {
    return (
      <EmptyState message="Assignment not found">
        <Text className="text-muted-foreground text-center">
          The selected assignment no longer exists.
        </Text>
      </EmptyState>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <AssignmentHeader
        assignment={assignment}
        onUpdate={updateAssignment}
        disabled={isOperationActive}
      />
      <Separator />
      <AssignmentToolbar
        disabled={isOperationActive}
        onChangeGroupSet={() => setChangeGroupSetAssignmentId(assignment.id)}
        onDelete={() => {
          deleteAssignment(assignment.id)
          setSidebarSelection(null)
        }}
      />
      <Separator />
    </div>
  )
}

// --- Header ---

function AssignmentHeader({
  assignment,
  onUpdate,
  disabled,
}: {
  assignment: Assignment
  onUpdate: (id: string, updates: Partial<AssignmentMetadata>) => void
  disabled: boolean
}) {
  const groupSet = useProfileStore(selectGroupSetById(assignment.group_set_id))
  const setSidebarSelection = useUiStore((state) => state.setSidebarSelection)

  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(assignment.name)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  useEffect(() => {
    if (!isEditing) setEditName(assignment.name)
  }, [assignment.name, isEditing])

  const handleSave = useCallback(() => {
    const trimmed = editName.trim()
    if (trimmed && trimmed !== assignment.name) {
      onUpdate(assignment.id, { name: trimmed })
    }
    setIsEditing(false)
  }, [editName, assignment.name, assignment.id, onUpdate])

  return (
    <div className="px-4 py-3 space-y-1">
      <div className="flex items-center gap-2">
        {isEditing ? (
          <Input
            ref={inputRef}
            value={editName}
            disabled={disabled}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleSave}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave()
              if (e.key === "Escape") {
                setIsEditing(false)
                setEditName(assignment.name)
              }
            }}
            className="h-7 text-base font-semibold px-1.5"
          />
        ) : (
          <button
            type="button"
            className="text-base font-semibold truncate hover:underline cursor-pointer text-left"
            onClick={() => {
              if (disabled) return
              setEditName(assignment.name)
              setIsEditing(true)
            }}
            disabled={disabled}
          >
            {assignment.name}
          </button>
        )}
      </div>

      {/* Parent group set link */}
      {groupSet && (
        <button
          type="button"
          className="text-xs text-primary hover:underline flex items-center gap-1"
          onClick={() =>
            setSidebarSelection({
              kind: "group-set",
              id: assignment.group_set_id,
            })
          }
        >
          <Users className="size-3" />
          {groupSet.name}
        </button>
      )}
      {!groupSet && (
        <p className="text-xs text-destructive">
          Referenced group set not found
        </p>
      )}

      {assignment.description && (
        <p className="text-xs text-muted-foreground">
          {assignment.description}
        </p>
      )}
    </div>
  )
}

// --- Toolbar ---

function AssignmentToolbar({
  disabled,
  onChangeGroupSet,
  onDelete,
}: {
  disabled: boolean
  onChangeGroupSet: () => void
  onDelete: () => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <div className="px-4 py-2 flex items-center gap-1.5">
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs"
        onClick={onChangeGroupSet}
        disabled={disabled}
      >
        <ArrowRightLeft className="size-3 mr-1.5" />
        Change group set
      </Button>

      {confirmDelete ? (
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="text-xs text-destructive">Delete assignment?</span>
          <Button
            variant="destructive"
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              onDelete()
              setConfirmDelete(false)
            }}
            disabled={disabled}
          >
            Confirm
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setConfirmDelete(false)}
            disabled={disabled}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs text-destructive hover:text-destructive ml-auto"
          onClick={() => setConfirmDelete(true)}
          disabled={disabled}
        >
          <Trash2 className="size-3 mr-1.5" />
          Delete
        </Button>
      )}
    </div>
  )
}

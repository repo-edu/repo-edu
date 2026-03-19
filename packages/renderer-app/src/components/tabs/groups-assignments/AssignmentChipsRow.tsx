import type { Assignment } from "@repo-edu/domain/types"
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
} from "@repo-edu/ui"
import {
  EllipsisVertical,
  FileText,
  Pencil,
  Plus,
  Trash2,
} from "@repo-edu/ui/components/icons"
import { useCallback, useEffect, useRef, useState } from "react"

type AssignmentChipsRowProps = {
  assignments: Assignment[]
  selectedId: string | null
  onSelect: (id: string) => void
  onAdd: () => void
  onEdit: (id: string, name: string) => void
  onDelete: (id: string) => void
  showSelection: boolean
  disabled: boolean
}

export function AssignmentChipsRow({
  assignments,
  selectedId,
  onSelect,
  onAdd,
  onEdit,
  onDelete,
  showSelection,
  disabled,
}: AssignmentChipsRowProps) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-xs text-muted-foreground shrink-0 w-20">
        Assignments:
      </span>
      {assignments.map((a) => (
        <AssignmentChip
          key={a.id}
          assignment={a}
          isSelected={showSelection && a.id === selectedId}
          selectable={showSelection}
          onSelect={() => onSelect(a.id)}
          onEdit={(name) => onEdit(a.id, name)}
          onDelete={() => onDelete(a.id)}
          disabled={disabled}
        />
      ))}
      <Button
        variant="ghost"
        size="sm"
        className="h-6 px-1.5 shrink-0 text-xs gap-1"
        onClick={onAdd}
        disabled={disabled}
      >
        <Plus className="size-3.5" />
        Add
      </Button>
    </div>
  )
}

function AssignmentChip({
  assignment,
  isSelected,
  selectable,
  onSelect,
  onEdit,
  onDelete,
  disabled,
}: {
  assignment: Assignment
  isSelected: boolean
  selectable: boolean
  onSelect: () => void
  onEdit: (name: string) => void
  onDelete: () => void
  disabled: boolean
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(assignment.name)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const handleSave = useCallback(() => {
    const trimmed = editName.trim()
    if (trimmed && trimmed !== assignment.name) {
      onEdit(trimmed)
    }
    setIsEditing(false)
    setEditName(assignment.name)
  }, [editName, assignment.name, onEdit])

  if (isEditing) {
    return (
      <Input
        ref={inputRef}
        value={editName}
        onChange={(e) => setEditName(e.target.value)}
        onBlur={handleSave}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSave()
          if (e.key === "Escape") {
            setIsEditing(false)
            setEditName(assignment.name)
          }
        }}
        className="h-6 w-32 text-xs px-2"
      />
    )
  }

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md pl-2 pr-1 py-0.5 text-xs transition-colors",
        isSelected
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground hover:bg-muted/80",
      )}
    >
      <button
        type="button"
        className="inline-flex items-center gap-1"
        onClick={() => {
          if (!disabled && selectable) onSelect()
        }}
        disabled={disabled}
      >
        <FileText className="size-3 shrink-0" />
        <span className="truncate max-w-40">{assignment.name}</span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="rounded-full p-0.5 hover:bg-foreground/10"
            onClick={(e) => e.stopPropagation()}
            aria-label={`Actions for ${assignment.name}`}
          >
            <EllipsisVertical className="size-2.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-0">
          <DropdownMenuItem
            className="text-xs"
            disabled={disabled}
            onSelect={() => {
              setEditName(assignment.name)
              setIsEditing(true)
            }}
          >
            <Pencil className="size-3 mr-1.5" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-xs text-destructive"
            disabled={disabled}
            onSelect={onDelete}
          >
            <Trash2 className="size-3 mr-1.5" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  )
}

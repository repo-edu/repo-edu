/**
 * EditableCell - An inline-editable table cell component.
 * Click to edit, blur/Enter to save, Escape to cancel.
 */

import { Input } from "@repo-edu/ui"
import { useState } from "react"

interface EditableCellProps {
  /** Current value */
  value: string
  /** Placeholder shown when value is empty */
  placeholder?: string
  /** Called when editing completes (blur or Enter) */
  onSave: (value: string) => void
  /** Optional suffix element (e.g., status icon) */
  suffix?: React.ReactNode
  /** Additional class names for the button */
  className?: string
}

/**
 * EditableCell renders a clickable text that becomes an input when clicked.
 *
 * @example
 * <EditableCell
 *   value={student.name}
 *   placeholder="—"
 *   onSave={(name) => updateStudent(student.id, { name })}
 * />
 */
export function EditableCell({
  value,
  placeholder = "—",
  onSave,
  suffix,
  className,
}: EditableCellProps) {
  const [isEditing, setIsEditing] = useState(false)

  if (isEditing) {
    return (
      <Input
        defaultValue={value}
        onBlur={(e) => {
          onSave(e.target.value)
          setIsEditing(false)
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            onSave(e.currentTarget.value)
            setIsEditing(false)
          }
          if (e.key === "Escape") {
            setIsEditing(false)
          }
        }}
        autoFocus
        className="h-7"
      />
    )
  }

  return (
    <button
      type="button"
      className={`bg-transparent border-none p-0 font-normal cursor-pointer hover:underline text-left ${suffix ? "flex items-center gap-1" : ""} ${className ?? ""}`}
      onClick={() => setIsEditing(true)}
    >
      {value || <span className="text-muted-foreground">{placeholder}</span>}
      {suffix}
    </button>
  )
}

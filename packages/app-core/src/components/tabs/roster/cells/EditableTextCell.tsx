import { Input } from "@repo-edu/ui"
import { Pencil } from "@repo-edu/ui/components/icons"
import type { ReactNode } from "react"
import { useEffect, useState } from "react"

interface EditableTextCellProps {
  value: string
  onSave: (value: string) => void
  placeholder?: string
  trailing?: ReactNode
  editable?: boolean
  truncate?: boolean
}

export function EditableTextCell({
  value,
  onSave,
  placeholder = "—",
  trailing,
  editable = true,
  truncate = false,
}: EditableTextCellProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  useEffect(() => {
    if (!isEditing) {
      setDraft(value)
    }
  }, [isEditing, value])

  const commit = () => {
    onSave(draft)
    setIsEditing(false)
  }

  if (!editable) {
    return (
      <span className="inline-flex max-w-full items-center gap-1">
        <span
          className={truncate ? "block max-w-full truncate" : undefined}
          title={truncate && value ? value : undefined}
        >
          {value || (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
        </span>
        {trailing}
      </span>
    )
  }

  if (isEditing) {
    return (
      <Input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            commit()
          } else if (event.key === "Escape") {
            setIsEditing(false)
            setDraft(value)
          }
        }}
        autoFocus
        className="h-7 max-w-full"
      />
    )
  }

  return (
    <button
      type="button"
      className="inline-flex max-w-full cursor-pointer items-center gap-1 border-none bg-transparent p-0 text-left font-normal hover:underline"
      onClick={() => setIsEditing(true)}
    >
      <span
        className={truncate ? "block max-w-full truncate" : undefined}
        title={truncate && value ? value : undefined}
      >
        {value || <span className="text-muted-foreground">{placeholder}</span>}
      </span>
      <Pencil className="size-3 text-muted-foreground" />
      {trailing}
    </button>
  )
}

import { Input } from "@repo-edu/ui"
import type { ReactNode } from "react"
import { useEffect, useState } from "react"

interface EditableTextCellProps {
  value: string
  onSave: (value: string) => void
  placeholder?: string
  trailing?: ReactNode
}

export function EditableTextCell({
  value,
  onSave,
  placeholder = "—",
  trailing,
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
        className="h-7"
      />
    )
  }

  return (
    <button
      type="button"
      className="bg-transparent border-none p-0 font-normal cursor-pointer hover:underline text-left inline-flex items-center gap-1"
      onClick={() => setIsEditing(true)}
    >
      <span>
        {value || <span className="text-muted-foreground">{placeholder}</span>}
      </span>
      {trailing}
    </button>
  )
}

import { Button, Input } from "@repo-edu/ui"
import { X } from "@repo-edu/ui/components/icons"
import { useState } from "react"

/** Inline form for adding a roster member manually. Owns its own draft state;
 *  the parent unmounts it to dismiss, which resets the fields. */
export function AddMemberForm({
  onAdd,
  onCancel,
}: {
  onAdd: (name: string, email: string) => void
  onCancel: () => void
}) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const canAdd = name.trim().length > 0 && email.trim().length > 0

  const submit = () => {
    if (!canAdd) return
    onAdd(name.trim(), email.trim())
  }

  return (
    <div className="flex gap-2 items-center px-3 py-2 bg-muted/50">
      <Input
        placeholder="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="flex-1"
        onKeyDown={(e) => {
          if (e.key === "Enter") submit()
        }}
      />
      <Input
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="flex-1"
        onKeyDown={(e) => {
          if (e.key === "Enter") submit()
        }}
      />
      <Button size="sm" onClick={submit} disabled={!canAdd}>
        Add
      </Button>
      <Button size="sm" variant="ghost" onClick={onCancel}>
        <X className="size-4" />
      </Button>
    </div>
  )
}

/**
 * Dialog for creating a new local group set.
 */

import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormField,
  Input,
} from "@repo-edu/ui"
import { useState } from "react"
import { useProfileStore } from "../../stores/profileStore"
import { useUiStore } from "../../stores/uiStore"

export function NewLocalGroupSetDialog() {
  const [name, setName] = useState("")

  const open = useUiStore((state) => state.newLocalGroupSetDialogOpen)
  const setOpen = useUiStore((state) => state.setNewLocalGroupSetDialogOpen)
  const setSidebarSelection = useUiStore((state) => state.setSidebarSelection)
  const createLocalGroupSet = useProfileStore(
    (state) => state.createLocalGroupSet,
  )

  const trimmedName = name.trim()
  const canCreate = trimmedName.length > 0

  const handleCreate = () => {
    if (!canCreate) return
    const id = createLocalGroupSet(trimmedName)
    if (id) {
      setSidebarSelection({ kind: "group-set", id })
    }
    handleClose()
  }

  const handleClose = () => {
    setOpen(false)
    setName("")
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Local Group Set</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <FormField label="Name" htmlFor="group-set-name">
            <Input
              id="group-set-name"
              placeholder="e.g., Project Teams"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canCreate) handleCreate()
              }}
              autoFocus
            />
          </FormField>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!canCreate}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Dialog for creating a new assignment.
 *
 * The group set is predetermined by preSelectedGroupSetId from the UI store.
 * Group selection mode is now on the group set, not the assignment.
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

export function NewAssignmentDialog() {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")

  const createAssignment = useProfileStore((state) => state.createAssignment)
  const open = useUiStore((state) => state.newAssignmentDialogOpen)
  const setOpen = useUiStore((state) => state.setNewAssignmentDialogOpen)
  const preSelectedGroupSetId = useUiStore(
    (state) => state.preSelectedGroupSetId,
  )
  const setPreSelectedGroupSetId = useUiStore(
    (state) => state.setPreSelectedGroupSetId,
  )
  const setSidebarSelection = useUiStore((state) => state.setSidebarSelection)

  const trimmedName = name.trim()
  const canCreate = trimmedName.length > 0 && preSelectedGroupSetId !== null

  const handleCreate = () => {
    if (!canCreate || !preSelectedGroupSetId) return

    const id = createAssignment(
      {
        name: trimmedName,
        description: description.trim() || null,
        group_set_id: preSelectedGroupSetId,
      },
      { select: true },
    )

    setSidebarSelection({ kind: "assignment", id })
    handleClose()
  }

  const handleClose = () => {
    setOpen(false)
    setName("")
    setDescription("")
    setPreSelectedGroupSetId(null)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Assignment</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <FormField
            label="Name"
            htmlFor="assignment-name"
            title="A short identifier used for repository naming (e.g., 'lab-1', 'project-2')"
          >
            <Input
              id="assignment-name"
              placeholder="e.g., lab-1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canCreate) handleCreate()
              }}
              autoFocus
            />
          </FormField>

          <FormField
            label="Description (optional)"
            htmlFor="assignment-description"
            title="Optional human-readable name shown in the UI"
          >
            <Input
              id="assignment-description"
              placeholder="e.g., Lab 1: Python Basics"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
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

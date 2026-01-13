/**
 * Dialog for editing an assignment.
 */

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "@repo-edu/ui"
import { useEffect, useState } from "react"
import { useRosterStore } from "../../stores/rosterStore"
import { useUiStore } from "../../stores/uiStore"

export function EditAssignmentDialog() {
  const roster = useRosterStore((state) => state.roster)
  const selectedAssignmentId = useRosterStore(
    (state) => state.selectedAssignmentId,
  )
  const updateAssignment = useRosterStore((state) => state.updateAssignment)
  const open = useUiStore((state) => state.editAssignmentDialogOpen)
  const setOpen = useUiStore((state) => state.setEditAssignmentDialogOpen)

  const assignment = roster?.assignments.find(
    (a) => a.id === selectedAssignmentId,
  )
  const [name, setName] = useState(assignment?.name ?? "")
  const [description, setDescription] = useState(assignment?.description ?? "")

  useEffect(() => {
    if (open && assignment) {
      setName(assignment.name)
      setDescription(assignment.description ?? "")
    }
  }, [open, assignment])

  const handleSave = () => {
    if (selectedAssignmentId) {
      updateAssignment(selectedAssignmentId, {
        name: name.trim(),
        description: description.trim() || null,
      })
    }
    setOpen(false)
  }

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Assignment</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label
              htmlFor="edit-assignment-name"
              title="A short identifier used for repository naming (e.g., 'lab-1', 'project-2'). This should match the name of the template repository in your template org."
            >
              Name
            </Label>
            <Input
              id="edit-assignment-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim()) {
                  handleSave()
                }
              }}
              title="A short identifier used for repository naming (e.g., 'lab-1', 'project-2'). This should match the name of the template repository in your template org."
            />
          </div>
          <div className="grid gap-2">
            <Label
              htmlFor="edit-assignment-description"
              title="Optional human-readable name shown in the UI (e.g., 'Lab 1: Python Basics'). If empty, the name is displayed."
            >
              Description (optional)
            </Label>
            <Input
              id="edit-assignment-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              title="Optional human-readable name shown in the UI (e.g., 'Lab 1: Python Basics'). If empty, the name is displayed."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name.trim()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

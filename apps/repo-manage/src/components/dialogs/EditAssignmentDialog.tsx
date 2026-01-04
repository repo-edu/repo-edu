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

  useEffect(() => {
    if (open && assignment) {
      setName(assignment.name)
    }
  }, [open, assignment])

  const handleSave = () => {
    if (selectedAssignmentId) {
      updateAssignment(selectedAssignmentId, { name: name.trim() })
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
            <Label htmlFor="edit-assignment-name">Assignment Name</Label>
            <Input
              id="edit-assignment-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim()) {
                  handleSave()
                }
              }}
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

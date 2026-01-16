/**
 * Dialog for editing an assignment.
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
import { useEffect, useState } from "react"
import {
  selectRoster,
  selectSelectedAssignmentId,
  useProfileStore,
} from "../../stores/profileStore"
import { useUiStore } from "../../stores/uiStore"
import { formatAssignmentType } from "../../utils/labels"

export function EditAssignmentDialog() {
  const roster = useProfileStore(selectRoster)
  const selectedAssignmentId = useProfileStore(selectSelectedAssignmentId)
  const updateAssignment = useProfileStore((state) => state.updateAssignment)
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
        <DialogBody>
          <FormField
            label="Name"
            htmlFor="edit-assignment-name"
            title="A short identifier used for repository naming (e.g., 'lab-1', 'project-2'). This should match the name of the template repository in your template org."
          >
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
          </FormField>
          <FormField
            label="Description (optional)"
            htmlFor="edit-assignment-description"
            title="Optional human-readable name shown in the UI (e.g., 'Lab 1: Python Basics'). If empty, the name is displayed."
          >
            <Input
              id="edit-assignment-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              title="Optional human-readable name shown in the UI (e.g., 'Lab 1: Python Basics'). If empty, the name is displayed."
            />
          </FormField>
          <FormField
            label="Type"
            htmlFor="edit-assignment-type"
            title="Assignment type cannot be changed after creation."
          >
            <Input
              id="edit-assignment-type"
              value={
                assignment
                  ? formatAssignmentType(assignment.assignment_type)
                  : ""
              }
              disabled
            />
          </FormField>
        </DialogBody>
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

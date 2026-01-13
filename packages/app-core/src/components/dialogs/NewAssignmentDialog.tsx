/**
 * Dialog for creating a new assignment.
 */

import type { Assignment } from "@repo-edu/backend-interface/types"
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
import { useRosterStore } from "../../stores/rosterStore"
import { useUiStore } from "../../stores/uiStore"
import { generateAssignmentId } from "../../utils/nanoid"

export function NewAssignmentDialog() {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const addAssignment = useRosterStore((state) => state.addAssignment)
  const selectAssignment = useRosterStore((state) => state.selectAssignment)
  const open = useUiStore((state) => state.newAssignmentDialogOpen)
  const setOpen = useUiStore((state) => state.setNewAssignmentDialogOpen)

  const handleCreate = () => {
    const assignment: Assignment = {
      id: generateAssignmentId(),
      name: name.trim(),
      description: description.trim() || null,
      groups: [],
      lms_group_set_id: null,
    }
    addAssignment(assignment)
    selectAssignment(assignment.id)
    setOpen(false)
    setName("")
    setDescription("")
  }

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen)
    if (!newOpen) {
      setName("")
      setDescription("")
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Assignment</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <FormField
            label="Name"
            htmlFor="assignment-name"
            title="A short identifier used for repository naming (e.g., 'lab-1', 'project-2'). This should match the name of the template repository in your template org."
          >
            <Input
              id="assignment-name"
              placeholder="e.g., lab-1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim()) {
                  handleCreate()
                }
              }}
              title="A short identifier used for repository naming (e.g., 'lab-1', 'project-2'). This should match the name of the template repository in your template org."
            />
          </FormField>
          <FormField
            label="Description (optional)"
            htmlFor="assignment-description"
            title="Optional human-readable name shown in the UI (e.g., 'Lab 1: Python Basics'). If empty, the name is displayed."
          >
            <Input
              id="assignment-description"
              placeholder="e.g., Lab 1: Python Basics"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              title="Optional human-readable name shown in the UI (e.g., 'Lab 1: Python Basics'). If empty, the name is displayed."
            />
          </FormField>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!name.trim()}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Dialog for creating a new assignment.
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
import { useState } from "react"
import type { Assignment } from "@repo-edu/backend-interface/types"
import { useRosterStore } from "../../stores/rosterStore"
import { useUiStore } from "../../stores/uiStore"
import { generateAssignmentId } from "../../utils/nanoid"

export function NewAssignmentDialog() {
  const [name, setName] = useState("")
  const addAssignment = useRosterStore((state) => state.addAssignment)
  const selectAssignment = useRosterStore((state) => state.selectAssignment)
  const open = useUiStore((state) => state.newAssignmentDialogOpen)
  const setOpen = useUiStore((state) => state.setNewAssignmentDialogOpen)

  const handleCreate = () => {
    const assignment: Assignment = {
      id: generateAssignmentId(),
      name: name.trim(),
      groups: [],
      lms_group_set_id: null,
    }
    addAssignment(assignment)
    selectAssignment(assignment.id)
    setOpen(false)
    setName("")
  }

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen)
    if (!newOpen) {
      setName("")
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Assignment</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="assignment-name">Assignment Name</Label>
            <Input
              id="assignment-name"
              placeholder="e.g., Assignment 1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim()) {
                  handleCreate()
                }
              }}
            />
          </div>
        </div>
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

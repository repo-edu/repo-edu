/**
 * Dialog for creating a new assignment.
 */

import type {
  Assignment,
  AssignmentType,
} from "@repo-edu/backend-interface/types"
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
  Label,
  RadioGroup,
  RadioGroupItem,
} from "@repo-edu/ui"
import { useState } from "react"
import { useProfileStore } from "../../stores/profileStore"
import { useUiStore } from "../../stores/uiStore"
import { formatAssignmentType } from "../../utils/labels"
import { generateAssignmentId } from "../../utils/nanoid"

export function NewAssignmentDialog() {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [assignmentType, setAssignmentType] =
    useState<AssignmentType>("class_wide")
  const addAssignment = useProfileStore((state) => state.addAssignment)
  const open = useUiStore((state) => state.newAssignmentDialogOpen)
  const setOpen = useUiStore((state) => state.setNewAssignmentDialogOpen)

  const handleCreate = () => {
    const assignment: Assignment = {
      id: generateAssignmentId(),
      name: name.trim(),
      description: description.trim() || null,
      assignment_type: assignmentType,
      groups: [],
      group_set_cache_id: null,
    }
    addAssignment(assignment, { select: true })
    setOpen(false)
    setName("")
    setDescription("")
    setAssignmentType("class_wide")
  }

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen)
    if (!newOpen) {
      setName("")
      setDescription("")
      setAssignmentType("class_wide")
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
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              Type (cannot be changed after creation)
            </Label>
            <RadioGroup
              value={assignmentType}
              onValueChange={(value) =>
                setAssignmentType(value as AssignmentType)
              }
              className="flex flex-col gap-2"
            >
              <div className="flex items-start gap-2 rounded-md border px-3 py-2">
                <RadioGroupItem value="class_wide" id="assignment-type-class" />
                <div className="space-y-0.5">
                  <Label
                    htmlFor="assignment-type-class"
                    className="font-medium"
                  >
                    {formatAssignmentType("class_wide")}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    All active students must be assigned to a group.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2 rounded-md border px-3 py-2">
                <RadioGroupItem value="selective" id="assignment-type-select" />
                <div className="space-y-0.5">
                  <Label
                    htmlFor="assignment-type-select"
                    className="font-medium"
                  >
                    {formatAssignmentType("selective")}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Any subset of active students can participate.
                  </p>
                </div>
              </div>
            </RadioGroup>
          </div>
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

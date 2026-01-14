/**
 * Dialog for adding a new group to an assignment.
 */

import type { Group, StudentId } from "@repo-edu/backend-interface/types"
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
import { generateGroupId } from "../../utils/nanoid"
import { StudentMultiSelect } from "./StudentMultiSelect"

export function AddGroupDialog() {
  const [name, setName] = useState("")
  const [selectedMembers, setSelectedMembers] = useState<StudentId[]>([])

  const roster = useProfileStore((state) => state.document?.roster ?? null)
  const selectedAssignmentId = useProfileStore(
    (state) => state.selectedAssignmentId,
  )
  const addGroup = useProfileStore((state) => state.addGroup)
  const open = useUiStore((state) => state.addGroupDialogOpen)
  const setOpen = useUiStore((state) => state.setAddGroupDialogOpen)

  const students = roster?.students ?? []

  const handleCreate = () => {
    if (selectedAssignmentId) {
      const group: Group = {
        id: generateGroupId(),
        name: name.trim(),
        member_ids: selectedMembers,
      }
      addGroup(selectedAssignmentId, group)
    }
    setOpen(false)
    setName("")
    setSelectedMembers([])
  }

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen)
    if (!newOpen) {
      setName("")
      setSelectedMembers([])
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Group</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <FormField label="Group Name" htmlFor="group-name">
            <Input
              id="group-name"
              placeholder="e.g., Team-01"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </FormField>
          <FormField label="Members">
            <StudentMultiSelect
              students={students}
              selected={selectedMembers}
              onChange={setSelectedMembers}
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

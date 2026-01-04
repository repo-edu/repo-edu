/**
 * Dialog for adding a new group to an assignment.
 */

import { useState } from "react"
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
import type { Group, StudentId } from "../../bindings/types"
import { useRosterStore } from "../../stores/rosterStore"
import { useUiStore } from "../../stores/uiStore"
import { generateGroupId } from "../../utils/nanoid"
import { StudentMultiSelect } from "./StudentMultiSelect"

export function AddGroupDialog() {
  const [name, setName] = useState("")
  const [selectedMembers, setSelectedMembers] = useState<StudentId[]>([])

  const roster = useRosterStore((state) => state.roster)
  const selectedAssignmentId = useRosterStore(
    (state) => state.selectedAssignmentId,
  )
  const addGroup = useRosterStore((state) => state.addGroup)
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
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="group-name">Group Name</Label>
            <Input
              id="group-name"
              placeholder="e.g., Team-01"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label>Members</Label>
            <StudentMultiSelect
              students={students}
              selected={selectedMembers}
              onChange={setSelectedMembers}
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

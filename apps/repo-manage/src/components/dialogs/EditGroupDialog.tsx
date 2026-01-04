/**
 * Dialog for editing a group (name and members).
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
import type { StudentId } from "../../bindings/types"
import { useRosterStore } from "../../stores/rosterStore"
import { useUiStore } from "../../stores/uiStore"
import { StudentMultiSelect } from "./StudentMultiSelect"

export function EditGroupDialog() {
  const [name, setName] = useState("")
  const [selectedMembers, setSelectedMembers] = useState<StudentId[]>([])

  const roster = useRosterStore((state) => state.roster)
  const selectedAssignmentId = useRosterStore(
    (state) => state.selectedAssignmentId,
  )
  const updateGroup = useRosterStore((state) => state.updateGroup)
  const open = useUiStore((state) => state.editGroupDialogOpen)
  const setOpen = useUiStore((state) => state.setEditGroupDialogOpen)
  const editingGroupId = useUiStore((state) => state.editingGroupId)
  const setEditingGroupId = useUiStore((state) => state.setEditingGroupId)

  const students = roster?.students ?? []
  const assignment = roster?.assignments.find(
    (a) => a.id === selectedAssignmentId,
  )
  const group = assignment?.groups.find((g) => g.id === editingGroupId)

  useEffect(() => {
    if (open && group) {
      setName(group.name)
      setSelectedMembers([...group.member_ids])
    }
  }, [open, group])

  const handleSave = () => {
    if (selectedAssignmentId && editingGroupId) {
      updateGroup(selectedAssignmentId, editingGroupId, {
        name: name.trim(),
        member_ids: selectedMembers,
      })
    }
    handleClose()
  }

  const handleClose = () => {
    setOpen(false)
    setEditingGroupId(null)
    setName("")
    setSelectedMembers([])
  }

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      handleClose()
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Group</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="edit-group-name">Group Name</Label>
            <Input
              id="edit-group-name"
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
          <Button variant="outline" onClick={handleClose}>
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

/**
 * Dialog for editing a group (name and members).
 */

import type { StudentId } from "@repo-edu/backend-interface/types"
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
import { useProfileStore } from "../../stores/profileStore"
import { useUiStore } from "../../stores/uiStore"
import { StudentMultiSelect } from "./StudentMultiSelect"

export function EditGroupDialog() {
  const [name, setName] = useState("")
  const [selectedMembers, setSelectedMembers] = useState<StudentId[]>([])

  const roster = useProfileStore((state) => state.document?.roster ?? null)
  const assignmentSelection = useProfileStore(
    (state) => state.assignmentSelection,
  )
  const selectedAssignmentId =
    assignmentSelection?.mode === "assignment" ? assignmentSelection.id : null
  const updateGroup = useProfileStore((state) => state.updateGroup)
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
        <DialogBody>
          <FormField label="Group Name" htmlFor="edit-group-name">
            <Input
              id="edit-group-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </FormField>
          <FormField label="Members">
            <StudentMultiSelect
              students={students}
              selected={selectedMembers}
              onChange={setSelectedMembers}
              groups={assignment?.groups ?? []}
              currentGroupId={editingGroupId}
            />
          </FormField>
        </DialogBody>
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

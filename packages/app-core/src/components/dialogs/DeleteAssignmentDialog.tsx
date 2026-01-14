/**
 * Dialog for confirming assignment deletion.
 */

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo-edu/ui"
import {
  selectRoster,
  selectSelectedAssignmentId,
  useProfileStore,
} from "../../stores/profileStore"
import { useUiStore } from "../../stores/uiStore"

export function DeleteAssignmentDialog() {
  const roster = useProfileStore(selectRoster)
  const selectedAssignmentId = useProfileStore(selectSelectedAssignmentId)
  const removeAssignment = useProfileStore((state) => state.removeAssignment)
  const selectAssignment = useProfileStore((state) => state.selectAssignment)
  const open = useUiStore((state) => state.deleteAssignmentDialogOpen)
  const setOpen = useUiStore((state) => state.setDeleteAssignmentDialogOpen)

  const assignment = roster?.assignments.find(
    (a) => a.id === selectedAssignmentId,
  )

  const handleDelete = () => {
    if (selectedAssignmentId) {
      removeAssignment(selectedAssignmentId)
      // Select another assignment or null
      const remaining =
        roster?.assignments.filter((a) => a.id !== selectedAssignmentId) ?? []
      selectAssignment(remaining[0]?.id ?? null)
    }
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Assignment</DialogTitle>
          <DialogDescription>This action cannot be undone.</DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <p>Delete "{assignment?.name}"?</p>
          {assignment && assignment.groups.length > 0 && (
            <p className="text-muted-foreground mt-2">
              This assignment has {assignment.groups.length} group
              {assignment.groups.length !== 1 ? "s" : ""} configured.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete}>
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

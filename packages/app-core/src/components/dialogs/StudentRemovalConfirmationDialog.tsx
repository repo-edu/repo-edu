/**
 * StudentRemovalConfirmationDialog - Confirm removal of a student who is in groups
 */

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo-edu/ui"
import { useOutputStore } from "../../stores/outputStore"
import { useProfileStore } from "../../stores/profileStore"
import { useUiStore } from "../../stores/uiStore"

export function StudentRemovalConfirmationDialog() {
  const studentRemovalConfirmation = useUiStore(
    (state) => state.studentRemovalConfirmation,
  )
  const setStudentRemovalConfirmation = useUiStore(
    (state) => state.setStudentRemovalConfirmation,
  )

  const removeStudent = useProfileStore((state) => state.removeStudent)
  const appendOutput = useOutputStore((state) => state.appendText)

  if (!studentRemovalConfirmation) return null

  const { student_id, student_name, affected_groups } =
    studentRemovalConfirmation

  const handleConfirm = () => {
    removeStudent(student_id)
    appendOutput(
      `Removed "${student_name}" from roster and ${affected_groups.length} group(s)`,
      "info",
    )
    setStudentRemovalConfirmation(null)
  }

  const handleCancel = () => {
    setStudentRemovalConfirmation(null)
  }

  return (
    <Dialog open={!!studentRemovalConfirmation} onOpenChange={handleCancel}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove Student</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-4">
          <p className="text-sm">
            Remove <strong>"{student_name}"</strong>?
          </p>

          <p className="text-sm">
            This student is in {affected_groups.length} group(s):
          </p>

          <ul className="text-sm list-disc list-inside space-y-1 max-h-48 overflow-auto">
            {affected_groups.map((group) => (
              <li key={group.group_id}>
                {group.assignment_name} → {group.group_name}
              </li>
            ))}
          </ul>

          <p className="text-sm text-muted-foreground">
            Removing will also remove them from these groups.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleConfirm}>
            Remove
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

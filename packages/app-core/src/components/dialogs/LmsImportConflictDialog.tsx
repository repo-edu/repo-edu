/**
 * LmsImportConflictDialog - Shows LMS identity conflicts when importing students
 */

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo-edu/ui"
import { useUiStore } from "../../stores/uiStore"

export function LmsImportConflictDialog() {
  const lmsImportConflicts = useUiStore((state) => state.lmsImportConflicts)
  const setLmsImportConflicts = useUiStore(
    (state) => state.setLmsImportConflicts,
  )

  if (!lmsImportConflicts || lmsImportConflicts.length === 0) return null

  const handleClose = () => {
    setLmsImportConflicts(null)
  }

  return (
    <Dialog open={!!lmsImportConflicts} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import Failed</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-4">
          <p className="text-sm text-destructive">
            LMS identity conflicts detected. The same email has different LMS
            user IDs between your roster and the LMS.
          </p>

          <div className="max-h-64 overflow-auto space-y-4">
            {lmsImportConflicts.map((conflict) => (
              <div
                key={conflict.email}
                className="border rounded p-3 text-sm space-y-2"
              >
                <p className="font-medium">{conflict.email}</p>
                <div className="space-y-1">
                  <p>
                    Roster: "{conflict.roster_student_name}" (LMS ID:{" "}
                    {conflict.roster_lms_user_id})
                  </p>
                  <p>
                    LMS: "{conflict.incoming_student_name}" (LMS ID:{" "}
                    {conflict.incoming_lms_user_id})
                  </p>
                </div>
              </div>
            ))}
          </div>

          <p className="text-sm text-muted-foreground">
            This usually indicates data inconsistency. Check your roster or LMS
            for duplicate accounts.
          </p>
        </div>

        <DialogFooter>
          <Button onClick={handleClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

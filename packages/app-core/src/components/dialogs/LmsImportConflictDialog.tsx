/**
 * LmsImportConflictDialog - Shows LMS identity conflicts during roster sync
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
          <DialogTitle>Roster Sync Conflicts</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-4">
          <p className="text-sm text-muted-foreground">
            Conflicts are warnings only. Non-conflicting matches are applied and
            conflicted entries are left untouched.
          </p>

          <div className="max-h-64 overflow-auto space-y-4">
            {lmsImportConflicts.map((conflict) => (
              <div
                key={`${conflict.match_key}:${conflict.value}`}
                className="border rounded p-3 text-sm space-y-2"
              >
                <p className="font-medium">
                  {conflict.match_key}: {conflict.value}
                </p>
                <div className="space-y-1">
                  <p>Matched roster IDs:</p>
                  <ul className="list-disc ml-5 space-y-0.5">
                    {conflict.matched_ids.map((id) => (
                      <li key={id}>
                        <code>{id}</code>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

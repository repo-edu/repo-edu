/**
 * ClearRosterDialog - Confirmation before clearing the roster
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
import { useRosterStore } from "../../stores/rosterStore"
import { useUiStore } from "../../stores/uiStore"

export function ClearRosterDialog() {
  const clearRosterDialogOpen = useUiStore(
    (state) => state.clearRosterDialogOpen,
  )
  const setClearRosterDialogOpen = useUiStore(
    (state) => state.setClearRosterDialogOpen,
  )

  const roster = useRosterStore((state) => state.roster)
  const setRoster = useRosterStore((state) => state.setRoster)

  const appendOutput = useOutputStore((state) => state.appendText)

  const studentCount = roster?.students.length ?? 0
  const assignmentCount = roster?.assignments.length ?? 0
  const groupCount =
    roster?.assignments.reduce((n, a) => n + a.groups.length, 0) ?? 0

  const handleClear = () => {
    // Clear students but preserve assignments structure
    setRoster({
      source: null,
      students: [],
      assignments: roster?.assignments ?? [],
    })
    appendOutput("Roster cleared", "info")
    setClearRosterDialogOpen(false)
  }

  return (
    <Dialog
      open={clearRosterDialogOpen}
      onOpenChange={setClearRosterDialogOpen}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Clear Roster</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-4">
          <p className="text-sm">This will permanently delete:</p>
          <ul className="text-sm list-disc list-inside space-y-1">
            <li>{studentCount} students</li>
            {assignmentCount > 0 && (
              <li>
                {assignmentCount} assignments with {groupCount} groups
              </li>
            )}
            <li>All git username mappings</li>
          </ul>
          <p className="text-sm text-muted-foreground">
            Profile settings and course binding will be preserved.
          </p>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setClearRosterDialogOpen(false)}
          >
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleClear}>
            Clear Roster
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

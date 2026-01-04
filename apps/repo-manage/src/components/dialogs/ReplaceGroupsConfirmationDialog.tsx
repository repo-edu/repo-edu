/**
 * Confirmation dialog shown when importing groups would replace existing ones.
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
import { useState } from "react"
import { commands } from "../../bindings/commands"
import { useRosterStore } from "../../stores/rosterStore"
import { useUiStore } from "../../stores/uiStore"

export function ReplaceGroupsConfirmationDialog() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const roster = useRosterStore((state) => state.roster)
  const selectedAssignmentId = useRosterStore(
    (state) => state.selectedAssignmentId,
  )
  const setRoster = useRosterStore((state) => state.setRoster)

  const open = useUiStore((state) => state.replaceGroupsConfirmationOpen)
  const setOpen = useUiStore((state) => state.setReplaceGroupsConfirmationOpen)
  const pendingGroupImport = useUiStore((state) => state.pendingGroupImport)
  const setPendingGroupImport = useUiStore(
    (state) => state.setPendingGroupImport,
  )
  const setImportGroupsDialogOpen = useUiStore(
    (state) => state.setImportGroupsDialogOpen,
  )
  const activeProfile = useUiStore((state) => state.activeProfile)

  const assignment = roster?.assignments.find(
    (a) => a.id === selectedAssignmentId,
  )

  const handleConfirm = async () => {
    if (
      !pendingGroupImport ||
      !roster ||
      !selectedAssignmentId ||
      !activeProfile
    ) {
      handleClose()
      return
    }

    setLoading(true)
    setError(null)
    try {
      const result = await commands.importGroupsFromLms(
        activeProfile,
        roster,
        selectedAssignmentId,
        pendingGroupImport,
      )
      if (result.status === "ok") {
        setRoster(result.data.roster)
        handleClose()
        setImportGroupsDialogOpen(false)
      } else {
        setError(result.error.message)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setOpen(false)
    setPendingGroupImport(null)
    setError(null)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Replace Existing Groups?</DialogTitle>
          <DialogDescription>This action cannot be undone.</DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {error && (
            <div className="text-sm text-red-600 bg-red-50 p-2 rounded mb-4">
              {error}
            </div>
          )}
          <p>
            This assignment already has {assignment?.groups.length ?? 0} groups.
          </p>
          <p className="text-muted-foreground mt-2">
            Importing will replace all existing groups with the selected groups
            from the LMS.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={loading}>
            {loading ? "Importing..." : "Replace & Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Confirmation dialog shown when importing groups would replace existing ones.
 */

import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Text,
} from "@repo-edu/ui"
import { useState } from "react"
import { commands } from "../../bindings/commands"
import { useAppSettingsStore } from "../../stores/appSettingsStore"
import { useProfileStore } from "../../stores/profileStore"
import { useUiStore } from "../../stores/uiStore"
import { buildLmsOperationContext } from "../../utils/operationContext"

export function ReplaceGroupsConfirmationDialog() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const roster = useProfileStore((state) => state.document?.roster ?? null)
  const selectedAssignmentId = useProfileStore(
    (state) => state.selectedAssignmentId,
  )
  const setRoster = useProfileStore((state) => state.setRoster)
  const courseId = useProfileStore(
    (state) => state.document?.settings.course.id ?? "",
  )

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
  const lmsConnection = useAppSettingsStore((state) => state.lmsConnection)
  const lmsContext = buildLmsOperationContext(lmsConnection, courseId)
  const lmsContextError = !lmsConnection
    ? "No LMS connection configured"
    : !courseId.trim()
      ? "Profile has no course configured"
      : null

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
    if (!lmsContext) {
      setError(lmsContextError)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const result = await commands.importGroupsFromLms(
        lmsContext,
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
            <Alert variant="destructive" className="mb-4">
              {error}
            </Alert>
          )}
          <p>
            This assignment already has {assignment?.groups.length ?? 0} groups.
          </p>
          <Text variant="muted" asChild>
            <p className="mt-2">
              Importing will replace all existing groups with the selected
              groups from the LMS.
            </p>
          </Text>
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

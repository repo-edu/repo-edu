import type { ImportRosterResult } from "@repo-edu/backend-interface/types"
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Text,
} from "@repo-edu/ui"
import { AlertTriangle, Loader2 } from "@repo-edu/ui/components/icons"
import { useState } from "react"
import { commands } from "../../bindings/commands"
import { useAppSettingsStore } from "../../stores/appSettingsStore"
import { useOutputStore } from "../../stores/outputStore"
import { selectCourse, useProfileStore } from "../../stores/profileStore"
import { useToastStore } from "../../stores/toastStore"
import { useUiStore } from "../../stores/uiStore"
import { buildLmsOperationContext } from "../../utils/operationContext"

export function RosterSyncDialog() {
  const open = useUiStore((state) => state.rosterSyncDialogOpen)
  const setOpen = useUiStore((state) => state.setRosterSyncDialogOpen)
  const setLmsImportConflicts = useUiStore(
    (state) => state.setLmsImportConflicts,
  )

  const roster = useProfileStore((state) => state.document?.roster ?? null)
  const setRoster = useProfileStore((state) => state.setRoster)
  const course = useProfileStore(selectCourse)
  const lmsConnection = useAppSettingsStore((state) => state.lmsConnection)

  const appendOutput = useOutputStore((state) => state.appendText)
  const addToast = useToastStore((state) => state.addToast)

  const [loadingPreview, setLoadingPreview] = useState(false)
  const [preview, setPreview] = useState<ImportRosterResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const context = buildLmsOperationContext(lmsConnection, course.id)

  const resetState = () => {
    setLoadingPreview(false)
    setPreview(null)
    setError(null)
  }

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (!nextOpen) {
      resetState()
    }
  }

  const handlePreview = async () => {
    if (!context) {
      const message =
        "Roster sync failed: LMS connection or course is not configured"
      setError(message)
      appendOutput(message, "error")
      return
    }

    setLoadingPreview(true)
    setError(null)
    setPreview(null)
    appendOutput("Previewing LMS roster sync...", "info")

    try {
      const result = await commands.importRosterFromLms(context, roster ?? null)
      if (result.status === "error") {
        setError(result.error.message)
        appendOutput(
          `Roster sync preview failed: ${result.error.message}`,
          "error",
        )
        return
      }

      setPreview(result.data)
      appendOutput(
        `Roster sync preview ready: ${result.data.roster.students.length} students, ${result.data.roster.staff.length} staff`,
        "info",
      )
    } catch (previewError) {
      const message =
        previewError instanceof Error
          ? previewError.message
          : String(previewError)
      setError(message)
      appendOutput(`Roster sync preview failed: ${message}`, "error")
    } finally {
      setLoadingPreview(false)
    }
  }

  const handleApply = () => {
    if (!preview) return

    setRoster(preview.roster, "Sync roster from LMS")

    let message = `Imported ${preview.roster.students.length} students, ${preview.roster.staff.length} staff`
    if (preview.total_conflicts > 0) {
      message += ` (${preview.total_conflicts} conflicts left untouched)`
    }
    addToast(message, {
      tone: preview.total_conflicts > 0 ? "warning" : "success",
    })
    appendOutput(message, preview.total_conflicts > 0 ? "warning" : "success")

    if (preview.summary.students_missing_email > 0) {
      appendOutput(
        `Warning: ${preview.summary.students_missing_email} roster entries are missing email`,
        "warning",
      )
    }

    setOpen(false)
    resetState()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Sync Roster from LMS</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-2">
          <Text className="text-sm text-muted-foreground">
            Sync imports all enrollment types from LMS and updates both students
            and staff.
          </Text>
          <Text className="text-xs text-muted-foreground">
            No include/exclude options are used in this flow.
          </Text>

          {!preview && !loadingPreview && (
            <Button onClick={handlePreview}>Preview Sync</Button>
          )}

          {loadingPreview && (
            <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Fetching roster preview...
            </div>
          )}

          {error && (
            <div className="inline-flex items-center gap-1.5 text-sm text-destructive">
              <AlertTriangle className="size-4" />
              <span>{error}</span>
            </div>
          )}

          {preview && (
            <div className="rounded-md border p-3 space-y-2">
              <p className="text-sm font-medium">
                Preview: {preview.roster.students.length} students,{" "}
                {preview.roster.staff.length} staff
              </p>
              <p className="text-xs text-muted-foreground">
                Changes from LMS: +{preview.summary.students_added} added,{" "}
                {preview.summary.students_updated} updated,{" "}
                {preview.summary.students_unchanged} unchanged
              </p>
              {preview.total_conflicts > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    {preview.total_conflicts} identity conflicts were detected.
                    Conflicts are warnings only and conflicted entries are left
                    untouched.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setLmsImportConflicts(preview.conflicts)}
                  >
                    View Conflict Details
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={!preview || loadingPreview}>
            Apply Sync
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

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
import { useEffect, useRef, useState } from "react"
import { commands } from "../../bindings/commands"
import { useAppSettingsStore } from "../../stores/appSettingsStore"
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

  const addToast = useToastStore((state) => state.addToast)

  const [loadingPreview, setLoadingPreview] = useState(false)
  const [preview, setPreview] = useState<ImportRosterResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [progressMessage, setProgressMessage] = useState<string | null>(null)
  const hasAutoPreviewedRef = useRef(false)
  const previewRequestIdRef = useRef(0)

  const context = buildLmsOperationContext(lmsConnection, course.id)

  const resetState = () => {
    previewRequestIdRef.current += 1
    setLoadingPreview(false)
    setPreview(null)
    setError(null)
    setProgressMessage(null)
  }

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (!nextOpen) {
      resetState()
    }
  }

  const handlePreview = async () => {
    const requestId = previewRequestIdRef.current + 1
    previewRequestIdRef.current = requestId

    if (!context) {
      const message =
        "Roster sync failed: LMS connection or course is not configured"
      setError(message)
      setProgressMessage(null)
      return
    }

    setLoadingPreview(true)
    setError(null)
    setPreview(null)
    setProgressMessage("Connecting to LMS...")

    try {
      const result = await commands.importRosterFromLms(
        context,
        roster ?? null,
        (message) => {
          if (previewRequestIdRef.current !== requestId) {
            return
          }
          setProgressMessage(message)
        },
      )
      if (previewRequestIdRef.current !== requestId) {
        return
      }

      if (result.status === "error") {
        setError(result.error.message)
        setProgressMessage(null)
        return
      }

      setPreview(result.data)
      setProgressMessage(null)
    } catch (previewError) {
      if (previewRequestIdRef.current !== requestId) {
        return
      }
      const message =
        previewError instanceof Error
          ? previewError.message
          : String(previewError)
      setError(message)
      setProgressMessage(null)
    } finally {
      if (previewRequestIdRef.current === requestId) {
        setLoadingPreview(false)
      }
    }
  }

  useEffect(() => {
    if (!open) {
      hasAutoPreviewedRef.current = false
      return
    }

    if (hasAutoPreviewedRef.current) {
      return
    }

    hasAutoPreviewedRef.current = true
    void handlePreview()
  }, [open, handlePreview])

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

          {loadingPreview && (
            <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {progressMessage ?? "Fetching roster preview..."}
            </div>
          )}

          {error && (
            <div className="space-y-2">
              <div className="inline-flex items-center gap-1.5 text-sm text-destructive">
                <AlertTriangle className="size-4" />
                <span>{error}</span>
              </div>
              {!loadingPreview && (
                <Button variant="outline" onClick={handlePreview}>
                  Retry Preview
                </Button>
              )}
            </div>
          )}

          {preview && (
            <div className="rounded-md border p-3 space-y-2">
              <p className="text-sm font-medium">
                Preview: {preview.roster.students.length} students,{" "}
                {preview.roster.staff.length} staff
              </p>
              <p className="text-xs text-muted-foreground">
                Pending sync from LMS: +{preview.summary.students_added} to add,{" "}
                {preview.summary.students_updated} to update,{" "}
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

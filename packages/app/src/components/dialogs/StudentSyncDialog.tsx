import type { RosterImportFromLmsResult } from "@repo-edu/domain/types"
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
import { useCallback, useEffect, useRef, useState } from "react"
import { getWorkflowClient } from "../../contexts/workflow-client.js"
import { useAppSettingsStore } from "../../stores/app-settings-store.js"
import {
  selectCourseStatus,
  useCourseStore,
} from "../../stores/course-store.js"
import { useUiStore } from "../../stores/ui-store.js"
import { getErrorMessage } from "../../utils/error-message.js"

export function StudentSyncDialog() {
  const open = useUiStore((state) => state.rosterSyncDialogOpen)
  const setOpen = useUiStore((state) => state.setRosterSyncDialogOpen)
  const activeCourseId = useUiStore((state) => state.activeCourseId)
  const course = useCourseStore((state) => state.course)
  const courseStatus = useCourseStore(selectCourseStatus)
  const appSettings = useAppSettingsStore((state) => state.settings)
  const loadedCourse = course && course.id === activeCourseId ? course : null
  const lmsCourseId = loadedCourse?.lmsCourseId ?? null
  const lmsConnectionName = loadedCourse?.lmsConnectionName ?? null

  const setRoster = useCourseStore((state) => state.setRoster)
  const setLmsImportConflicts = useUiStore(
    (state) => state.setLmsImportConflicts,
  )

  const [loadingPreview, setLoadingPreview] = useState(false)
  const [preview, setPreview] = useState<RosterImportFromLmsResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [progressMessage, setProgressMessage] = useState<string | null>(null)
  const hasAutoPreviewedRef = useRef(false)
  const previewRequestIdRef = useRef(0)

  const resetState = () => {
    previewRequestIdRef.current += 1
    setLoadingPreview(false)
    setPreview(null)
    setError(null)
    setProgressMessage(null)
    setLmsImportConflicts(null)
  }

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (!nextOpen) {
      resetState()
    }
  }

  const handlePreview = useCallback(async () => {
    const requestId = previewRequestIdRef.current + 1
    previewRequestIdRef.current = requestId

    if (!activeCourseId) {
      setError("No course is selected")
      setProgressMessage(null)
      return
    }

    if (!loadedCourse || courseStatus === "loading") {
      setError(null)
      setProgressMessage("Loading course configuration...")
      return
    }

    if (!lmsConnectionName || !lmsCourseId) {
      setError("LMS connection or course is not configured")
      setProgressMessage(null)
      return
    }

    setLoadingPreview(true)
    setError(null)
    setPreview(null)
    setProgressMessage("Connecting to LMS...")

    try {
      const client = getWorkflowClient()
      const result = await client.run(
        "roster.importFromLms",
        {
          course: loadedCourse,
          appSettings,
          lmsCourseId,
        },
        {
          onProgress: (p) => {
            if (previewRequestIdRef.current !== requestId) return
            setProgressMessage(p.label)
          },
        },
      )
      if (previewRequestIdRef.current !== requestId) return
      setPreview(result)
      setProgressMessage(null)
    } catch (previewError) {
      if (previewRequestIdRef.current !== requestId) return
      const message = getErrorMessage(previewError)
      setError(message)
      setProgressMessage(null)
    } finally {
      if (previewRequestIdRef.current === requestId) {
        setLoadingPreview(false)
      }
    }
  }, [
    activeCourseId,
    appSettings,
    loadedCourse,
    courseStatus,
    lmsConnectionName,
    lmsCourseId,
  ])

  useEffect(() => {
    if (!open) {
      hasAutoPreviewedRef.current = false
      return
    }
    if (hasAutoPreviewedRef.current) return
    if (!activeCourseId) return
    if (!loadedCourse || courseStatus === "loading") return

    hasAutoPreviewedRef.current = true
    void handlePreview()
  }, [open, activeCourseId, loadedCourse, courseStatus, handlePreview])

  const handleApply = () => {
    if (!preview) return
    setRoster(preview.roster, "Sync roster from LMS")
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
                Pending sync: +{preview.summary.membersAdded} to add,{" "}
                {preview.summary.membersUpdated} to update,{" "}
                {preview.summary.membersUnchanged} unchanged
              </p>
              {preview.totalConflicts > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    {preview.totalConflicts} identity conflicts were detected.
                    Conflicts are warnings only and conflicted entries are left
                    unchanged.
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

import {
  courseSupportsLms,
  type RosterImportFromLmsResult,
} from "@repo-edu/domain/types"
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Text,
} from "@repo-edu/ui"
import { AlertTriangle, Loader2 } from "@repo-edu/ui/components/icons"
import { useCallback, useEffect, useRef, useState } from "react"
import { getWorkflowClient } from "../../contexts/workflow-client.js"
import {
  selectActiveCourseId,
  selectCourseLoadStatus,
} from "../../session/selectors.js"
import {
  useSessionController,
  useSessionControllerSelector,
} from "../../session/session-controller-context.js"
import { useCourseStore } from "../../stores/course-store.js"
import { useCredentialsStore } from "../../stores/credentials-store.js"
import { useUiStore } from "../../stores/ui-store.js"
import { getErrorMessage } from "../../utils/error-message.js"
import { lmsConnectionDisplayName } from "../settings/ConnectionsPane.shared.js"

type RosterSyncPreview = {
  courseId: string
  result: RosterImportFromLmsResult
}

export function StudentSyncDialog() {
  const open = useUiStore((state) => state.rosterSyncDialogOpen)
  const setOpen = useUiStore((state) => state.setRosterSyncDialogOpen)
  const controller = useSessionController()
  const activeCourseId = useSessionControllerSelector(selectActiveCourseId)
  const course = useCourseStore((state) => state.course)
  const courseLoadStatus = useSessionControllerSelector(selectCourseLoadStatus)
  const credentials = useCredentialsStore((state) => state.credentials)
  const loadedCourse = course && course.id === activeCourseId ? course : null
  const supportsLms = loadedCourse !== null && courseSupportsLms(loadedCourse)
  const lmsCourseId = loadedCourse?.lmsCourseId ?? null
  const lmsConnectionId = loadedCourse?.lmsConnectionId ?? null

  const setLmsImportConflicts = useUiStore(
    (state) => state.setLmsImportConflicts,
  )

  const [loadingPreview, setLoadingPreview] = useState(false)
  const [preview, setPreview] = useState<RosterSyncPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [progressMessage, setProgressMessage] = useState<string | null>(null)
  const autoPreviewedCourseIdRef = useRef<string | null>(null)
  const previewRequestIdRef = useRef(0)
  const visiblePreview =
    preview !== null && preview.courseId === loadedCourse?.id
      ? preview.result
      : null

  const resetState = useCallback(() => {
    previewRequestIdRef.current += 1
    setLoadingPreview(false)
    setPreview(null)
    setError(null)
    setProgressMessage(null)
    setLmsImportConflicts(null)
  }, [setLmsImportConflicts])

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen)
      if (!nextOpen) {
        resetState()
      }
    },
    [setOpen, resetState],
  )

  const handlePreview = useCallback(async () => {
    const requestId = previewRequestIdRef.current + 1
    previewRequestIdRef.current = requestId

    if (!activeCourseId) {
      setError("No course is selected")
      setProgressMessage(null)
      return
    }

    if (!loadedCourse || courseLoadStatus.state === "loading") {
      setError(null)
      setProgressMessage("Loading course configuration...")
      return
    }

    if (!supportsLms) {
      setError("RepoBee courses do not support LMS roster sync")
      setProgressMessage(null)
      return
    }

    if (!lmsConnectionId || !lmsCourseId) {
      setError("LMS connection or course is not configured")
      setProgressMessage(null)
      return
    }

    const previewCourseId = loadedCourse.id
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
          credentials,
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
      setPreview({ courseId: previewCourseId, result })
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
    credentials,
    loadedCourse,
    supportsLms,
    courseLoadStatus.state,
    lmsConnectionId,
    lmsCourseId,
  ])

  useEffect(() => {
    if (!open) {
      autoPreviewedCourseIdRef.current = null
      return
    }
    if (!activeCourseId) return
    if (autoPreviewedCourseIdRef.current === activeCourseId) return
    if (!loadedCourse || courseLoadStatus.state === "loading") return
    if (!supportsLms) {
      handleOpenChange(false)
      return
    }

    autoPreviewedCourseIdRef.current = activeCourseId
    void handlePreview()
  }, [
    open,
    activeCourseId,
    loadedCourse,
    supportsLms,
    courseLoadStatus.state,
    handlePreview,
    handleOpenChange,
  ])

  const handleApply = () => {
    if (!preview || !visiblePreview) return
    controller.mutateCourse(preview.courseId, (actions) => {
      actions.setRoster(visiblePreview.roster, "Sync roster from LMS")
      actions.setIdSequences(visiblePreview.idSequences)
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

          {loadedCourse && credentials.lmsConnections.length > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <Label htmlFor="student-sync-lms-connection">
                LMS connection
              </Label>
              <Select
                value={lmsConnectionId ?? ""}
                onValueChange={(value) => {
                  if (loadedCourse !== null) {
                    controller.setLmsConnectionId(
                      loadedCourse.id,
                      value || null,
                    )
                  }
                  autoPreviewedCourseIdRef.current = null
                  resetState()
                }}
              >
                <SelectTrigger
                  id="student-sync-lms-connection"
                  className="w-auto"
                >
                  <SelectValue placeholder="Select a connection" />
                </SelectTrigger>
                <SelectContent>
                  {credentials.lmsConnections.map((connection) => (
                    <SelectItem key={connection.id} value={connection.id}>
                      {lmsConnectionDisplayName(connection)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

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

          {visiblePreview && (
            <div className="rounded-md border p-3 space-y-2">
              <p className="text-sm font-medium">
                Preview: {visiblePreview.roster.students.length} students,{" "}
                {visiblePreview.roster.staff.length} staff
              </p>
              <p className="text-xs text-muted-foreground">
                Pending sync: +{visiblePreview.summary.membersAdded} to add,{" "}
                {visiblePreview.summary.membersUpdated} to update,{" "}
                {visiblePreview.summary.membersUnchanged} unchanged
              </p>
              {visiblePreview.totalConflicts > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    {visiblePreview.totalConflicts} identity conflicts were
                    detected. Conflicts are warnings only and conflicted entries
                    are left unchanged.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setLmsImportConflicts(visiblePreview.conflicts)
                    }
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
          <Button
            onClick={handleApply}
            disabled={!visiblePreview || loadingPreview}
          >
            Apply Sync
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

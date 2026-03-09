import type { Roster } from "@repo-edu/domain"
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
import {
  selectProfileStatus,
  useProfileStore,
} from "../../stores/profile-store.js"
import { useUiStore } from "../../stores/ui-store.js"
import { getErrorMessage } from "../../utils/error-message.js"

export function RosterSyncDialog() {
  const open = useUiStore((state) => state.rosterSyncDialogOpen)
  const setOpen = useUiStore((state) => state.setRosterSyncDialogOpen)
  const activeProfileId = useUiStore((state) => state.activeProfileId)
  const profile = useProfileStore((state) => state.profile)
  const profileStatus = useProfileStore(selectProfileStatus)
  const loadedProfile =
    profile && profile.id === activeProfileId ? profile : null
  const courseId = loadedProfile?.courseId ?? null
  const lmsConnectionName = loadedProfile?.lmsConnectionName ?? null

  const setRoster = useProfileStore((state) => state.setRoster)

  const [loadingPreview, setLoadingPreview] = useState(false)
  const [preview, setPreview] = useState<Roster | null>(null)
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

    if (!activeProfileId) {
      setError("No profile is selected")
      setProgressMessage(null)
      return
    }

    if (!loadedProfile || profileStatus === "loading") {
      setError(null)
      setProgressMessage("Loading profile configuration...")
      return
    }

    if (!lmsConnectionName || !courseId) {
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
        { profileId: activeProfileId, courseId },
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
    activeProfileId,
    loadedProfile,
    profileStatus,
    lmsConnectionName,
    courseId,
  ])

  useEffect(() => {
    if (!open) {
      hasAutoPreviewedRef.current = false
      return
    }
    if (hasAutoPreviewedRef.current) return
    if (!activeProfileId) return
    if (!loadedProfile || profileStatus === "loading") return

    hasAutoPreviewedRef.current = true
    void handlePreview()
  }, [open, activeProfileId, loadedProfile, profileStatus, handlePreview])

  const handleApply = () => {
    if (!preview) return
    setRoster(preview, "Sync roster from LMS")
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
                Preview: {preview.students.length} students,{" "}
                {preview.staff.length} staff
              </p>
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

import { Button } from "@repo-edu/ui"
import { AlertCircle, X } from "@repo-edu/ui/components/icons"
import { useAppSettingsStore } from "../stores/app-settings-store.js"
import { useCourseStore } from "../stores/course-store.js"

export function SyncErrorBanner() {
  const settingsSyncStatus = useAppSettingsStore((s) => s.syncStatus)
  const courseSyncStatus = useCourseStore((s) => s.syncStatus)
  const message =
    settingsSyncStatus.state === "error"
      ? settingsSyncStatus.message
      : courseSyncStatus.state === "error"
        ? courseSyncStatus.message
        : null

  if (message === null) return null

  return (
    <div className="flex items-start gap-2 border-b border-destructive bg-destructive/10 px-4 py-2 text-sm text-destructive">
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      <span className="flex-1 break-words">{message}</span>
      <Button
        variant="ghost"
        size="sm"
        className="size-6 shrink-0 p-0 text-destructive hover:text-destructive"
        aria-label="Dismiss"
        onClick={() => {
          if (settingsSyncStatus.state === "error") {
            useAppSettingsStore.getState().dismissSyncError()
            return
          }
          useCourseStore.getState().dismissSyncError()
        }}
      >
        <X className="size-4" />
      </Button>
    </div>
  )
}

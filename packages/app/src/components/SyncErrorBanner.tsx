import { Button } from "@repo-edu/ui"
import { AlertCircle, X } from "@repo-edu/ui/components/icons"
import { useCourseStore } from "../stores/course-store.js"

export function SyncErrorBanner() {
  const syncError = useCourseStore((s) => s.syncError)

  if (!syncError) return null

  return (
    <div className="flex items-start gap-2 border-b border-destructive bg-destructive/10 px-4 py-2 text-sm text-destructive">
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      <span className="flex-1 break-words">{syncError}</span>
      <Button
        variant="ghost"
        size="sm"
        className="size-6 shrink-0 p-0 text-destructive hover:text-destructive"
        aria-label="Dismiss"
        onClick={() =>
          useCourseStore.setState({
            syncState: "idle",
            syncError: null,
          })
        }
      >
        <X className="size-4" />
      </Button>
    </div>
  )
}

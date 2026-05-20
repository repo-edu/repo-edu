import { Button } from "@repo-edu/ui"
import { useUiStore } from "../stores/ui-store.js"

export function NoCourseEmptyState() {
  const setNewCourseDialogOpen = useUiStore((s) => s.setNewCourseDialogOpen)

  return (
    <div className="flex h-full items-center justify-center p-8">
      <Button variant="outline" onClick={() => setNewCourseDialogOpen(true)}>
        New Course...
      </Button>
    </div>
  )
}

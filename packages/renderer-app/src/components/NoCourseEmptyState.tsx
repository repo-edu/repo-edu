/**
 * NoCourseEmptyState — First-run welcome screen shown in tab content when no
 * course exists. Presents two options (create a course manually or spin up an
 * empty course) each paired with an explanation. LMS setup lives in settings.
 */

import { Button } from "@repo-edu/ui"
import { useState } from "react"
import { useCourses } from "../hooks/use-courses.js"
import { useUiStore } from "../stores/ui-store.js"

export function NoCourseEmptyState() {
  const setNewCourseDialogOpen = useUiStore((s) => s.setNewCourseDialogOpen)
  const { createEmptyCourse } = useCourses()
  const [creatingEmpty, setCreatingEmpty] = useState(false)

  const handleCreateEmpty = async () => {
    setCreatingEmpty(true)
    try {
      await createEmptyCourse()
    } finally {
      setCreatingEmpty(false)
    }
  }

  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-2xl">
        <div className="grid grid-cols-[12rem_1fr] gap-x-5 gap-y-4 items-center">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setNewCourseDialogOpen(true)}
          >
            Create Course…
          </Button>
          <p className="text-sm text-muted-foreground">
            Add a course manually with the full setup, optionally linked to an
            LMS course.
          </p>

          <Button
            variant="outline"
            className="w-full"
            disabled={creatingEmpty}
            onClick={() => void handleCreateEmpty()}
          >
            {creatingEmpty ? "Creating…" : "Create Empty Course"}
          </Button>
          <p className="text-sm text-muted-foreground">
            Spin up an empty course with no roster — handy for trying out
            repository analysis.
          </p>
        </div>
      </div>
    </div>
  )
}

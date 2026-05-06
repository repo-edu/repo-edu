/**
 * Welcome pane shown when no document is open. Two ways in: a standalone
 * Analysis (just look at a repository, optionally with AI exam questions) or
 * a Course (an Analysis bound to a roster you're teaching).
 */

import { Button } from "@repo-edu/ui"
import { useUiStore } from "../stores/ui-store.js"

export function NoCourseEmptyState() {
  const setNewCourseDialogOpen = useUiStore((s) => s.setNewCourseDialogOpen)
  const setNewAnalysisDialogOpen = useUiStore((s) => s.setNewAnalysisDialogOpen)

  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-2xl">
        <div className="grid grid-cols-[12rem_1fr] gap-x-5 gap-y-4 items-center">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setNewAnalysisDialogOpen(true)}
          >
            New Analysis…
          </Button>
          <p className="text-sm text-muted-foreground">
            Analyze a repository — author/file stats and AI-generated exam
            questions. No roster needed.
          </p>

          <Button
            variant="outline"
            className="w-full"
            onClick={() => setNewCourseDialogOpen(true)}
          >
            New Course…
          </Button>
          <p className="text-sm text-muted-foreground">
            A class you're teaching: same analysis, attributed to a specific
            roster, optionally linked to a Learning Management System (Canvas or
            Moodle).
          </p>
        </div>
      </div>
    </div>
  )
}

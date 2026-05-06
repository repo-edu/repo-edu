import { Button } from "@repo-edu/ui"
import { useUiStore } from "../stores/ui-store.js"

export function NoCourseEmptyState() {
  const setNewCourseDialogMode = useUiStore((s) => s.setNewCourseDialogMode)
  const setNewAnalysisDialogOpen = useUiStore((s) => s.setNewAnalysisDialogOpen)

  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-2xl">
        <div className="grid grid-cols-[12rem_1fr] gap-x-5 gap-y-4 items-center">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setNewCourseDialogMode("lms")}
          >
            New LMS Course…
          </Button>
          <p className="text-sm text-muted-foreground">
            A class you're teaching, linked to a Learning Management System
            (Canvas or Moodle): roster, groups, and analysis attributed to your
            students.
          </p>

          <Button
            variant="outline"
            className="w-full"
            onClick={() => setNewCourseDialogMode("repobee")}
          >
            New RepoBee Course…
          </Button>
          <p className="text-sm text-muted-foreground">
            A class managed with RepoBee — no LMS link. Import unnamed teams
            from TXT and run analysis against the resulting repositories.
          </p>

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
        </div>
      </div>
    </div>
  )
}

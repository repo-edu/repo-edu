import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "@repo-edu/ui"
import { Loader2 } from "@repo-edu/ui/components/icons"
import { useState } from "react"
import { useCourses } from "../../hooks/use-courses.js"
import {
  bindSessionStart,
  type SessionStart,
} from "../../session/session-start.js"
import { useGroupsViewStore } from "../../stores/groups-view-store.js"

const IDLE_DRAFT = { name: null, processing: false }

export function DuplicateCourseDialog() {
  const target = useGroupsViewStore((state) =>
    state.courseDialog?.kind === "duplicate" ? state.courseDialog : null,
  )
  const setCourseDialog = useGroupsViewStore((state) => state.setCourseDialog)
  const { duplicateCourse } = useCourses()
  // A null name stands for the default, so every opening starts from it.
  const [draft, setDraft] = useState<{
    name: string | null
    processing: boolean
  }>(IDLE_DRAFT)
  const newCourseName =
    draft.name ?? (target === null ? "" : `${target.courseName} copy`)
  const canDuplicate = newCourseName.trim().length > 0

  const close = () => {
    setCourseDialog(null)
    setDraft(IDLE_DRAFT)
  }

  const handleConfirm = bindSessionStart(
    "courseDuplicate",
    async (start: SessionStart) => {
      if (target === null || !newCourseName.trim()) return

      setDraft((prev) => ({ ...prev, processing: true }))
      const success = await duplicateCourse(
        start,
        target.courseId,
        newCourseName.trim(),
      )

      if (success) {
        close()
      } else {
        setDraft((prev) => ({ ...prev, processing: false }))
      }
    },
  )

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !draft.processing) close()
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Duplicate Course</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="dup-course-name">Course Name</Label>
            <Input
              id="dup-course-name"
              placeholder="New course name"
              value={newCourseName}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, name: event.target.value }))
              }
              onKeyDown={(event) => {
                if (event.key === "Enter" && canDuplicate) {
                  void handleConfirm()
                }
              }}
              disabled={draft.processing}
              autoFocus
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={close}
            disabled={draft.processing}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!canDuplicate || draft.processing}
            onClick={() => void handleConfirm()}
          >
            {draft.processing ? (
              <>
                <Loader2 className="size-4 mr-1 animate-spin" />
                Creating...
              </>
            ) : (
              "Duplicate"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

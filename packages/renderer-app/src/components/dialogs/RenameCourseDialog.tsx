import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@repo-edu/ui"
import { useState } from "react"
import { useCourses } from "../../hooks/use-courses.js"
import {
  bindSessionStart,
  type SessionStart,
} from "../../session/session-start.js"
import { useGroupsViewStore } from "../../stores/groups-view-store.js"

export function RenameCourseDialog() {
  const target = useGroupsViewStore((state) =>
    state.courseDialog?.kind === "rename" ? state.courseDialog : null,
  )
  const setCourseDialog = useGroupsViewStore((state) => state.setCourseDialog)
  const { renameCourse } = useCourses()
  // Null until the teacher types, so every opening starts from the course name.
  const [draftName, setDraftName] = useState<string | null>(null)
  const newName = draftName ?? target?.courseName ?? ""

  const close = () => {
    setCourseDialog(null)
    setDraftName(null)
  }

  const handleConfirm = bindSessionStart(
    "courseRename",
    async (start: SessionStart) => {
      if (target === null) return
      const success = await renameCourse(start, target.courseId, newName)
      if (!success) return
      close()
    },
  )

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) close()
      }}
    >
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>Rename Course</DialogTitle>
        </DialogHeader>
        <Input
          placeholder="New name"
          value={newName}
          onChange={(event) => setDraftName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && newName.trim()) {
              void handleConfirm()
            }
          }}
          autoFocus
        />
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={close}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!newName.trim()}
            onClick={() => void handleConfirm()}
          >
            Rename
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

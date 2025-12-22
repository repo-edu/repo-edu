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
import { useState } from "react"
import { useLmsFormStore } from "../stores"

interface AddCourseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCourseAdded: (index: number) => void
}

export function AddCourseDialog({
  open,
  onOpenChange,
  onCourseAdded,
}: AddCourseDialogProps) {
  const [courseId, setCourseId] = useState("")
  const [error, setError] = useState<string | null>(null)
  const { addCourse, updateCourse, setActiveCourse, getActiveCourses } =
    useLmsFormStore()
  const courses = getActiveCourses()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    const trimmedId = courseId.trim()

    if (!trimmedId) {
      setError("Course ID is required")
      return
    }

    if (!/^\d+$/.test(trimmedId)) {
      setError("Course ID must be numeric")
      return
    }

    if (courses.some((c) => c.id === trimmedId)) {
      setError("This course ID already exists")
      return
    }

    const newIndex = courses.length
    addCourse()
    updateCourse(newIndex, { id: trimmedId })
    setActiveCourse(newIndex)

    setCourseId("")
    setError(null)
    onOpenChange(false)
    onCourseAdded(newIndex)
  }

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setCourseId("")
      setError(null)
    }
    onOpenChange(isOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent size="compact" className="max-w-xs">
        <DialogHeader size="compact">
          <DialogTitle size="compact">Add Course</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="flex flex-col gap-2">
            <Label size="xs" htmlFor="courseId">
              Course ID
            </Label>
            <Input
              id="courseId"
              size="xs"
              value={courseId}
              onChange={(e) => {
                setCourseId(e.target.value)
                setError(null)
              }}
              placeholder="12345"
              className="font-mono"
              autoFocus
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>

          <DialogFooter className="mt-4">
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="xs">
              Add
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

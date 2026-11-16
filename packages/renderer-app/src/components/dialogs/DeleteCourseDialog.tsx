import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo-edu/ui"
import { useCourses } from "../../hooks/use-courses.js"
import { courseOpenedAfterDelete } from "../../session/course-list.js"
import { selectActiveCourseId } from "../../session/selectors.js"
import { useSessionControllerSelector } from "../../session/session-controller-context.js"
import {
  bindSessionStart,
  type SessionStart,
} from "../../session/session-start.js"
import { useGroupsViewStore } from "../../stores/groups-view-store.js"

export function DeleteCourseDialog() {
  const target = useGroupsViewStore((state) =>
    state.courseDialog?.kind === "delete" ? state.courseDialog : null,
  )
  const setCourseDialog = useGroupsViewStore((state) => state.setCourseDialog)
  const activeCourseId = useSessionControllerSelector(selectActiveCourseId)
  const { courses, deleteCourse } = useCourses()
  const courseId = target?.courseId ?? ""
  const courseName = target?.courseName ?? ""
  const nextCourse = courseOpenedAfterDelete(courses, courseId)

  const handleConfirm = bindSessionStart(
    "courseDelete",
    async (start: SessionStart) => {
      if (target === null) return
      await deleteCourse(start, target.courseId)
      setCourseDialog(null)
    },
  )

  return (
    <AlertDialog
      open={target !== null}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) setCourseDialog(null)
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Course</AlertDialogTitle>
          <AlertDialogDescription>
            {nextCourse === null ? (
              <>Delete &quot;{courseName}&quot;? This is your last course.</>
            ) : courseId === activeCourseId ? (
              <>
                Delete &quot;{courseName}&quot;? You will be switched to &quot;
                {nextCourse.displayName}&quot;.
              </>
            ) : (
              <>Delete &quot;{courseName}&quot;?</>
            )}
            <br />
            <br />
            This will also delete the roster data associated with this course.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => void handleConfirm()}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

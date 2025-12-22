import { cn } from "@repo-edu/ui"
import { useLmsFormStore } from "../stores"
import type { CourseStatus } from "../stores/lmsFormStore"
import {
  ActionDropdown,
  type ActionDropdownItem,
  type ItemAction,
} from "./ActionDropdown"
import { MdiCheck } from "./icons/MdiCheck"
import { MdiClose } from "./icons/MdiClose"
import { MdiLoading } from "./icons/MdiLoading"
import { MdiRefresh } from "./icons/MdiRefresh"

interface CourseSelectorProps {
  onVerifyCourse: (index: number) => void
  onAddCourse: () => void
}

interface CourseDropdownItem extends ActionDropdownItem {
  courseId: string
  name: string | null
  status: CourseStatus
}

function getStatusIcon(status: CourseStatus) {
  if (status === "verifying") {
    return <MdiLoading className="w-3 h-3 text-muted-foreground" />
  }
  if (status === "verified") {
    return <MdiCheck className="w-3 h-3 text-green-600 dark:text-green-500" />
  }
  return null
}

function getStatusTitle(status: CourseStatus): string | undefined {
  if (status === "verified") return "Verified"
  if (status === "verifying") return "Verifying..."
  return undefined
}

function formatCourseName(
  id: string,
  name: string | null,
  status: CourseStatus,
): string {
  if (!id.trim()) {
    return "No ID"
  }
  if (status === "verifying") {
    return `${id} — Verifying...`
  }
  if (name) {
    return `${id} — ${name}`
  }
  return `${id} — Not verified`
}

export function CourseSelector({
  onVerifyCourse,
  onAddCourse,
}: CourseSelectorProps) {
  const { activeCourseIndex, setActiveCourse, removeCourse, getActiveCourses } =
    useLmsFormStore()
  const courses = getActiveCourses()

  // Transform courses to ActionDropdownItem format
  const items: CourseDropdownItem[] = courses.map((course, index) => ({
    id: `course-${index}`,
    label: formatCourseName(course.id, course.name, course.status),
    statusIcon: getStatusIcon(course.status),
    statusTitle: getStatusTitle(course.status),
    courseId: course.id,
    name: course.name,
    status: course.status,
  }))

  // Define actions for each item
  const itemActions: ItemAction<CourseDropdownItem>[] = [
    {
      icon: <MdiRefresh className={cn("w-3 h-3")} />,
      onClick: (_item, index) => onVerifyCourse(index),
      disabled: (item) => !item.courseId.trim() || item.status === "verifying",
      title: (item) =>
        item.status === "failed" ? "Retry verification" : "Verify course",
    },
    {
      icon: <MdiClose className="w-3 h-3" />,
      onClick: (_item, index) => {
        if (courses.length > 1) {
          removeCourse(index)
        }
      },
      disabled: () => courses.length === 1,
      title: () =>
        courses.length === 1 ? "Cannot delete last course" : "Remove course",
    },
  ]

  return (
    <ActionDropdown
      items={items}
      activeIndex={activeCourseIndex}
      onSelect={setActiveCourse}
      itemActions={itemActions}
      onAdd={onAddCourse}
      addLabel="Add course"
      placeholder="Select course"
      minWidth="200px"
      maxWidth="400px"
      contentMinWidth="300px"
    />
  )
}

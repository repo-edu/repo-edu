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
  originalIndex: number
}

function getStatusIcon(status: CourseStatus) {
  if (status === "verifying") {
    return <MdiLoading className="size-3 text-muted-foreground" />
  }
  if (status === "verified") {
    return <MdiCheck className="size-3 text-success" />
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

  // Transform courses to ActionDropdownItem format, sorted by course ID (high to low)
  const items: CourseDropdownItem[] = courses
    .map((course, index) => ({
      id: `course-${index}`,
      label: formatCourseName(course.id, course.name, course.status),
      statusIcon: getStatusIcon(course.status),
      statusTitle: getStatusTitle(course.status),
      courseId: course.id,
      name: course.name,
      status: course.status,
      originalIndex: index,
    }))
    .sort((a, b) =>
      b.courseId.localeCompare(a.courseId, undefined, { numeric: true }),
    )

  // Find sorted index of active course
  const activeSortedIndex = items.findIndex(
    (item) => item.originalIndex === activeCourseIndex,
  )

  // Define actions for each item
  const itemActions: ItemAction<CourseDropdownItem>[] = [
    {
      icon: <MdiRefresh className={cn("size-3")} />,
      onClick: (item) => onVerifyCourse(item.originalIndex),
      disabled: (item) => !item.courseId.trim() || item.status === "verifying",
      title: (item) =>
        item.status === "failed" ? "Retry verification" : "Verify course",
    },
    {
      icon: <MdiClose className="size-3" />,
      onClick: (item) => {
        if (courses.length > 1) {
          removeCourse(item.originalIndex)
        }
      },
      disabled: () => courses.length === 1,
      title: () =>
        courses.length === 1 ? "Cannot delete last course" : "Remove course",
    },
  ]

  // Handle selection by mapping sorted index back to original
  const handleSelect = (sortedIndex: number) => {
    const item = items[sortedIndex]
    if (item) {
      setActiveCourse(item.originalIndex)
    }
  }

  return (
    <ActionDropdown
      items={items}
      activeIndex={activeSortedIndex}
      onSelect={handleSelect}
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

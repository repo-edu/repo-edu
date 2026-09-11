import {
  activeCourseIdFromSurface,
  type PersistedActiveSurface,
} from "@repo-edu/domain/active-surface"
import type { CourseSummary } from "@repo-edu/domain/types"

export function resolveActiveSurfaceRedirectForCourses(
  activeSurface: PersistedActiveSurface,
  courses: readonly Pick<CourseSummary, "id" | "backing">[],
): { surface: PersistedActiveSurface } | null {
  const activeCourseId = activeCourseIdFromSurface(activeSurface)
  const activeCourseSummary =
    activeCourseId === null
      ? null
      : (courses.find((course) => course.id === activeCourseId) ?? null)
  if (
    activeSurface.kind === "submission" &&
    activeSurface.courseId !== undefined &&
    activeCourseSummary !== null &&
    activeCourseSummary.backing !== "lms"
  ) {
    return {
      surface: { kind: "course", courseId: activeSurface.courseId },
    }
  }
  if (activeCourseId !== null && activeCourseSummary === null) {
    const fallback = courses[0] ?? null
    if (fallback === null) return { surface: { kind: "home" } }
    return {
      surface: { kind: "course", courseId: fallback.id },
    }
  }
  return null
}

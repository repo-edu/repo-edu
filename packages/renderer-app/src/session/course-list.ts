import {
  activeCourseIdFromSurface,
  type PersistedActiveSurface,
} from "@repo-edu/domain/active-surface"
import type { CourseSummary, PersistedCourse } from "@repo-edu/domain/types"

export function courseSummary(course: PersistedCourse): CourseSummary {
  return {
    id: course.id,
    backing: course.backing,
    displayName: course.displayName,
    updatedAt: course.updatedAt,
  }
}

/** Replaces the course's summary in place, or appends it when the list does
 * not hold the course yet. */
export function patchCourseSummary(
  courses: readonly CourseSummary[],
  summary: CourseSummary,
): CourseSummary[] {
  const index = courses.findIndex((course) => course.id === summary.id)
  return index === -1
    ? [...courses, summary]
    : courses.map((course, position) => (position === index ? summary : course))
}

/** The course the session opens after deleting a course: the first other
 * course in list order. `course.list` returns the most recently updated
 * course first. */
export function courseOpenedAfterDelete<T extends Pick<CourseSummary, "id">>(
  courses: readonly T[],
  deletedCourseId: string,
): T | null {
  return courses.find((course) => course.id !== deletedCourseId) ?? null
}

export function surfaceAfterDelete(
  courses: readonly Pick<CourseSummary, "id">[],
  deletedCourseId: string,
): PersistedActiveSurface {
  const next = courseOpenedAfterDelete(courses, deletedCourseId)
  return next === null
    ? { kind: "home" }
    : { kind: "course", courseId: next.id }
}

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
  if (activeCourseId !== null && activeCourseSummary === null)
    return { surface: surfaceAfterDelete(courses, activeCourseId) }
  return null
}

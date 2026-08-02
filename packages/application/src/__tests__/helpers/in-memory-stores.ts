import type {
  PersistedAppCredentials,
  PersistedAppPreferences,
} from "@repo-edu/domain/settings"
import type { PersistedCourse } from "@repo-edu/domain/types"
import type { AppSettingsStore, CourseStore } from "../../core.js"
import { createCourseSaveConflictError } from "../../core.js"

export function createInMemoryCourseStore(
  courses: readonly PersistedCourse[],
): CourseStore {
  const coursesById = new Map(
    courses.map((course) => [course.id, course] as const),
  )

  return {
    listCourses() {
      return [...coursesById.values()]
    },
    loadCourse(courseId) {
      return coursesById.get(courseId) ?? null
    },
    saveCourse(course) {
      const current = coursesById.get(course.id) ?? null
      if (current !== null && current.revision !== course.revision) {
        throw createCourseSaveConflictError({
          reason: "revision-invariant",
          courseId: course.id,
          expectedRevision: course.revision,
          storedRevision: current.revision,
        })
      }
      if (current === null && course.revision !== 0) {
        throw createCourseSaveConflictError({
          reason: "course-missing",
          courseId: course.id,
          expectedRevision: course.revision,
          storedRevision: null,
        })
      }

      const savedCourse: PersistedCourse = {
        ...course,
        revision: course.revision + 1,
        updatedAt: new Date().toISOString(),
      }
      coursesById.set(course.id, savedCourse)
      return {
        revision: savedCourse.revision,
        updatedAt: savedCourse.updatedAt,
      }
    },
    deleteCourse(courseId) {
      coursesById.delete(courseId)
    },
  }
}

export function createInMemoryAppSettingsStore(
  sections: {
    credentials: PersistedAppCredentials
    preferences: PersistedAppPreferences
  } | null = null,
): AppSettingsStore {
  let credentials = sections?.credentials ?? null
  let preferences = sections?.preferences ?? null

  return {
    credentials: {
      load() {
        return { value: credentials, recovery: [] }
      },
      save(nextCredentials) {
        credentials = nextCredentials
      },
    },
    preferences: {
      load() {
        return { value: preferences, recovery: [] }
      },
      save(nextPreferences) {
        preferences = nextPreferences
      },
    },
    recoverUnsupportedComposite() {
      return []
    },
  }
}

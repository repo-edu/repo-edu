import { createCourseStorageFailure } from "@repo-edu/application-contract"
import type {
  PersistedAppCredentials,
  PersistedAppPreferences,
} from "@repo-edu/domain/settings"
import type { PersistedCourse } from "@repo-edu/domain/types"
import type { CourseStore } from "../../core.js"
import type { AppSettingsStore } from "../../settings-store.js"

export function createInMemoryCourseStore(
  courses: readonly PersistedCourse[],
): CourseStore {
  for (const course of courses) {
    if (!Number.isSafeInteger(course.revision) || course.revision < 1) {
      throw createCourseStorageFailure(
        "Seeded courses must have a saved revision.",
      )
    }
  }
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
      if (
        (course.revision === 0 && current !== null) ||
        (course.revision !== 0 && current?.revision !== course.revision)
      ) {
        throw createCourseStorageFailure(
          "The course row does not match the successor revision.",
        )
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
  }
}

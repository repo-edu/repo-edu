import type { CourseStore } from "@repo-edu/application/course-store"
import { createCourseStorageFailure } from "@repo-edu/application-contract"
import { validatePersistedCourse } from "@repo-edu/domain/schemas"
import type { PersistedCourse } from "@repo-edu/domain/types"

export type CourseRow = {
  id: string
  revision: number
  updated_at: string
  payload: string
}

export function encodeCoursePayload(
  course: Parameters<CourseStore["saveCourse"]>[0],
): string {
  const validation = validatePersistedCourse(course)
  if (!validation.ok) {
    throw createCourseStorageFailure("The course successor is invalid.")
  }
  const { id, revision, updatedAt, ...payload } = validation.value
  void id
  void revision
  void updatedAt
  return JSON.stringify(payload)
}

export function decodeCourseRow(row: CourseRow): PersistedCourse {
  let payload: unknown
  try {
    payload = JSON.parse(row.payload)
  } catch {
    throw createCourseStorageFailure(
      "The stored course payload is not valid JSON.",
    )
  }
  if (
    typeof payload !== "object" ||
    payload === null ||
    Array.isArray(payload) ||
    "id" in payload ||
    "revision" in payload ||
    "updatedAt" in payload
  ) {
    throw createCourseStorageFailure(
      "The stored course payload has an invalid shape.",
    )
  }
  if (!Number.isSafeInteger(row.revision) || row.revision < 1) {
    throw createCourseStorageFailure("The stored course revision is invalid.")
  }
  const validation = validatePersistedCourse({
    ...payload,
    id: row.id,
    revision: row.revision,
    updatedAt: row.updated_at,
  })
  if (!validation.ok) {
    throw createCourseStorageFailure("The stored course is invalid.")
  }
  return validation.value
}

import { mkdir } from "node:fs/promises"
import type { CourseStore } from "@repo-edu/application/course-store"
import {
  createCourseStorageFailure,
  isAppError,
} from "@repo-edu/application-contract"
import { admitCourseDatabase } from "./admission.js"
import {
  type CourseRow,
  decodeCourseRow,
  encodeCoursePayload,
} from "./codec.js"
import { type CourseConnection, openCourseConnection } from "./connection.js"
import { courseDatabasePath } from "./schema.js"

/** Internal factory keeps failure injection outside the public adapter API. */
export function createCourseStoreWithConnection(
  appDataRoot: string,
  open: (path: string) => Promise<CourseConnection>,
): CourseStore {
  async function action<T>(
    body: (connection: CourseConnection) => T,
    signal?: AbortSignal,
  ): Promise<T> {
    try {
      signal?.throwIfAborted()
      await mkdir(appDataRoot, { recursive: true })
      signal?.throwIfAborted()
      const connection = await open(courseDatabasePath(appDataRoot))
      try {
        signal?.throwIfAborted()
        connection.exec("PRAGMA synchronous = FULL")
        connection.exec("PRAGMA busy_timeout = 0")
        connection.exec("BEGIN EXCLUSIVE")
        try {
          admitCourseDatabase(connection)
          const result = body(connection)
          connection.exec("COMMIT")
          return result
        } catch (error) {
          connection.exec("ROLLBACK")
          throw error
        }
      } finally {
        connection.close()
      }
    } catch (error) {
      if (isAppError(error) && error.type === "course-storage") throw error
      throw createCourseStorageFailure(
        error instanceof Error
          ? error.message
          : "The course database action failed.",
      )
    }
  }

  return {
    listCourses: (signal) =>
      action(
        (connection) =>
          connection
            .all("SELECT * FROM courses ORDER BY id")
            .map((row) => decodeCourseRow(row as CourseRow)),
        signal,
      ),
    loadCourse: (id, signal) =>
      action((connection) => {
        const row = connection.get("SELECT * FROM courses WHERE id = ?", id)
        return row === undefined ? null : decodeCourseRow(row as CourseRow)
      }, signal),
    saveCourse: (course, signal) =>
      action((connection) => {
        const payload = encodeCoursePayload(course)
        const current = connection.get(
          "SELECT revision FROM courses WHERE id = ?",
          course.id,
        )
        if (
          (course.revision === 0 && current !== undefined) ||
          (course.revision > 0 && current?.revision !== course.revision)
        ) {
          throw createCourseStorageFailure(
            "The course row does not match the successor revision.",
          )
        }
        const revision = course.revision + 1
        if (!Number.isSafeInteger(revision)) {
          throw createCourseStorageFailure("The course revision is exhausted.")
        }
        const updatedAt = new Date().toISOString()
        if (course.revision === 0) {
          connection.run(
            "INSERT INTO courses (id, revision, updated_at, payload) VALUES (?, ?, ?, ?)",
            course.id,
            revision,
            updatedAt,
            payload,
          )
        } else {
          connection.run(
            "UPDATE courses SET revision = ?, updated_at = ?, payload = ? WHERE id = ?",
            revision,
            updatedAt,
            payload,
            course.id,
          )
        }
        return { revision, updatedAt }
      }, signal),
    deleteCourse: (id, signal) =>
      action((connection) => {
        connection.run("DELETE FROM courses WHERE id = ?", id)
      }, signal),
  }
}

export function createCourseStore(appDataRoot: string): CourseStore {
  return createCourseStoreWithConnection(appDataRoot, openCourseConnection)
}

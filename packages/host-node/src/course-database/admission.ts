import { createCourseStorageFailure } from "@repo-edu/application-contract"
import type { CourseConnection } from "./connection.js"
import {
  courseDatabaseApplicationId,
  courseDatabaseSchemaVersion,
  createCourseTableSql,
  virginCourseDatabase,
} from "./schema.js"

/** Called only inside the action's exclusive transaction. */
export function admitCourseDatabase(connection: CourseConnection): void {
  if (connection.get("PRAGMA journal_mode")?.journal_mode !== "delete") {
    throw createCourseStorageFailure(
      "The course database journal mode is invalid.",
    )
  }
  const applicationId = connection.get("PRAGMA application_id")?.application_id
  const schemaVersion = connection.get("PRAGMA user_version")?.user_version
  const objects = connection.all(
    "SELECT type, name, sql FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*' ORDER BY name",
  )
  if (
    applicationId === virginCourseDatabase.applicationId &&
    schemaVersion === virginCourseDatabase.schemaVersion &&
    objects.length === 0
  ) {
    connection.exec(createCourseTableSql)
    connection.exec(`PRAGMA application_id = ${courseDatabaseApplicationId}`)
    connection.exec(`PRAGMA user_version = ${courseDatabaseSchemaVersion}`)
    return
  }
  if (
    applicationId !== courseDatabaseApplicationId ||
    schemaVersion !== courseDatabaseSchemaVersion ||
    objects.length !== 1 ||
    objects[0]?.type !== "table" ||
    objects[0]?.name !== "courses" ||
    objects[0]?.sql !== createCourseTableSql
  ) {
    throw createCourseStorageFailure("The course database schema is invalid.")
  }
}

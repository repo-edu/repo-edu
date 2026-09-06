import { join } from "node:path"

export function courseDatabasePath(appDataRoot: string): string {
  return join(appDataRoot, "courses.sqlite")
}

// "RECU": Repo Edu courses, distinct from the gate and examination archive.
export const courseDatabaseApplicationId = 0x52454355
export const courseDatabaseSchemaVersion = 1

export const virginCourseDatabase = {
  applicationId: 0,
  schemaVersion: 0,
  applicationTables: [],
} as const

export const createCourseTableSql = `CREATE TABLE courses (
  id TEXT PRIMARY KEY NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1 AND revision <= 9007199254740991),
  updated_at TEXT NOT NULL,
  payload TEXT NOT NULL
) STRICT`

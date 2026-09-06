import assert from "node:assert/strict"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { describe, it } from "node:test"
import {
  courseDatabasePath,
  createCourseTableSql,
  virginCourseDatabase,
} from "../schema.js"

describe("course database definitions", () => {
  it("places the one course database directly in the resolved app-data root", () => {
    const root = join(tmpdir(), "repo-edu-storage")
    assert.equal(courseDatabasePath(root), join(root, "courses.sqlite"))
  })

  it("describes SQLite's unclaimed database and creates only the course table", () => {
    const database = new DatabaseSync(":memory:")
    try {
      const applicationId = database
        .prepare("PRAGMA application_id")
        .get()?.application_id
      const schemaVersion = database
        .prepare("PRAGMA user_version")
        .get()?.user_version
      const tables = () =>
        database
          .prepare("SELECT name FROM sqlite_schema WHERE type = 'table'")
          .all()
          .map((entry) => entry.name)
      assert.deepEqual(
        { applicationId, schemaVersion, applicationTables: tables() },
        virginCourseDatabase,
      )
      database.exec(createCourseTableSql)
      assert.deepEqual(tables(), ["courses"])
      const insert = database.prepare(
        "INSERT INTO courses (id, revision, updated_at, payload) VALUES (?, ?, ?, ?)",
      )
      insert.run("course", 1, "2026-09-06", "{}")
      assert.throws(() => insert.run("course", 1, "2026-09-06", "{}"))
      assert.throws(() => insert.run("other", 0, "2026-09-06", "{}"))
      assert.throws(() => insert.run("other", 1.5, "2026-09-06", "{}"))
    } finally {
      database.close()
    }
  })
})

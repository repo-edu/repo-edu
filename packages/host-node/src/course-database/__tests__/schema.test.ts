import assert from "node:assert/strict"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "node:test"
import { openCourseConnection } from "../connection.js"
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

  it("describes SQLite's unclaimed database and creates only the course table", async () => {
    const database = await openCourseConnection(":memory:")
    try {
      const applicationId = database.get(
        "PRAGMA application_id",
      )?.application_id
      const schemaVersion = database.get("PRAGMA user_version")?.user_version
      const tables = () =>
        database
          .all("SELECT name FROM sqlite_schema WHERE type = 'table'")
          .map((entry) => entry.name)
      assert.deepEqual(
        { applicationId, schemaVersion, applicationTables: tables() },
        virginCourseDatabase,
      )
      database.exec(createCourseTableSql)
      assert.deepEqual(tables(), ["courses"])
      const insert = (
        id: string,
        revision: number,
        date: string,
        payload: string,
      ) =>
        database.run(
          "INSERT INTO courses (id, revision, updated_at, payload) VALUES (?, ?, ?, ?)",
          id,
          revision,
          date,
          payload,
        )
      insert("course", 1, "2026-09-06", "{}")
      assert.throws(() => insert("course", 1, "2026-09-06", "{}"))
      assert.throws(() => insert("other", 0, "2026-09-06", "{}"))
      assert.throws(() => insert("other", 1.5, "2026-09-06", "{}"))
    } finally {
      database.close()
    }
  })
})

import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it, type TestContext } from "node:test"
import { isAppError } from "@repo-edu/application-contract"
import { createBlankCourse } from "@repo-edu/domain/types"
import { type CourseConnection, openCourseConnection } from "../connection.js"
import {
  courseDatabaseApplicationId,
  courseDatabasePath,
  createCourseTableSql,
} from "../schema.js"
import { createCourseStore, createCourseStoreWithConnection } from "../store.js"

const course = createBlankCourse("course-1", "2026-09-06T10:00:00Z", {
  backing: "lms",
  lmsConnectionId: "connection-1",
  lmsCourseId: "lms-1",
  displayName: "Course one",
})
const terminal = (error: unknown) =>
  isAppError(error) && error.type === "course-storage"

async function fixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), "course-store-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const path = courseDatabasePath(root)
  return { root, path, store: createCourseStore(root) }
}

async function inspect<T>(
  path: string,
  body: (database: CourseConnection) => T,
): Promise<T> {
  const database = await openCourseConnection(path)
  try {
    return body(database)
  } finally {
    database.close()
  }
}

describe("course database store", () => {
  it("claims a virgin database on load once and leaves reads unchanged", async (t) => {
    const { path, store } = await fixture(t)
    assert.equal(await store.loadCourse("missing"), null)
    await inspect(path, (db) => {
      assert.equal(
        db.get("PRAGMA application_id")?.application_id,
        courseDatabaseApplicationId,
      )
      assert.equal(db.get("PRAGMA user_version")?.user_version, 1)
    })
    const before = await readFile(path)
    assert.deepEqual(await store.listCourses(), [])
    assert.equal(await store.loadCourse("missing"), null)
    assert.deepEqual(await readFile(path), before)
  })

  it("inserts, replaces whole courses, deletes and starts a fresh row lifetime", async (t) => {
    const { path, store } = await fixture(t)
    const original = structuredClone(course)
    const stamp = await store.saveCourse(course)
    assert.equal(stamp.revision, 1)
    assert.ok(Number.isFinite(Date.parse(stamp.updatedAt)))
    assert.deepEqual(course, original)
    assert.deepEqual(await store.loadCourse(course.id), { ...course, ...stamp })
    const successor = {
      ...course,
      ...stamp,
      displayName: "Replaced",
      searchFolder: "new",
    }
    const next = await store.saveCourse(successor)
    assert.equal(next.revision, 2)
    assert.deepEqual(await store.listCourses(), [{ ...successor, ...next }])
    await inspect(path, (db) => {
      const payload = JSON.parse(
        db.get("SELECT payload FROM courses")?.payload as string,
      )
      for (const key of ["id", "revision", "updatedAt"])
        assert.equal(key in payload, false)
    })
    await store.deleteCourse(course.id)
    await store.deleteCourse(course.id)
    assert.equal(await store.loadCourse(course.id), null)
    assert.equal((await store.saveCourse(course)).revision, 1)
  })

  it("refuses every row-state mismatch without changing the saved course", async (t) => {
    const { path, store } = await fixture(t)
    await assert.rejects(
      async () => store.saveCourse({ ...course, revision: 1 }),
      terminal,
    )
    const stamp = await store.saveCourse(course)
    const before = await readFile(path)
    for (const revision of [0, 2]) {
      await assert.rejects(
        async () => store.saveCourse({ ...course, revision }),
        terminal,
      )
      assert.deepEqual(await readFile(path), before)
    }
    assert.deepEqual(await store.loadCourse(course.id), { ...course, ...stamp })
  })

  it("rejects invalid successors and exhausted revisions", async (t) => {
    const { path, store } = await fixture(t)
    await assert.rejects(
      async () => store.saveCourse({ ...course, revision: -1 }),
      terminal,
    )
    await store.saveCourse(course)
    await inspect(path, (db) =>
      db.exec(`UPDATE courses SET revision = ${Number.MAX_SAFE_INTEGER}`),
    )
    const before = await readFile(path)
    await assert.rejects(
      async () =>
        store.saveCourse({ ...course, revision: Number.MAX_SAFE_INTEGER }),
      terminal,
    )
    assert.deepEqual(await readFile(path), before)
  })

  it("fails load and list on invalid content but replaces without decoding the old payload", async (t) => {
    const { path, store } = await fixture(t)
    await store.saveCourse(course)
    for (const payload of ["{", "{}", "null"]) {
      await inspect(path, (db) =>
        db.run("UPDATE courses SET payload = ?", payload),
      )
      const before = await readFile(path)
      await assert.rejects(async () => store.loadCourse(course.id), terminal)
      await assert.rejects(async () => store.listCourses(), terminal)
      assert.deepEqual(await readFile(path), before)
    }
    const stamp = await store.saveCourse({ ...course, revision: 1 })
    assert.deepEqual(await store.loadCourse(course.id), { ...course, ...stamp })
    await inspect(path, (db) =>
      db.exec("UPDATE courses SET payload = '{}', updated_at = 'invalid'"),
    )
    await store.deleteCourse(course.id)
    assert.deepEqual(await store.listCourses(), [])
  })

  for (const sql of [
    "PRAGMA application_id = 1",
    "PRAGMA user_version = 1",
    "CREATE TABLE foreign_table (id TEXT)",
    `PRAGMA application_id = ${courseDatabaseApplicationId}; PRAGMA user_version = 1`,
    `${createCourseTableSql}; PRAGMA application_id = ${courseDatabaseApplicationId}; PRAGMA user_version = 2`,
    `CREATE TABLE courses (id TEXT); PRAGMA application_id = ${courseDatabaseApplicationId}; PRAGMA user_version = 1`,
    `${createCourseTableSql}; PRAGMA application_id = ${courseDatabaseApplicationId}; PRAGMA user_version = 1; CREATE VIEW extra AS SELECT * FROM courses`,
    `${createCourseTableSql}; PRAGMA application_id = ${courseDatabaseApplicationId}; PRAGMA user_version = 1; CREATE TRIGGER extra AFTER DELETE ON courses BEGIN DELETE FROM courses; END`,
    "PRAGMA journal_mode = WAL",
  ]) {
    it(`fails closed for schema state: ${sql}`, async (t) => {
      const { path, store } = await fixture(t)
      await inspect(path, (db) => db.exec(sql))
      const before = await readFile(path)
      for (const operation of [
        () => store.listCourses(),
        () => store.loadCourse(course.id),
        () => store.saveCourse(course),
        () => store.deleteCourse(course.id),
      ])
        await assert.rejects(async () => operation(), terminal)
      assert.deepEqual(await readFile(path), before)
    })
  }

  it("maps open and malformed-file failures to terminal storage failures", async (t) => {
    const { root, path, store } = await fixture(t)
    await writeFile(path, "not sqlite")
    await assert.rejects(async () => store.listCourses(), terminal)
    await assert.rejects(
      async () => createCourseStore(join(path, "child")).listCourses(),
      terminal,
    )
    const failing = createCourseStoreWithConnection(root, async () => {
      throw new Error("open failed")
    })
    await assert.rejects(async () => failing.listCourses(), terminal)
  })

  it("refuses a busy database once with no waiting or journal-mode change", async (t) => {
    const { root, path, store } = await fixture(t)
    await store.listCourses()
    const held = await openCourseConnection(path)
    held.exec("BEGIN EXCLUSIVE")
    const events: string[] = []
    const competing = createCourseStoreWithConnection(root, async (file) => {
      const connection = await openCourseConnection(file)
      return {
        ...connection,
        exec(sql) {
          events.push(sql)
          connection.exec(sql)
        },
      }
    })
    try {
      await assert.rejects(async () => competing.listCourses(), terminal)
      const admission = [
        "PRAGMA synchronous = FULL",
        "PRAGMA busy_timeout = 0",
        "BEGIN EXCLUSIVE",
      ]
      // SQLite can encounter the held lock while configuring synchronous mode.
      assert.ok(events.length > 0)
      assert.deepEqual(events, admission.slice(0, events.length))
    } finally {
      held.close()
    }
    assert.deepEqual(await store.listCourses(), [])
  })

  it("recovers an interrupted virgin claim and an interrupted replacement after process exit", async (t) => {
    const { path, store } = await fixture(t)
    function interrupt(sql: string) {
      const child = spawnSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          `
        const { ${process.versions.bun ? "Database" : "DatabaseSync"}: Database } = await import(${JSON.stringify(process.versions.bun ? "bun:sqlite" : "node:sqlite")});
        const db = new Database(${JSON.stringify(path)});
        db.exec('PRAGMA synchronous = FULL; BEGIN EXCLUSIVE');
        db.exec(${JSON.stringify(sql)});
        process.exit(0);
      `,
        ],
        { encoding: "utf8" },
      )
      assert.equal(child.status, 0, child.stderr)
    }
    interrupt(
      `${createCourseTableSql}; PRAGMA application_id = ${courseDatabaseApplicationId}; PRAGMA user_version = 1`,
    )
    await inspect(path, (db) => {
      assert.equal(db.get("PRAGMA application_id")?.application_id, 0)
      assert.equal(db.get("PRAGMA user_version")?.user_version, 0)
      assert.deepEqual(db.all("SELECT name FROM sqlite_schema"), [])
    })
    const stamp = await store.saveCourse(course)
    interrupt("UPDATE courses SET payload = '{}', revision = 2")
    assert.deepEqual(await store.loadCourse(course.id), { ...course, ...stamp })
  })

  for (const failure of [
    "begin",
    "admission",
    "statement",
    "commit",
    "rollback",
    "close",
  ] as const) {
    it(`reports terminal ${failure} failure and releases its connection`, async (t) => {
      const { root, store } = await fixture(t)
      const events: string[] = []
      const failing = createCourseStoreWithConnection(root, async (path) => {
        const connection = await openCourseConnection(path)
        return {
          ...connection,
          get(sql, ...values) {
            if (failure === "admission") throw new Error("admission failed")
            return connection.get(sql, ...values)
          },
          run(sql, ...values) {
            connection.run(sql, ...values)
            if (failure === "statement" || failure === "rollback")
              throw new Error("statement failed")
          },
          exec(sql) {
            events.push(sql)
            if (
              (failure === "begin" && sql === "BEGIN EXCLUSIVE") ||
              (failure === "commit" && sql === "COMMIT") ||
              (failure === "rollback" && sql === "ROLLBACK")
            )
              throw new Error(`${sql} failed`)
            connection.exec(sql)
          },
          close() {
            connection.close()
            events.push("close")
            if (failure === "close") throw new Error("release failed")
          },
        } satisfies CourseConnection
      })
      await assert.rejects(
        async () => failing.saveCourse(course),
        (error: unknown) =>
          terminal(error) &&
          (failure !== "rollback" ||
            (error as { message: string }).message === "statement failed"),
      )
      assert.equal(events.at(-1), "close")
      const saved = await store.loadCourse(course.id)
      assert.equal(saved?.revision ?? null, failure === "close" ? 1 : null)
      assert.equal(
        events.includes("ROLLBACK"),
        failure !== "close" && failure !== "begin",
      )
      if (failure !== "close")
        assert.equal((await store.saveCourse(course)).revision, 1)
    })
  }

  it("acknowledges only after durable commit and connection release", async (t) => {
    const { root, store } = await fixture(t)
    let closed = false
    const writer = createCourseStoreWithConnection(root, async (path) => {
      const connection = await openCourseConnection(path)
      return {
        ...connection,
        run(sql, ...values) {
          assert.equal(connection.get("PRAGMA synchronous")?.synchronous, 2)
          assert.equal(connection.get("PRAGMA busy_timeout")?.timeout, 0)
          connection.run(sql, ...values)
        },
        close() {
          connection.close()
          closed = true
        },
      }
    })
    const stamp = await writer.saveCourse(course)
    assert.equal(closed, true)
    assert.deepEqual(await store.loadCourse(course.id), { ...course, ...stamp })
  })
})

import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { it } from "node:test"
import { createCourseStore } from "../course-database/store.js"
import { runStorageArtifactProbe } from "../storage-artifact-probe.js"

it("publishes settings only after the course transaction has committed and released", async () => {
  const root = await mkdtemp(join(tmpdir(), "storage-probe-"))
  try {
    await runStorageArtifactProbe(createCourseStore(root), async () => {
      const database = new DatabaseSync(join(root, "courses.sqlite"), {
        timeout: 0,
      })
      try {
        database.exec("BEGIN EXCLUSIVE")
        assert.equal(
          database.prepare("SELECT count(*) AS count FROM courses").get()
            ?.count,
          0,
        )
        database.exec("COMMIT")
      } finally {
        database.close()
      }
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

it("fails the smoke run before settings publication when course admission fails", async () => {
  const root = await mkdtemp(join(tmpdir(), "storage-probe-"))
  let settingsCalled = false
  try {
    const database = new DatabaseSync(join(root, "courses.sqlite"))
    database.exec("CREATE TABLE foreign_data (id TEXT)")
    database.close()
    await assert.rejects(
      runStorageArtifactProbe(createCourseStore(root), async () => {
        settingsCalled = true
      }),
    )
    assert.equal(settingsCalled, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

it("fails the smoke run when the desktop settings publisher rejects", async () => {
  const root = await mkdtemp(join(tmpdir(), "storage-probe-"))
  try {
    await assert.rejects(
      runStorageArtifactProbe(createCourseStore(root), async () => {
        throw new Error("settings publication failed")
      }),
      /settings publication failed/,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

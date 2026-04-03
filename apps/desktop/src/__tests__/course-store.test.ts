import assert from "node:assert/strict"
import { mkdtemp, readdir, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "node:test"
import { getFixture } from "@repo-edu/test-fixtures"
import { createDesktopCourseStore } from "../course-store"

async function pathExists(path: string): Promise<boolean> {
  return await stat(path)
    .then(() => true)
    .catch(() => false)
}

describe("createDesktopCourseStore", () => {
  it("saveCourse creates courses directory when it does not exist", async () => {
    const storageRoot = await mkdtemp(join(tmpdir(), "repo-edu-desktop-"))
    const coursesDirectory = join(storageRoot, "courses")
    const fixture = getFixture({ tier: "small", preset: "shared-teams" })
    const course = structuredClone(fixture.course)
    const courseStore = createDesktopCourseStore(storageRoot)
    try {
      assert.equal(await pathExists(coursesDirectory), false)

      const saved = await courseStore.saveCourse(course)
      const entries = await readdir(coursesDirectory)
      const listed = await courseStore.listCourses()

      assert.equal(saved.id, course.id)
      assert.equal(saved.revision, course.revision + 1)
      assert.equal(await pathExists(coursesDirectory), true)
      assert.equal(entries.filter((name) => name.endsWith(".json")).length, 1)
      assert.equal(listed.length, 1)
      assert.equal(listed[0]?.id, course.id)
    } finally {
      await rm(storageRoot, { recursive: true, force: true })
    }
  })
})

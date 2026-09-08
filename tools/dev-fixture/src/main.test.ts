import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { it } from "node:test"
import { promisify } from "node:util"
import { claimProgramGate, createCourseStore } from "@repo-edu/host-node"
import { getFixture } from "@repo-edu/test-fixtures"

const execute = promisify(execFile)

it("cleans fixture rows only when the program gate is available", async () => {
  const root = await mkdtemp(join(tmpdir(), "dev-fixture-clean-"))
  try {
    const store = createCourseStore(root)
    const fixture = getFixture({
      tier: "small",
      preset: "repobee-teams",
    }).course
    await store.saveCourse(fixture)
    await store.saveCourse({ ...fixture, id: "teacher-course" })
    const clean = () =>
      execute(
        process.execPath,
        ["--import", "tsx", join(import.meta.dirname, "main.ts"), "--clean"],
        {
          env: { ...process.env, REPO_EDU_STORAGE_ROOT: root },
          timeout: 10_000,
        },
      )
    const claim = await claimProgramGate(root)
    assert.equal(claim.status, "held")
    if (claim.status !== "held") throw new Error("Could not hold test gate")
    try {
      await assert.rejects(clean(), /Another Repo Edu program is running/)
      assert.equal((await store.listCourses()).length, 2)
    } finally {
      claim.release()
    }
    await clean()
    assert.deepEqual(
      (await store.listCourses()).map((course) => course.id),
      ["teacher-course"],
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

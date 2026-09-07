import assert from "node:assert/strict"
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "node:test"
import { createCourseWorkflowHandlers } from "@repo-edu/application"
import { createCourseStore } from "@repo-edu/host-node"
import { getFixture } from "@repo-edu/test-fixtures"
import { seedDesktopFixtureFromEnvironment } from "../fixture-seed"
import {
  flushTransport,
  startMessage,
  transportHarness,
} from "./desktop-transport-harness"

describe("desktop shared course database", () => {
  it("shares seeded courses and committed stamps across store instances without course files", async () => {
    const root = await mkdtemp(join(tmpdir(), "repo-edu-desktop-"))
    try {
      const seeded = await seedDesktopFixtureFromEnvironment(root, {
        REPO_EDU_FIXTURE: "small/shared-teams/file",
      })
      assert.ok(seeded)
      const store = createCourseStore(root)
      const handlers = createCourseWorkflowHandlers(store)
      const loaded = await handlers["course.load"]({
        courseId: seeded.courseEntityId,
      })
      const next = { ...loaded, displayName: "Renamed / course" }
      const stamp = await handlers["course.save"](next)
      assert.deepEqual(Object.keys(stamp).sort(), ["revision", "updatedAt"])
      assert.equal(stamp.revision, loaded.revision + 1)
      assert.deepEqual(await createCourseStore(root).loadCourse(loaded.id), {
        ...next,
        ...stamp,
      })
      assert.equal(
        (await handlers["course.list"](undefined))[0]?.displayName,
        next.displayName,
      )
      const entries = await readdir(root)
      assert.ok(entries.includes("courses.sqlite"))
      assert.equal(entries.includes("courses"), false)
      await handlers["course.delete"]({ courseId: loaded.id })
      assert.equal(await createCourseStore(root).loadCourse(loaded.id), null)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  for (const action of [
    "course.list",
    "course.load",
    "course.save",
    "course.delete",
  ] as const) {
    it(`makes ${action} database failure terminal before close preparation`, async () => {
      const root = await mkdtemp(join(tmpdir(), "repo-edu-desktop-"))
      try {
        await writeFile(join(root, "courses.sqlite"), "invalid database")
        const course = getFixture({
          tier: "small",
          preset: "shared-teams",
        }).course
        const handlers = createCourseWorkflowHandlers(createCourseStore(root))
        const run = () => {
          switch (action) {
            case "course.list":
              return handlers[action](undefined)
            case "course.load":
              return handlers[action]({ courseId: course.id })
            case "course.save":
              return handlers[action](course)
            case "course.delete":
              return handlers[action]({ courseId: course.id })
          }
        }
        const entered = Promise.withResolvers<void>()
        const release = Promise.withResolvers<void>()
        const failed = Promise.withResolvers<void>()
        const h = transportHarness(async () => {
          entered.resolve()
          await release.promise
          try {
            return await run()
          } finally {
            failed.resolve()
          }
        })
        h.admission.dispatch({ type: "bootstrap-acknowledged" })
        const input =
          action === "course.list"
            ? undefined
            : action === "course.save"
              ? course
              : { courseId: course.id }
        h.receive(startMessage(action, input))
        await entered.promise
        h.admission.dispatch({
          type: "host-start",
          source: "window-close",
          request: { cancel() {} },
        })
        release.resolve()
        await failed.promise
        await flushTransport()
        assert.equal(h.admission.getSnapshot().phase, "terminal")
        assert.equal(
          h.effects.filter((effect) => effect.type === "end-host").length,
          1,
        )
        assert.equal(
          h.effects.some((effect) => effect.type === "prepare-close"),
          false,
        )
        assert.equal(
          h.responses.some(
            (response) =>
              "result" in response &&
              response.result.type === "data" &&
              response.result.data.type === "failed",
          ),
          false,
        )
        h.gateway.dispose()
      } finally {
        await rm(root, { recursive: true, force: true })
      }
    })
  }

  it("makes a stale successor terminal without replacing the saved course", async () => {
    const root = await mkdtemp(join(tmpdir(), "repo-edu-desktop-"))
    try {
      const store = createCourseStore(root)
      const course = getFixture({
        tier: "small",
        preset: "shared-teams",
      }).course
      const stamp = await store.saveCourse(course)
      const handlers = createCourseWorkflowHandlers(store)
      const finished = Promise.withResolvers<void>()
      const h = transportHarness(async () => {
        try {
          return await handlers["course.save"](course)
        } finally {
          finished.resolve()
        }
      })
      h.admission.dispatch({ type: "bootstrap-acknowledged" })
      h.receive(startMessage("course.save", course))
      await finished.promise
      await flushTransport()
      assert.equal(h.admission.getSnapshot().phase, "terminal")
      assert.deepEqual(await store.loadCourse(course.id), {
        ...course,
        ...stamp,
      })
      h.gateway.dispose()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

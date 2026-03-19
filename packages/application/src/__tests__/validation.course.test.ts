import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { PersistedCourse } from "@repo-edu/domain/types"
import { createInMemoryCourseStore } from "../core.js"
import { createCourseWorkflowHandlers } from "../course-workflows.js"
import { getCourseScenario } from "./helpers/fixture-scenarios.js"
import { makeInvalidCourseWrongKind } from "./helpers/test-builders.js"

describe("application course workflow helpers", () => {
  it("lists, loads, and saves courses through the shared course store", async () => {
    const original = getCourseScenario({
      tier: "small",
      preset: "shared-teams",
    })
    const store = createInMemoryCourseStore([original])
    const handlers = createCourseWorkflowHandlers(store)

    const listed = await handlers["course.list"](undefined)
    assert.deepStrictEqual(listed, [
      {
        id: original.id,
        displayName: original.displayName,
        updatedAt: original.updatedAt,
      },
    ])

    const loaded = await handlers["course.load"]({ courseId: original.id })
    assert.equal(loaded.id, original.id)

    const saved = await handlers["course.save"]({
      ...original,
      displayName: "Updated Course",
      updatedAt: "2000-01-01T00:00:00Z",
    })
    assert.equal(saved.displayName, "Updated Course")
    assert.notEqual(saved.updatedAt, "2000-01-01T00:00:00Z")

    const reloaded = await handlers["course.load"]({ courseId: original.id })
    assert.equal(reloaded.displayName, "Updated Course")
    assert.equal(reloaded.updatedAt, saved.updatedAt)
  })

  it("returns a validation AppError when course.save receives invalid data", async () => {
    const handlers = createCourseWorkflowHandlers(createInMemoryCourseStore([]))

    await assert.rejects(
      handlers["course.save"]({
        ...makeInvalidCourseWrongKind(getCourseScenario()),
      }),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "type" in error &&
        error.type === "validation",
    )
  })

  it("returns a validation AppError when course.load resolves invalid course data", async () => {
    const handlers = createCourseWorkflowHandlers({
      listCourses: () => [],
      loadCourse: () =>
        makeInvalidCourseWrongKind(
          getCourseScenario(),
        ) as unknown as PersistedCourse,
      saveCourse: (course: PersistedCourse) => course,
      deleteCourse: () => {},
    })

    await assert.rejects(
      handlers["course.load"]({ courseId: "course-1" }),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "type" in error &&
        error.type === "validation",
    )
  })

  it("returns a validation AppError when course.list contains invalid course data", async () => {
    const handlers = createCourseWorkflowHandlers({
      listCourses: () =>
        [
          makeInvalidCourseWrongKind(getCourseScenario()),
        ] as unknown as PersistedCourse[],
      loadCourse: () => getCourseScenario(),
      saveCourse: (course: PersistedCourse) => course,
      deleteCourse: () => {},
    })

    await assert.rejects(
      handlers["course.list"](undefined),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "type" in error &&
        error.type === "validation",
    )
  })
})

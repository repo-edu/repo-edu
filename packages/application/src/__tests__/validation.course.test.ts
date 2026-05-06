import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { PersistedCourse } from "@repo-edu/domain/types"
import { createBlankAnalysis } from "@repo-edu/domain/types"
import { createDocumentsListWorkflowHandler } from "../analysis-doc-workflows.js"
import {
  createInMemoryAnalysisStore,
  createInMemoryCourseStore,
} from "../core.js"
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
        courseKind: original.courseKind,
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

  it("course.delete removes a course from the store", async () => {
    const original = getCourseScenario()
    const store = createInMemoryCourseStore([original])
    const handlers = createCourseWorkflowHandlers(store)

    await handlers["course.delete"]({ courseId: original.id })

    await assert.rejects(
      handlers["course.load"]({ courseId: original.id }),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "type" in error &&
        error.type === "not-found",
    )
  })

  it("includes courseKind in document summaries", async () => {
    const course = getCourseScenario({
      tier: "small",
      preset: "repobee-teams",
    })
    const analysis = createBlankAnalysis(
      "analysis-1",
      "2026-01-02T00:00:00.000Z",
      { displayName: "Standalone Analysis" },
    )
    const handlers = createDocumentsListWorkflowHandler(
      createInMemoryAnalysisStore([analysis]),
      createInMemoryCourseStore([course]),
    )

    const summaries = await handlers["documents.list"](undefined)

    assert.ok(
      summaries.some(
        (summary) =>
          summary.kind === "course" &&
          summary.id === course.id &&
          summary.courseKind === "repobee",
      ),
    )
  })

  it("course.delete throws cancelled AppError when signal is aborted", async () => {
    const store = createInMemoryCourseStore([getCourseScenario()])
    const handlers = createCourseWorkflowHandlers(store)
    const controller = new AbortController()
    controller.abort()

    await assert.rejects(
      handlers["course.delete"](
        { courseId: "any" },
        { signal: controller.signal },
      ),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "type" in error &&
        error.type === "cancelled",
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

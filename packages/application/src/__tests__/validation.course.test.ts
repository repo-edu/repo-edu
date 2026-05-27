import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { PersistedCourse } from "@repo-edu/domain/types"
import {
  createCourseSaveConflictError,
  createInMemoryCourseStore,
  createPersistenceWriteError,
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
        backing: original.backing,
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
    assert.equal(saved.revision, original.revision + 1)
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

  it("normalizes retryable write failures from course.save", async () => {
    const handlers = createCourseWorkflowHandlers({
      listCourses: () => [],
      loadCourse: () => null,
      saveCourse: () => {
        throw createPersistenceWriteError("busy", "Course store is busy.")
      },
      deleteCourse: () => {},
    })

    await assert.rejects(
      handlers["course.save"](getCourseScenario()),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "type" in error &&
        error.type === "persistence" &&
        "retryable" in error &&
        error.retryable === true,
    )
  })

  it("normalizes course save conflicts by reason", async () => {
    const course = getCourseScenario()
    const handlers = createCourseWorkflowHandlers({
      listCourses: () => [],
      loadCourse: () => null,
      saveCourse: () => {
        throw createCourseSaveConflictError({
          reason: "course-missing",
          courseId: course.id,
          expectedRevision: course.revision,
          storedRevision: null,
        })
      },
      deleteCourse: () => {},
    })

    await assert.rejects(
      handlers["course.save"](course),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "type" in error &&
        error.type === "conflict" &&
        "reason" in error &&
        error.reason === "course-missing",
    )
  })

  it("returns a validation AppError when course.load resolves invalid course data", async () => {
    const handlers = createCourseWorkflowHandlers({
      listCourses: () => [],
      loadCourse: () =>
        makeInvalidCourseWrongKind(
          getCourseScenario(),
        ) as unknown as PersistedCourse,
      saveCourse: (course: PersistedCourse) => ({
        revision: course.revision + 1,
        updatedAt: new Date().toISOString(),
      }),
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

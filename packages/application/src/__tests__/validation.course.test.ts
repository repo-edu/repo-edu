import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { createCourseStorageFailure } from "@repo-edu/application-contract"
import type { PersistedCourse } from "@repo-edu/domain/types"
import {
  createCourseSaveConflictError,
  createPersistenceWriteError,
} from "../core.js"
import { createCourseWorkflowHandlers } from "../course-workflows.js"
import { getCourseScenario } from "./helpers/fixture-scenarios.js"
import { createInMemoryCourseStore } from "./helpers/in-memory-stores.js"
import { makeInvalidCourseWrongKind } from "./helpers/test-builders.js"

describe("application course workflow helpers", () => {
  for (const asynchronous of [false, true]) {
    it(`maps raw ${asynchronous ? "asynchronous" : "synchronous"} adapter failures for every course action`, async () => {
      for (const failure of [new Error("SQLite failed."), "untyped failure"]) {
        const fail = () => {
          if (asynchronous) return Promise.reject(failure)
          throw failure
        }
        const handlers = createCourseWorkflowHandlers({
          listCourses: fail,
          loadCourse: fail,
          saveCourse: fail,
          deleteCourse: fail,
        })
        for (const call of [
          () => handlers["course.list"](undefined),
          () => handlers["course.load"]({ courseId: "course" }),
          () => handlers["course.save"](getCourseScenario()),
          () => handlers["course.delete"]({ courseId: "course" }),
        ]) {
          await assert.rejects(call, {
            type: "course-storage",
            message:
              failure instanceof Error
                ? failure.message
                : "The course storage action failed.",
          })
        }
      }
    })
  }

  it("cancels every course action before calling the adapter", async () => {
    let calls = 0
    const fail = () => {
      calls += 1
      throw new Error("Cancelled work reached the adapter.")
    }
    const handlers = createCourseWorkflowHandlers({
      listCourses: fail,
      loadCourse: fail,
      saveCourse: fail,
      deleteCourse: fail,
    })
    const options = { signal: AbortSignal.abort() }
    for (const call of [
      () => handlers["course.list"](undefined, options),
      () => handlers["course.load"]({ courseId: "course" }, options),
      () => handlers["course.save"](getCourseScenario(), options),
      () => handlers["course.delete"]({ courseId: "course" }, options),
    ]) {
      await assert.rejects(call, { type: "cancelled" })
    }
    assert.equal(calls, 0)
  })

  it("passes complete inserts and replacements through the same save boundary", async () => {
    for (const revision of [0, 7]) {
      const course = { ...getCourseScenario(), revision }
      const stamp = {
        revision: revision + 1,
        updatedAt: "2026-09-06T10:00:00Z",
      }
      const handlers = createCourseWorkflowHandlers({
        listCourses: () => [],
        loadCourse: () => null,
        saveCourse(successor) {
          assert.deepEqual(successor, course)
          return stamp
        },
        deleteCourse: () => {},
      })
      assert.deepEqual(await handlers["course.save"](course), stamp)
    }
  })

  it("preserves the shared terminal failure from the course adapter", async () => {
    const failure = createCourseStorageFailure("The course database failed.")
    const handlers = createCourseWorkflowHandlers({
      listCourses: () => {
        throw failure
      },
      loadCourse: () => {
        throw failure
      },
      saveCourse: () => {
        throw failure
      },
      deleteCourse: () => {
        throw failure
      },
    })
    for (const call of [
      () => handlers["course.list"](undefined),
      () => handlers["course.load"]({ courseId: "course" }),
      () => handlers["course.save"](getCourseScenario()),
      () => handlers["course.delete"]({ courseId: "course" }),
    ]) {
      await assert.rejects(call, (error: unknown) => error === failure)
    }
  })

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

  it("rejects an invalid successor before calling the adapter", async () => {
    let saves = 0
    const handlers = createCourseWorkflowHandlers({
      ...createInMemoryCourseStore([]),
      saveCourse() {
        saves += 1
        throw new Error("Invalid successors must never reach the adapter.")
      },
    })

    await assert.rejects(
      handlers["course.save"]({
        ...makeInvalidCourseWrongKind(getCourseScenario()),
      }),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "type" in error &&
        error.type === "course-storage",
    )
    assert.equal(saves, 0)
  })

  it("makes busy write failures terminal", async () => {
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
        error.type === "course-storage" &&
        !("retryable" in error),
    )
  })

  it("maps a row mismatch to terminal storage failure without a conflict reason", async () => {
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
        error.type === "course-storage" &&
        !("reason" in error),
    )
  })

  it("returns terminal storage failure when course.load resolves invalid data", async () => {
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
        error.type === "course-storage",
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

  it("returns terminal storage failure when course.list contains invalid data", async () => {
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
        error.type === "course-storage",
    )
  })
})

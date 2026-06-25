import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"
import type { WorkflowResult } from "@repo-edu/application-contract"
import type { PersistedAppPreferences } from "@repo-edu/domain/settings"
import type { PersistedCourse } from "@repo-edu/domain/types"
import { useCourseStore } from "../stores/course-store.js"
import { useUiStore } from "../stores/ui-store.js"
import {
  deferred,
  makeCourse,
  makeSettings,
  resetStores,
  startController,
  waitForSnapshot,
  workflowClient,
} from "./session-controller.test-support.js"

beforeEach(resetStores)

describe("SessionController activation", () => {
  it("waits for pending activation before close flush persists settings", async () => {
    const courseALoad = deferred<PersistedCourse>()
    const savedSettings: PersistedAppPreferences[] = []
    const controller = startController({
      workflowClient: workflowClient(async (workflowId, input) => {
        if (workflowId === "settings.loadApp") {
          return makeSettings() as WorkflowResult<typeof workflowId>
        }
        if (workflowId === "course.load") {
          assert.deepStrictEqual(input, { courseId: "course-a" })
          return (await courseALoad.promise) as WorkflowResult<
            typeof workflowId
          >
        }
        if (workflowId === "settings.savePreferences") {
          savedSettings.push(input as PersistedAppPreferences)
          return undefined as WorkflowResult<typeof workflowId>
        }
        throw new Error(`Unexpected workflow ${workflowId}`)
      }),
    })
    await waitForSnapshot(
      controller,
      (snapshot) => snapshot.bootstrap.status === "ready",
    )

    const transition = controller.activateSurface({
      kind: "course",
      courseId: "course-a",
    })
    await waitForSnapshot(
      controller,
      (snapshot) => snapshot.pending?.kind === "enter",
    )

    const closeFlush = controller.flush()
    assert.equal(
      await Promise.race([
        closeFlush.then(() => "flushed" as const),
        new Promise<"pending">((resolve) =>
          setTimeout(() => resolve("pending"), 20),
        ),
      ]),
      "pending",
    )

    courseALoad.resolve(makeCourse("course-a"))
    await transition
    await closeFlush

    assert.equal(controller.getSnapshot().activeCourseId, "course-a")
    assert.deepStrictEqual(savedSettings.at(-1)?.activeSurface, {
      kind: "course",
      courseId: "course-a",
    })

    controller.dispose()
  })

  it("serializes overlapping activations before committing the last request", async () => {
    const courseALoad = deferred<PersistedCourse>()
    let courseBLoadCount = 0
    const controller = startController({
      workflowClient: workflowClient(async (workflowId, input) => {
        if (workflowId === "settings.loadApp") {
          return makeSettings() as WorkflowResult<typeof workflowId>
        }
        if (workflowId === "course.load") {
          const { courseId } = input as { courseId: string }
          if (courseId === "course-a") {
            return (await courseALoad.promise) as WorkflowResult<
              typeof workflowId
            >
          }
          courseBLoadCount += 1
          return makeCourse(courseId) as WorkflowResult<typeof workflowId>
        }
        if (workflowId === "settings.savePreferences") {
          return undefined as WorkflowResult<typeof workflowId>
        }
        if (workflowId === "course.save") {
          return {
            revision: 1,
            updatedAt: "2026-05-29T00:00:01.000Z",
          } as WorkflowResult<typeof workflowId>
        }
        throw new Error(`Unexpected workflow ${workflowId}`)
      }),
    })
    await waitForSnapshot(
      controller,
      (snapshot) => snapshot.bootstrap.status === "ready",
    )

    const first = controller.activateSurface({
      kind: "course",
      courseId: "course-a",
    })
    const second = controller.activateSurface({
      kind: "course",
      courseId: "course-b",
    })

    assert.equal(
      await Promise.race([
        second.then(() => "activated" as const),
        new Promise<"pending">((resolve) =>
          setTimeout(() => resolve("pending"), 20),
        ),
      ]),
      "pending",
    )
    assert.equal(courseBLoadCount, 0)

    courseALoad.resolve(makeCourse("course-a"))
    await first
    await second

    assert.equal(courseBLoadCount, 1)
    assert.equal(controller.getSnapshot().activeCourseId, "course-b")
    assert.equal(useCourseStore.getState().course?.id, "course-b")

    controller.dispose()
  })

  it("keeps the committed course when target hydration normalization fails", async () => {
    const malformedCourse = {
      ...makeCourse("course-b"),
      roster: undefined,
    } as unknown as PersistedCourse
    const controller = startController({
      workflowClient: workflowClient(async (workflowId, input) => {
        if (workflowId === "settings.loadApp") {
          return makeSettings({
            activeSurface: { kind: "course", courseId: "course-a" },
          }) as WorkflowResult<typeof workflowId>
        }
        if (workflowId === "course.load") {
          const { courseId } = input as { courseId: string }
          return (
            courseId === "course-b" ? malformedCourse : makeCourse(courseId)
          ) as WorkflowResult<typeof workflowId>
        }
        if (workflowId === "settings.savePreferences") {
          return undefined as WorkflowResult<typeof workflowId>
        }
        throw new Error(`Unexpected workflow ${workflowId}`)
      }),
    })
    await waitForSnapshot(
      controller,
      (snapshot) => snapshot.bootstrap.status === "ready",
    )

    assert.equal(
      await controller.activateSurface({
        kind: "course",
        courseId: "course-b",
      }),
      false,
    )

    assert.equal(controller.getSnapshot().activeCourseId, "course-a")
    assert.equal(controller.getSnapshot().courseLoadStatus.state, "loaded")
    assert.equal(useCourseStore.getState().course?.id, "course-a")

    controller.dispose()
  })

  it("recovers a missing active course without flushing it", async () => {
    useUiStore.getState().setCourseList([
      {
        id: "course-b",
        backing: "lms",
        displayName: "Course B",
        updatedAt: "2026-05-29T00:00:00.000Z",
      },
    ])
    const savedCourses: PersistedCourse[] = []
    const controller = startController({
      workflowClient: workflowClient(async (workflowId, input) => {
        if (workflowId === "settings.loadApp") {
          return makeSettings({
            activeSurface: { kind: "course", courseId: "course-a" },
          }) as WorkflowResult<typeof workflowId>
        }
        if (workflowId === "course.load") {
          const { courseId } = input as { courseId: string }
          return makeCourse(courseId) as WorkflowResult<typeof workflowId>
        }
        if (workflowId === "course.save") {
          savedCourses.push(input as PersistedCourse)
          throw new Error("missing course should not be flushed")
        }
        if (workflowId === "settings.savePreferences") {
          return undefined as WorkflowResult<typeof workflowId>
        }
        throw new Error(`Unexpected workflow ${workflowId}`)
      }),
    })
    await waitForSnapshot(
      controller,
      (snapshot) => snapshot.bootstrap.status === "ready",
    )

    controller.setDisplayName("course-a", "Dirty missing course")
    assert.equal(
      await controller.recoverMissingActiveCourse({
        kind: "course",
        courseId: "course-b",
      }),
      true,
    )

    assert.equal(savedCourses.length, 0)
    assert.equal(controller.getSnapshot().activeCourseId, "course-b")
    assert.equal(useCourseStore.getState().course?.id, "course-b")

    controller.dispose()
  })

  it("rejects semantic mutations against the leaving course during enter", async () => {
    const courseBLoad = deferred<PersistedCourse>()
    const controller = startController({
      workflowClient: workflowClient(async (workflowId, input) => {
        if (workflowId === "settings.loadApp") {
          return makeSettings({
            activeSurface: { kind: "course", courseId: "course-a" },
          }) as WorkflowResult<typeof workflowId>
        }
        if (workflowId === "course.load") {
          const { courseId } = input as { courseId: string }
          return (
            courseId === "course-b"
              ? courseBLoad.promise
              : makeCourse(courseId, "Original")
          ) as WorkflowResult<typeof workflowId>
        }
        if (workflowId === "course.save") {
          return {
            revision: 1,
            updatedAt: "2026-05-29T00:00:01.000Z",
          } as WorkflowResult<typeof workflowId>
        }
        if (workflowId === "settings.savePreferences") {
          return undefined as WorkflowResult<typeof workflowId>
        }
        throw new Error(`Unexpected workflow ${workflowId}`)
      }),
    })
    await waitForSnapshot(
      controller,
      (snapshot) => snapshot.bootstrap.status === "ready",
    )

    const transition = controller.activateSurface({
      kind: "course",
      courseId: "course-b",
    })
    await waitForSnapshot(
      controller,
      (snapshot) => snapshot.pending?.kind === "enter",
    )

    controller.setDisplayName("course-a", "Rejected")
    assert.equal(useCourseStore.getState().course?.displayName, "Original")

    courseBLoad.resolve(makeCourse("course-b"))
    await transition

    controller.dispose()
  })

  it("queues an active-course rename behind a pending enter", async () => {
    const courseBLoad = deferred<PersistedCourse>()
    const savedDrafts: PersistedCourse[] = []
    const controller = startController({
      workflowClient: workflowClient(async (workflowId, input) => {
        if (workflowId === "settings.loadApp") {
          return makeSettings({
            activeSurface: { kind: "course", courseId: "course-a" },
          }) as WorkflowResult<typeof workflowId>
        }
        if (workflowId === "course.load") {
          const { courseId } = input as { courseId: string }
          if (courseId === "course-b") {
            return (await courseBLoad.promise) as WorkflowResult<
              typeof workflowId
            >
          }
          return makeCourse(courseId, "Original A") as WorkflowResult<
            typeof workflowId
          >
        }
        if (workflowId === "course.save") {
          savedDrafts.push(input as PersistedCourse)
          return {
            revision: 1,
            updatedAt: "2026-05-29T00:00:01.000Z",
          } as WorkflowResult<typeof workflowId>
        }
        if (workflowId === "settings.savePreferences") {
          return undefined as WorkflowResult<typeof workflowId>
        }
        throw new Error(`Unexpected workflow ${workflowId}`)
      }),
    })
    await waitForSnapshot(
      controller,
      (snapshot) => snapshot.bootstrap.status === "ready",
    )

    const transition = controller.activateSurface({
      kind: "course",
      courseId: "course-b",
    })
    await waitForSnapshot(
      controller,
      (snapshot) => snapshot.pending?.kind === "enter",
    )

    const renamed = controller.renameCourse("course-a", "Renamed A")
    courseBLoad.resolve(makeCourse("course-b"))
    await transition
    await renamed

    const renameSave = savedDrafts.find((draft) => draft.id === "course-a")
    assert.equal(renameSave?.displayName, "Renamed A")

    controller.dispose()
  })
})

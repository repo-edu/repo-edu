import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"
import type { WorkflowResult } from "@repo-edu/application-contract"
import type { PersistedCourse } from "@repo-edu/domain/types"
import { useCourseStore } from "../stores/course-store.js"
import { useUiStore } from "../stores/ui-store.js"
import {
  makeCourse,
  makeSettings,
  resetStores,
  startController,
  waitForSnapshot,
  workflowClient,
} from "./session-controller.test-support.js"

beforeEach(resetStores)

describe("SessionController creation", () => {
  it("activates a newly created course without re-loading it", async () => {
    const courseLoadCalls: string[] = []
    const controller = startController({
      workflowClient: workflowClient(async (workflowId, input) => {
        if (workflowId === "settings.loadApp") {
          return makeSettings() as WorkflowResult<typeof workflowId>
        }
        if (workflowId === "course.load") {
          const { courseId } = input as { courseId: string }
          courseLoadCalls.push(courseId)
          return makeCourse(courseId) as WorkflowResult<typeof workflowId>
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

    const draft = await controller.createCourse({
      backing: "lms",
      displayName: "New Course",
      lmsConnectionId: null,
      lmsCourseId: null,
    })

    assert.equal(courseLoadCalls.includes(draft.id), false)
    assert.equal(controller.getSnapshot().activeCourseId, draft.id)
    assert.equal(useCourseStore.getState().course?.id, draft.id)
    assert.equal(useCourseStore.getState().course?.revision, 1)

    controller.dispose()
  })

  it("does not create a durable course when the current course cannot be left", async () => {
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
          return makeCourse(courseId, "Original A") as WorkflowResult<
            typeof workflowId
          >
        }
        if (workflowId === "course.save") {
          const course = input as PersistedCourse
          savedCourses.push(course)
          if (course.id === "course-a") {
            throw {
              type: "conflict",
              message: "stale",
              resource: "course",
              reason: "revision-invariant",
            }
          }
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

    controller.setDisplayName("course-a", "Dirty A")
    await assert.rejects(
      controller.createCourse({
        backing: "lms",
        displayName: "New Course",
        lmsConnectionId: null,
        lmsCourseId: null,
      }),
    )

    assert.equal(
      savedCourses.some((course) => course.displayName === "New Course"),
      false,
    )
    assert.equal(controller.getSnapshot().activeCourseId, "course-a")
    assert.equal(useCourseStore.getState().course?.displayName, "Dirty A")

    controller.dispose()
  })

  it("seeds a loaded catalogue before activating a newly created course", async () => {
    useUiStore.getState().setCourseList([
      {
        id: "course-a",
        backing: "lms",
        displayName: "Course A",
        updatedAt: "2026-05-29T00:00:00.000Z",
      },
    ])
    const controller = startController({
      workflowClient: workflowClient(async (workflowId) => {
        if (workflowId === "settings.loadApp") {
          return makeSettings() as WorkflowResult<typeof workflowId>
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

    const draft = await controller.createCourse({
      backing: "lms",
      displayName: "New Course",
      lmsConnectionId: null,
      lmsCourseId: null,
    })

    assert.deepStrictEqual(controller.getSnapshot().activeSurface, {
      kind: "course",
      courseId: draft.id,
    })
    assert.deepStrictEqual(
      useUiStore.getState().courseList.find((course) => course.id === draft.id),
      {
        id: draft.id,
        backing: "lms",
        displayName: "New Course",
        updatedAt: "2026-05-29T00:00:01.000Z",
      },
    )

    controller.dispose()
  })
})

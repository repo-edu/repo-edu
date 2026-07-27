import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"
import type { WorkflowResult } from "@repo-edu/application-contract"
import type { PersistedCourse } from "@repo-edu/domain/types"
import { useCourseStore } from "../stores/course-store.js"
import { useUiStore } from "../stores/ui-store.js"
import {
  activeCourseId,
  activeSurface,
  deferred,
  makeCourse,
  makeSettings,
  pendingTransaction,
  resetStores,
  startController,
  waitForSnapshot,
  workflowClient,
} from "./session-controller.test-support.js"

beforeEach(resetStores)

describe("SessionController deletion", () => {
  it("commits home after active delete when fallback course loading fails", async () => {
    useUiStore.getState().setCourseList([
      {
        id: "course-a",
        backing: "lms",
        displayName: "Course A",
        updatedAt: "2026-05-29T00:00:00.000Z",
      },
      {
        id: "course-b",
        backing: "lms",
        displayName: "Course B",
        updatedAt: "2026-05-29T00:00:00.000Z",
      },
    ])
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
            throw new Error("fallback unavailable")
          }
          return makeCourse(courseId) as WorkflowResult<typeof workflowId>
        }
        if (workflowId === "course.delete") {
          assert.deepStrictEqual(input, { courseId: "course-a" })
          return undefined as WorkflowResult<typeof workflowId>
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

    await controller.deleteCourse("course-a")

    assert.deepStrictEqual(activeSurface(controller.getSnapshot()), {
      kind: "home",
    })
    assert.equal(activeCourseId(controller.getSnapshot()), null)
    assert.equal(useCourseStore.getState().course, null)

    controller.dispose()
  })

  it("keeps an active delete pending until fallback commit before later activation", async () => {
    useUiStore.getState().setCourseList([
      {
        id: "course-a",
        backing: "lms",
        displayName: "Course A",
        updatedAt: "2026-05-29T00:00:00.000Z",
      },
      {
        id: "course-b",
        backing: "lms",
        displayName: "Course B",
        updatedAt: "2026-05-29T00:00:00.000Z",
      },
    ])
    const deleteGate = deferred<void>()
    let courseBLoadCount = 0
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
            courseBLoadCount += 1
          }
          return makeCourse(courseId) as WorkflowResult<typeof workflowId>
        }
        if (workflowId === "course.delete") {
          assert.deepStrictEqual(input, { courseId: "course-a" })
          await deleteGate.promise
          return undefined as WorkflowResult<typeof workflowId>
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

    const deleting = controller.deleteCourse("course-a")
    await waitForSnapshot(
      controller,
      (snapshot) => pendingTransaction(snapshot)?.kind === "delete",
    )
    const activating = controller.activateSurface({
      kind: "course",
      courseId: "course-b",
    })

    assert.equal(
      await Promise.race([
        activating.then(() => "activated" as const),
        new Promise<"pending">((resolve) =>
          setTimeout(() => resolve("pending"), 20),
        ),
      ]),
      "pending",
    )
    assert.equal(courseBLoadCount, 0)
    assert.equal(pendingTransaction(controller.getSnapshot())?.kind, "delete")

    deleteGate.resolve()
    await deleting
    await activating

    assert.equal(courseBLoadCount, 1)
    assert.equal(activeCourseId(controller.getSnapshot()), "course-b")
    assert.equal(useCourseStore.getState().course?.id, "course-b")

    controller.dispose()
  })

  it("commits the fallback course after deleting the active course", async () => {
    useUiStore.getState().setCourseList([
      {
        id: "course-a",
        backing: "lms",
        displayName: "Course A",
        updatedAt: "2026-05-29T00:00:00.000Z",
      },
      {
        id: "course-b",
        backing: "lms",
        displayName: "Course B",
        updatedAt: "2026-05-29T00:00:00.000Z",
      },
    ])
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
        if (workflowId === "course.delete") {
          assert.deepStrictEqual(input, { courseId: "course-a" })
          return undefined as WorkflowResult<typeof workflowId>
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

    await controller.deleteCourse("course-a")

    assert.deepStrictEqual(activeSurface(controller.getSnapshot()), {
      kind: "course",
      courseId: "course-b",
    })
    assert.equal(activeCourseId(controller.getSnapshot()), "course-b")
    assert.equal(useCourseStore.getState().course?.id, "course-b")

    controller.dispose()
  })

  it("keeps the committed course and resumes saving when active delete fails", async () => {
    useUiStore.getState().setCourseList([
      {
        id: "course-a",
        backing: "lms",
        displayName: "Course A",
        updatedAt: "2026-05-29T00:00:00.000Z",
      },
    ])
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
          return makeCourse(courseId, "Original A") as WorkflowResult<
            typeof workflowId
          >
        }
        if (workflowId === "course.delete") {
          throw new Error("delete unavailable")
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

    await assert.rejects(controller.deleteCourse("course-a"))

    assert.equal(activeCourseId(controller.getSnapshot()), "course-a")
    assert.equal(useCourseStore.getState().course?.id, "course-a")
    assert.equal(pendingTransaction(controller.getSnapshot()), null)

    // The active worker is resumed, so a later edit still persists.
    controller.setDisplayName("course-a", "Renamed A")
    await controller.flush()
    assert.equal(
      savedDrafts.some((draft) => draft.displayName === "Renamed A"),
      true,
    )

    controller.dispose()
  })

  it("rejects course mutations against a course pending deletion", async () => {
    useUiStore.getState().setCourseList([
      {
        id: "course-a",
        backing: "lms",
        displayName: "Course A",
        updatedAt: "2026-05-29T00:00:00.000Z",
      },
    ])
    const deleteGate = deferred<void>()
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
        if (workflowId === "course.delete") {
          await deleteGate.promise
          return undefined as WorkflowResult<typeof workflowId>
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

    const deleting = controller.deleteCourse("course-a")
    await waitForSnapshot(
      controller,
      (snapshot) => pendingTransaction(snapshot)?.kind === "delete",
    )

    controller.setDisplayName("course-a", "Rejected")
    assert.equal(useCourseStore.getState().course?.displayName, "Original A")

    deleteGate.resolve()
    await deleting

    controller.dispose()
  })

  it("classifies a queued delete against the surface active at its turn", async () => {
    const courseBLoad = deferred<PersistedCourse>()
    const deleted: string[] = []
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
              ? await courseBLoad.promise
              : makeCourse(courseId)
          ) as WorkflowResult<typeof workflowId>
        }
        if (workflowId === "course.delete") {
          deleted.push((input as { courseId: string }).courseId)
          return undefined as WorkflowResult<typeof workflowId>
        }
        if (
          workflowId === "course.save" ||
          workflowId === "settings.savePreferences" ||
          workflowId === "settings.saveCredentials"
        ) {
          return (
            workflowId === "course.save"
              ? { revision: 1, updatedAt: "2026-05-30T00:00:00.000Z" }
              : undefined
          ) as WorkflowResult<typeof workflowId>
        }
        throw new Error(`Unexpected workflow ${workflowId}`)
      }),
    })
    await waitForSnapshot(
      controller,
      (snapshot) => snapshot.bootstrap.status === "ready",
    )

    const activation = controller.activateSurface({
      kind: "course",
      courseId: "course-b",
    })
    const deletion = controller.deleteCourse("course-b")
    courseBLoad.resolve(makeCourse("course-b"))
    await activation
    await deletion

    assert.deepEqual(deleted, ["course-b"])
    assert.deepEqual(activeSurface(controller.getSnapshot()), { kind: "home" })
    controller.dispose()
  })
})

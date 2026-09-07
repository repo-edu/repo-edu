import assert from "node:assert/strict"
import { beforeEach, it } from "node:test"
import { useCourseStore } from "../stores/course-store.js"
import {
  commitPreparation,
  makeCourse,
  makeSettings,
  resetStores,
  startController,
  waitForSnapshot,
  workflowClient,
} from "./session-controller.test-support.js"

beforeEach(resetStores)

it("closes worker starts at command reservation and applies persistence before input capture", async () => {
  const calls: string[] = []
  const controller = startController({
    workflowClient: workflowClient(async (id) => {
      calls.push(id)
      if (id === "settings.loadApp")
        return makeSettings({
          activeSurface: { kind: "course", courseId: "course" },
        })
      if (id === "course.load") return makeCourse("course")
      throw new Error(`Unexpected ordinary call ${id}`)
    }),
  })
  await waitForSnapshot(controller, (s) => s.bootstrap.status === "ready")
  controller.setDisplayName("course", "Dirty")
  controller.setTheme("dark")
  const reservation = controller.operations.reserve("repo.clone")
  assert.ok(reservation)
  await new Promise((resolve) => setTimeout(resolve, 320))
  assert.deepEqual(calls, ["settings.loadApp", "course.load"])
  await reservation.run(async (scope) => {
    await scope.preparePersistence(async (bundle) => {
      assert.equal(bundle.course?.displayName, "Dirty")
      assert.equal(bundle.preferences?.appearance.theme, "dark")
      return commitPreparation(bundle)
    })
    assert.equal(useCourseStore.getState().course?.revision, 1)
  })
  await controller.flush()
  assert.deepEqual(calls, ["settings.loadApp", "course.load"])
  controller.dispose()
})

it("retires a busy command without claiming dirty persistence", async () => {
  let saves = 0
  const controller = startController({
    workflowClient: workflowClient(async (id) => {
      if (id === "settings.loadApp") return makeSettings()
      if (id === "settings.savePreferences") {
        saves++
        return
      }
      throw new Error(id)
    }),
  })
  await waitForSnapshot(controller, (s) => s.bootstrap.status === "ready")
  controller.setTheme("dark")
  const reservation = controller.operations.reserve("repo.clone")
  assert.ok(reservation)
  await new Promise((resolve) => setTimeout(resolve, 320))
  assert.equal(saves, 0)
  await reservation.run(async () => "busy")
  await controller.flush()
  assert.equal(saves, 1)
  controller.dispose()
})

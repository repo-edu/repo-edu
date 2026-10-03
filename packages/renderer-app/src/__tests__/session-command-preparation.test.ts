import assert from "node:assert/strict"
import { beforeEach, it } from "node:test"
import {
  HostAdmissionRefusedError,
  type RosterExportMembersInput,
} from "@repo-edu/application-contract"
import type { PersistedCourse } from "@repo-edu/domain/types"
import { useCourseStore } from "../stores/course-store.js"
import {
  commandClient,
  commitPreparation,
  makeCourse,
  makeSettings,
  resetStores,
  startController,
  testSessionStart,
  waitForSnapshot,
  workflowClient,
} from "./session-controller.test-support.js"

beforeEach(resetStores)

const target = {
  kind: "user-save-target-ref" as const,
  referenceId: "target",
  displayName: "students.csv",
  suggestedFormat: "csv" as const,
}

it("closes worker starts at command reservation and applies persistence before input capture", async () => {
  const calls: string[] = []
  let captured: PersistedCourse | undefined
  const client = workflowClient(async (id, input) => {
    if (id === "course.list") return [makeCourse("course")]
    calls.push(id)
    if (id === "settings.loadApp")
      return makeSettings({
        activeSurface: { kind: "course", courseId: "course" },
      })
    if (id === "course.load") return makeCourse("course")
    if (id === "roster.exportMembers") {
      captured = (input as RosterExportMembersInput).course
      return { file: target }
    }
    throw new Error(`Unexpected ordinary call ${id}`)
  })
  const controller = startController({
    workflowClient: client,
    commandClient: commandClient(client, {
      commit: async (bundle) => {
        assert.equal(bundle.course?.displayName, "Dirty")
        assert.equal(bundle.preferences?.appearance.theme, "dark")
        return commitPreparation(bundle)
      },
    }),
  })
  await waitForSnapshot(controller, (s) => s.bootstrap.status === "ready")
  const loaded = useCourseStore.getState().course
  assert.ok(loaded)
  controller.setDisplayName("course", "Dirty")
  controller.setTheme("dark")
  const reservation = controller.operations.reserve(
    testSessionStart("studentsExport"),
    "roster.exportMembers",
  )
  assert.ok(reservation)
  await new Promise((resolve) => setTimeout(resolve, 320))
  assert.deepEqual(calls, ["settings.loadApp", "course.load"])
  await reservation.run((scope) =>
    scope.run("roster.exportMembers", {
      course: loaded,
      target,
      format: "csv",
    }),
  )
  assert.equal(captured?.displayName, "Dirty")
  assert.equal(captured?.revision, 1)
  await controller.waitForIdle()
  assert.deepEqual(calls, [
    "settings.loadApp",
    "course.load",
    "roster.exportMembers",
  ])
  controller.dispose()
})

it("retires a busy command without claiming dirty persistence", async () => {
  let saves = 0
  const client = workflowClient(async (id) => {
    if (id === "course.list") return [makeCourse("course")]
    if (id === "settings.loadApp") return makeSettings()
    if (id === "settings.savePreferences") {
      saves++
      return
    }
    throw new Error(id)
  })
  const controller = startController({
    workflowClient: client,
    commandClient: commandClient(client, {
      admission: () => "busy",
      commit: async () => assert.fail("A refused command has no preparation"),
    }),
  })
  await waitForSnapshot(controller, (s) => s.bootstrap.status === "ready")
  controller.setTheme("dark")
  await assert.rejects(
    controller.operations.execute(
      testSessionStart("studentsExport"),
      "roster.exportMembers",
      (scope) =>
        scope.run("roster.exportMembers", {
          course: makeCourse("course"),
          target,
          format: "csv",
        }),
    ),
    HostAdmissionRefusedError,
  )
  assert.equal(saves, 0)
  await controller.waitForIdle()
  assert.equal(saves, 1)
  controller.dispose()
})

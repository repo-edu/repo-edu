import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"
import type { WorkflowResult } from "@repo-edu/application-contract"
import type { PersistedCourse } from "@repo-edu/domain/types"
import { useCourseStore } from "../stores/course-store.js"
import {
  activeCourseId,
  deferred,
  makeCourse,
  makeSettings,
  resetStores,
  startController,
  waitForSnapshot,
  workflowClient,
} from "./session-controller.test-support.js"

beforeEach(resetStores)

describe("SessionController mutation admission", () => {
  it("refuses course, settings and surface changes for the entire command reservation", async () => {
    const controller = startController({
      workflowClient: workflowClient(async (id) => {
        if (id === "settings.loadApp")
          return makeSettings({
            activeSurface: { kind: "course", courseId: "course-a" },
          })
        if (id === "course.load") return makeCourse("course-a")
        return undefined
      }),
    })
    await controller.waitForIdle()
    const baseline = controller.getSnapshot().settings
    const course = useCourseStore.getState().course
    const command = controller.operations.reserve<void>("repo.clone")
    assert.ok(command)
    controller.setTheme("dark")
    controller.setActiveGitConnectionId("git")
    controller.setDisplayName("course-a", "Blocked")
    controller.setActiveTab("analysis")
    controller.setAnalysisInputs("course-a", { since: "2026-01-01" })
    await assert.rejects(
      controller.activateSurface({ kind: "home" }),
      /not accepting/,
    )
    assert.equal(controller.getSnapshot().settings, baseline)
    assert.equal(useCourseStore.getState().course, course)
    await command.run(async () => {})
    controller.setTheme("dark")
    assert.equal(
      controller.getSnapshot().settings.preferences.appearance.theme,
      "dark",
    )
    controller.dispose()
  })

  it("admits target-aware course mutations only for the active course", async () => {
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

    const baselineRoster = useCourseStore.getState().course?.roster
    assert.ok(baselineRoster)
    const bumped = { ...makeCourse("x").idSequences, nextMemberSeq: 99 }

    let staleFollowUpRan = false
    controller.mutateCourse("course-b", (actions) => {
      actions.setRoster(baselineRoster, "Import students from file")
      actions.setIdSequences(bumped)
      staleFollowUpRan = true
    })
    assert.equal(staleFollowUpRan, false)
    assert.notDeepStrictEqual(
      useCourseStore.getState().course?.idSequences,
      bumped,
    )

    let admittedFollowUpRan = false
    controller.mutateCourse("course-a", (actions) => {
      actions.setRoster(baselineRoster, "Import students from file")
      actions.setIdSequences(bumped)
      admittedFollowUpRan = true
    })
    assert.equal(admittedFollowUpRan, true)
    assert.deepStrictEqual(
      useCourseStore.getState().course?.idSequences,
      bumped,
    )

    controller.dispose()
  })

  it("drops course mutations after controller disposal", async () => {
    const controller = startController({
      workflowClient: workflowClient(async (workflowId, input) => {
        if (workflowId === "settings.loadApp") {
          return makeSettings({
            activeSurface: { kind: "course", courseId: "course-a" },
          }) as WorkflowResult<typeof workflowId>
        }
        if (workflowId === "course.load") {
          const { courseId } = input as { courseId: string }
          return makeCourse(courseId, "Original") as WorkflowResult<
            typeof workflowId
          >
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

    controller.dispose()
    let callbackRan = false
    controller.mutateCourse("course-a", (actions) => {
      actions.setDisplayName("Rejected")
      callbackRan = true
    })
    controller.setDisplayName("course-a", "Rejected")

    assert.equal(callbackRan, false)
    assert.equal(useCourseStore.getState().course?.displayName, "Original")
  })

  it("does not hydrate the course store when load resolves after dispose", async () => {
    const courseLoad = deferred<PersistedCourse>()
    const controller = startController({
      workflowClient: workflowClient(async (workflowId, input) => {
        if (workflowId === "settings.loadApp") {
          return makeSettings({
            activeSurface: { kind: "course", courseId: "course-a" },
          }) as WorkflowResult<typeof workflowId>
        }
        if (workflowId === "course.load") {
          assert.deepStrictEqual(input, { courseId: "course-a" })
          return (await courseLoad.promise) as WorkflowResult<typeof workflowId>
        }
        if (workflowId === "settings.savePreferences") {
          return undefined as WorkflowResult<typeof workflowId>
        }
        throw new Error(`Unexpected workflow ${workflowId}`)
      }),
    })
    await waitForSnapshot(
      controller,
      (snapshot) => snapshot.courseLoadStatus.state === "loading",
    )

    controller.dispose()
    courseLoad.resolve(makeCourse("course-a"))
    await controller.waitForIdle()

    assert.equal(useCourseStore.getState().course, null)
    assert.equal(activeCourseId(controller.getSnapshot()), null)
  })
})

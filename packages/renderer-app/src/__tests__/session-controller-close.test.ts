import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"
import type { WorkflowResult } from "@repo-edu/application-contract"
import { useConnectionsStore } from "../stores/connections-store.js"
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

describe("SessionController close protocol", () => {
  it("closes settings admission before draining and stays closing on success", async () => {
    const save = deferred<void>()
    const controller = startController({
      workflowClient: workflowClient(async (workflowId) => {
        if (workflowId === "settings.loadApp")
          return makeSettings() as WorkflowResult<typeof workflowId>
        if (workflowId === "settings.savePreferences") {
          await save.promise
          return undefined as WorkflowResult<typeof workflowId>
        }
        if (workflowId === "settings.saveCredentials")
          return undefined as WorkflowResult<typeof workflowId>
        throw new Error(`Unexpected workflow ${workflowId}`)
      }),
    })
    await waitForSnapshot(
      controller,
      (snapshot) => snapshot.bootstrap.status === "ready",
    )
    controller.setTheme("dark")
    const closing = controller.requestClose("close-1")
    assert.deepEqual(controller.getSnapshot().lifecycle, {
      kind: "closing",
      attemptId: "close-1",
    })
    controller.setTheme("light")
    assert.equal(
      controller.getSnapshot().settings.preferences.appearance.theme,
      "dark",
    )
    save.resolve()
    await closing
    assert.equal(controller.getSnapshot().lifecycle.kind, "closing")
    controller.dispose()
    controller.setTheme("light")
    assert.equal(
      controller.getSnapshot().settings.preferences.appearance.theme,
      "dark",
    )
  })

  it("restores live only for the matching failed close attempt", async () => {
    const controller = startController({
      workflowClient: workflowClient(async (workflowId) => {
        if (workflowId === "settings.loadApp")
          return makeSettings() as WorkflowResult<typeof workflowId>
        if (workflowId === "settings.savePreferences")
          throw new Error("save failed")
        if (workflowId === "settings.saveCredentials")
          return undefined as WorkflowResult<typeof workflowId>
        throw new Error(`Unexpected workflow ${workflowId}`)
      }),
    })
    await waitForSnapshot(
      controller,
      (snapshot) => snapshot.bootstrap.status === "ready",
    )
    controller.setTheme("dark")
    await assert.rejects(controller.requestClose("close-1"), /save failed/)
    assert.equal(controller.getSnapshot().lifecycle.kind, "live")
    assert.equal(controller.cancelClose("close-0"), false)
    controller.dispose()
  })

  it("uses matching cancellation acknowledgement to reopen input", async () => {
    const courseLoad = deferred<ReturnType<typeof makeCourse>>()
    const controller = startController({
      workflowClient: workflowClient(async (workflowId) => {
        if (workflowId === "settings.loadApp")
          return makeSettings() as WorkflowResult<typeof workflowId>
        if (workflowId === "course.load")
          return (await courseLoad.promise) as WorkflowResult<typeof workflowId>
        if (
          workflowId === "settings.savePreferences" ||
          workflowId === "settings.saveCredentials"
        )
          return undefined as WorkflowResult<typeof workflowId>
        throw new Error(`Unexpected workflow ${workflowId}`)
      }),
    })
    await waitForSnapshot(
      controller,
      (snapshot) => snapshot.bootstrap.status === "ready",
    )
    const activation = controller.activateSurface({
      kind: "course",
      courseId: "course-a",
    })
    const closing = controller.requestClose("close-1")
    assert.equal(controller.cancelClose("stale"), false)
    assert.equal(controller.cancelClose("close-1"), true)
    controller.setTheme("dark")
    assert.equal(
      controller.getSnapshot().settings.preferences.appearance.theme,
      "dark",
    )
    courseLoad.resolve(makeCourse("course-a"))
    await activation
    await closing
    controller.dispose()
  })

  it("refuses a pre-close workflow result through the course mutation gate", async () => {
    const result = deferred<void>()
    const controller = startController({
      workflowClient: workflowClient(async (workflowId) => {
        if (workflowId === "settings.loadApp")
          return makeSettings({
            activeSurface: { kind: "course", courseId: "course-a" },
          }) as WorkflowResult<typeof workflowId>
        if (workflowId === "course.load")
          return makeCourse("course-a", "Original") as WorkflowResult<
            typeof workflowId
          >
        if (
          workflowId === "settings.savePreferences" ||
          workflowId === "settings.saveCredentials" ||
          workflowId === "course.save"
        )
          return undefined as WorkflowResult<typeof workflowId>
        throw new Error(`Unexpected workflow ${workflowId}`)
      }),
    })
    await waitForSnapshot(
      controller,
      (snapshot) => snapshot.bootstrap.status === "ready",
    )
    const lateMutation = result.promise.then(() => {
      controller.setDisplayName("course-a", "Late")
    })
    await controller.requestClose("close-1")
    result.resolve()
    await lateMutation
    assert.equal(controller.getSnapshot().lifecycle.kind, "closing")
    controller.dispose()
  })

  it("installs credential cleanup before notifying subscribers", async () => {
    const controller = startController({
      workflowClient: workflowClient(async (workflowId) => {
        if (workflowId === "settings.loadApp")
          return makeSettings() as WorkflowResult<typeof workflowId>
        if (
          workflowId === "settings.savePreferences" ||
          workflowId === "settings.saveCredentials"
        )
          return undefined as WorkflowResult<typeof workflowId>
        throw new Error(`Unexpected workflow ${workflowId}`)
      }),
    })
    await waitForSnapshot(
      controller,
      (snapshot) => snapshot.bootstrap.status === "ready",
    )
    controller.addGitConnection({
      id: "git-a",
      provider: "github",
      baseUrl: "https://api.github.com",
      token: "token",
    })
    useConnectionsStore.getState().setGitStatus("git-a", "connected")
    let statusAtNotification: string | null = null
    controller.subscribe(() => {
      if (
        controller.getSnapshot().settings.credentials.gitConnections.length ===
        0
      ) {
        statusAtNotification =
          useConnectionsStore.getState().gitStatuses["git-a"] ?? null
      }
    })
    controller.removeGitConnection("git-a")
    assert.equal(statusAtNotification, null)
    controller.dispose()
  })

  it("isolates throwing settings subscribers", async () => {
    const controller = startController({
      workflowClient: workflowClient(async (workflowId) => {
        if (workflowId === "settings.loadApp")
          return makeSettings() as WorkflowResult<typeof workflowId>
        if (
          workflowId === "settings.savePreferences" ||
          workflowId === "settings.saveCredentials"
        )
          return undefined as WorkflowResult<typeof workflowId>
        throw new Error(`Unexpected workflow ${workflowId}`)
      }),
    })
    await waitForSnapshot(
      controller,
      (snapshot) => snapshot.bootstrap.status === "ready",
    )
    let notified = false
    const originalError = console.error
    console.error = () => undefined
    const unsubscribeThrowing = controller.subscribe(() => {
      throw new Error("subscriber failed")
    })
    const unsubscribeNotified = controller.subscribe(() => {
      notified = true
    })
    controller.setTheme("dark")
    unsubscribeThrowing()
    unsubscribeNotified()
    console.error = originalError
    assert.equal(notified, true)
    assert.equal(
      controller.getSnapshot().settings.preferences.appearance.theme,
      "dark",
    )
    controller.dispose()
  })
})

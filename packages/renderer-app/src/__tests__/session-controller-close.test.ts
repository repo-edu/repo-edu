import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"
import {
  HostAdmissionRefusedError,
  type PersistencePreparationBundle,
  type WorkflowResult,
} from "@repo-edu/application-contract"
import { useConnectionsStore } from "../stores/connections-store.js"
import { useCourseStore } from "../stores/course-store.js"
import {
  commitPreparation,
  deferred,
  makeCourse,
  makeSettings,
  resetStores,
  startController,
  waitForSnapshot,
  workflowClient,
} from "./session-controller.test-support.js"

beforeEach(resetStores)

describe("SessionController close preparation", () => {
  function controllerWithCourse() {
    return startController({
      workflowClient: workflowClient(async (id) => {
        if (id === "settings.loadApp")
          return makeSettings({
            activeSurface: { kind: "course", courseId: "course-a" },
          })
        if (id === "course.load") return makeCourse("course-a")
        throw new Error("No ordinary save may start during preparation.")
      }),
    })
  }

  it("claims all dirty documents and applies stamps before returning ready", async () => {
    const controller = controllerWithCourse()
    await waitForSnapshot(controller, (s) => s.bootstrap.status === "ready")
    controller.setTheme("dark")
    controller.addGitConnection({
      id: "git",
      provider: "github",
      baseUrl: "https://api.github.com",
      token: "token",
    })
    controller.setDisplayName("course-a", "Changed")
    const committed = deferred<void>()
    let bundle: PersistencePreparationBundle | undefined
    const close = controller.requestClose("close", async (value) => {
      bundle = value
      await committed.promise
      return commitPreparation(value)
    })
    await new Promise<void>((resolve) => setImmediate(resolve))
    assert.equal(bundle?.course?.displayName, "Changed")
    assert.equal(bundle?.preferences?.appearance.theme, "dark")
    assert.equal(bundle?.credentials?.gitConnections[0]?.id, "git")
    controller.setTheme("light")
    assert.equal(
      controller.getSnapshot().settings.preferences.appearance.theme,
      "dark",
    )
    assert.equal(useCourseStore.getState().course?.revision, 0)
    committed.resolve()
    await close
    assert.equal(useCourseStore.getState().course?.revision, 1)
    assert.equal(controller.getSnapshot().lifecycle.kind, "closing-preparing")
    controller.dispose()
  })

  it("keeps a host-refused save dirty until the queued close claims it", async () => {
    const body = deferred<void>()
    const started = deferred<void>()
    const saveRefused = deferred<void>()
    const controller = startController({
      workflowClient: workflowClient(async (id) => {
        if (id === "settings.loadApp") return makeSettings()
        if (id === "settings.savePreferences") {
          saveRefused.resolve()
          throw new HostAdmissionRefusedError()
        }
        throw new Error(id)
      }),
    })
    await waitForSnapshot(controller, (s) => s.bootstrap.status === "ready")
    controller.setTheme("dark")
    const earlier = controller.operations.execute(
      "course.list",
      async (scope) => {
        started.resolve()
        await scope.follow(() => body.promise)
      },
    )
    await started.promise
    let bundle: PersistencePreparationBundle | undefined
    const close = controller.requestClose("close", async (value) => {
      bundle = value
      return {}
    })
    await saveRefused.promise
    assert.equal(Boolean(bundle), false)
    body.resolve()
    await earlier
    await close
    assert.equal(bundle?.preferences?.appearance.theme, "dark")
    controller.dispose()
  })

  it("disposes every worker after commit failure without restoring close", async () => {
    const controller = controllerWithCourse()
    await waitForSnapshot(controller, (s) => s.bootstrap.status === "ready")
    controller.setDisplayName("course-a", "Changed")
    await assert.rejects(
      controller.requestClose("close", async () => {
        throw new Error("store failed")
      }),
      /store failed/,
    )
    assert.equal(controller.getSnapshot().lifecycle.kind, "disposed")
    assert.equal(controller.getSnapshot().settings.credentialsWorkerId, null)
    assert.equal(controller.getSnapshot().settings.preferencesWorkerId, null)
  })

  it("rejects a mismatched course stamp before any readiness", async () => {
    const controller = controllerWithCourse()
    await waitForSnapshot(controller, (s) => s.bootstrap.status === "ready")
    controller.setDisplayName("course-a", "Changed")
    await assert.rejects(
      controller.requestClose("close", async () => ({
        course: {
          courseId: "foreign",
          revision: 3,
          updatedAt: "2026-09-07T00:00:00.000Z",
        },
      })),
      /different course claim/,
    )
    assert.equal(controller.getSnapshot().lifecycle.kind, "disposed")
    assert.equal(useCourseStore.getState().course?.revision, 0)
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

import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"
import type { WorkflowResult } from "@repo-edu/application-contract"
import type { PersistedAppPreferences } from "@repo-edu/domain/settings"
import { useCourseStore } from "../stores/course-store.js"
import { useToastStore } from "../stores/toast-store.js"
import {
  activeCourseId,
  activeSurface,
  deferred,
  makeCourse,
  makeSettings,
  resetStores,
  startController,
  waitForSnapshot,
  workflowClient,
} from "./session-controller.test-support.js"

beforeEach(resetStores)

describe("SessionController bootstrap", () => {
  it("acknowledges settled bootstrap before publishing readiness", async () => {
    const load = deferred<ReturnType<typeof makeSettings>>()
    const acknowledgement = deferred<void>()
    const requested = deferred<void>()
    let acknowledged = 0
    const controller = startController({
      workflowClient: workflowClient(async (id) => {
        if (id === "settings.loadApp") return await load.promise
        if (id === "settings.savePreferences") return undefined
        throw new Error(`Unexpected workflow ${id}`)
      }),
      async onBootstrapReady() {
        acknowledged++
        requested.resolve()
        await acknowledgement.promise
      },
    })
    assert.equal(acknowledged, 0)
    load.resolve(makeSettings())
    await requested.promise
    assert.equal(controller.getSnapshot().bootstrap.status, "loading")
    acknowledgement.resolve()
    await waitForSnapshot(
      controller,
      (snapshot) => snapshot.bootstrap.status === "ready",
    )
    assert.equal(acknowledged, 1)
    controller.dispose()
  })

  it("does not publish readiness when the host rejects bootstrap acknowledgement", async () => {
    const controller = startController({
      workflowClient: workflowClient(async () => makeSettings()),
      async onBootstrapReady() {
        throw new Error("Host closed during bootstrap.")
      },
    })
    await waitForSnapshot(
      controller,
      (snapshot) => snapshot.bootstrap.status === "error",
    )
    assert.deepEqual(controller.getSnapshot().bootstrap, {
      status: "error",
      attempt: 1,
      message: "Host closed during bootstrap.",
    })
    controller.dispose()
  })

  it("cannot finish a disposed bootstrap after a delayed host acknowledgement", async () => {
    const acknowledgement = deferred<void>()
    const requested = deferred<void>()
    const controller = startController({
      workflowClient: workflowClient(async () => makeSettings()),
      async onBootstrapReady() {
        requested.resolve()
        await acknowledgement.promise
      },
    })
    await requested.promise
    controller.dispose()
    acknowledgement.resolve()
    await new Promise<void>((resolve) => setImmediate(resolve))
    assert.equal(controller.getSnapshot().lifecycle.kind, "disposed")
    assert.notEqual(controller.getSnapshot().bootstrap.status, "ready")
  })

  it("bootstraps settings and hydrates the restored active course", async () => {
    const controller = startController({
      workflowClient: workflowClient(async (workflowId, input) => {
        if (workflowId === "settings.loadApp") {
          return makeSettings({
            activeSurface: { kind: "course", courseId: "course-a" },
            activeTab: "groups-assignments",
          }) as WorkflowResult<typeof workflowId>
        }
        if (workflowId === "course.load") {
          assert.deepStrictEqual(input, { courseId: "course-a" })
          return makeCourse("course-a") as WorkflowResult<typeof workflowId>
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

    assert.equal(activeCourseId(controller.getSnapshot()), "course-a")
    assert.equal(controller.getSnapshot().courseLoadStatus.state, "loaded")
    assert.equal(useCourseStore.getState().course?.id, "course-a")

    controller.dispose()
  })

  it("hydrates settings sections and emits recovery warning toasts", async () => {
    const restoredSettings = makeSettings({
      activeGitConnectionId: "github-1",
      gitConnections: [
        {
          id: "github-1",
          provider: "github",
          baseUrl: "https://github.com",
          token: "ghp_test",
        },
      ],
    })
    restoredSettings.recovery = [
      {
        unit: "preferences",
        reason: "invalid",
        backupPath: "/tmp/preferences.invalid-1.json",
      },
    ]
    const controller = startController({
      workflowClient: workflowClient(async (workflowId) => {
        if (workflowId === "settings.loadApp") {
          return restoredSettings as WorkflowResult<typeof workflowId>
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

    assert.deepStrictEqual(
      controller.getSnapshot().settings.credentials.gitConnections,
      restoredSettings.credentials.gitConnections,
    )
    assert.equal(
      controller.getSnapshot().settings.preferences.kind,
      "repo-edu.app-preferences.v1",
    )
    assert.deepStrictEqual(useToastStore.getState().toasts, [
      {
        id: useToastStore.getState().toasts[0]?.id,
        message:
          "preferences settings were invalid: /tmp/preferences.invalid-1.json",
        tone: "warning",
        durationMs: 10_000,
        action: undefined,
      },
    ])

    controller.dispose()
  })

  it("does not emit recovery warnings after disposal", async () => {
    const settingsLoad = deferred<ReturnType<typeof makeSettings>>()
    const controller = startController({
      workflowClient: workflowClient(async (workflowId) => {
        if (workflowId === "settings.loadApp") {
          return (await settingsLoad.promise) as WorkflowResult<
            typeof workflowId
          >
        }
        throw new Error(`Unexpected workflow ${workflowId}`)
      }),
    })
    controller.dispose()

    const restoredSettings = makeSettings()
    restoredSettings.recovery = [
      {
        unit: "preferences",
        reason: "invalid",
        backupPath: "/tmp/preferences.invalid-1.json",
      },
    ]
    settingsLoad.resolve(restoredSettings)
    await settingsLoad.promise
    await new Promise<void>((resolve) => setImmediate(resolve))

    assert.deepStrictEqual(useToastStore.getState().toasts, [])
  })

  it("recovers a missing persisted active course to home during bootstrap", async () => {
    const savedSettings: PersistedAppPreferences[] = []
    const controller = startController({
      workflowClient: workflowClient(async (workflowId, input) => {
        if (workflowId === "settings.loadApp") {
          return makeSettings({
            activeSurface: {
              kind: "course",
              courseId: "missing-course",
            },
          }) as WorkflowResult<typeof workflowId>
        }
        if (workflowId === "course.load") {
          assert.deepStrictEqual(input, { courseId: "missing-course" })
          throw {
            type: "not-found",
            message: "Course was removed.",
            resource: "course",
          }
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
    await controller.flush()

    assert.deepStrictEqual(activeSurface(controller.getSnapshot()), {
      kind: "home",
    })
    assert.equal(activeCourseId(controller.getSnapshot()), null)
    assert.equal(useCourseStore.getState().course, null)
    assert.deepStrictEqual(savedSettings.at(-1)?.activeSurface, {
      kind: "home",
    })

    controller.dispose()
  })

  it("normalizes loaded roster courses without mutating workflow results", async () => {
    const loadedCourse = makeCourse("course-a")
    const controller = startController({
      workflowClient: workflowClient(async (workflowId) => {
        if (workflowId === "settings.loadApp") {
          return makeSettings({
            activeSurface: { kind: "course", courseId: "course-a" },
          }) as WorkflowResult<typeof workflowId>
        }
        if (workflowId === "course.load") {
          return loadedCourse as WorkflowResult<typeof workflowId>
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

    const hydratedCourse = useCourseStore.getState().course
    assert.notEqual(hydratedCourse, loadedCourse)
    assert.equal(loadedCourse.roster.groupSets.length, 0)
    assert.equal(loadedCourse.idSequences.nextGroupSetSeq, 1)
    assert.equal(hydratedCourse?.roster.groupSets.length, 2)
    assert.equal(hydratedCourse?.idSequences.nextGroupSetSeq, 3)

    controller.dispose()
  })

  it("surfaces a bootstrap failure and recovers on retry", async () => {
    let settingsLoadAttempts = 0
    const controller = startController({
      workflowClient: workflowClient(async (workflowId) => {
        if (workflowId === "settings.loadApp") {
          settingsLoadAttempts += 1
          if (settingsLoadAttempts === 1) {
            throw new Error("settings unavailable")
          }
          return makeSettings() as WorkflowResult<typeof workflowId>
        }
        if (workflowId === "settings.savePreferences") {
          return undefined as WorkflowResult<typeof workflowId>
        }
        throw new Error(`Unexpected workflow ${workflowId}`)
      }),
    })

    await waitForSnapshot(
      controller,
      (snapshot) => snapshot.bootstrap.status === "error",
    )
    const failedBootstrap = controller.getSnapshot().bootstrap
    assert.equal(
      failedBootstrap.status === "error" ? failedBootstrap.message : null,
      "settings unavailable",
    )

    controller.retryBootstrap()

    await waitForSnapshot(
      controller,
      (snapshot) => snapshot.bootstrap.status === "ready",
    )
    assert.equal(settingsLoadAttempts, 2)

    controller.dispose()
  })
})

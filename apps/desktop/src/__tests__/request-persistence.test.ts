import assert from "node:assert/strict"
import { it } from "node:test"
import { createCourseWorkflowHandlers } from "@repo-edu/application"
import { HostAdmissionRefusedError } from "@repo-edu/application-contract"
import {
  defaultAppCredentials,
  defaultAppPreferences,
} from "@repo-edu/domain/settings"
import { createBlankCourse } from "@repo-edu/domain/types"
import {
  deferred,
  makeSettings,
  resetStores,
  startController,
  waitForSnapshot,
  workflowClient,
} from "../../../../packages/renderer-app/src/__tests__/session-controller.test-support"
import { canStartPersistenceWorker } from "../../../../packages/renderer-app/src/session/session-reducer"
import { HostAdmission } from "../host-admission"
import type { HostRequest } from "../host-admission-model"
import { createHostRequestTransport } from "../host-request-transport"
import {
  createPreloadRequestTransport,
  type RendererRequestObserver,
} from "../preload-request-transport"
import {
  commitRequestPersistence,
  type PreparationHandlers,
} from "../request-persistence"
import { requestChannel, until } from "./request-port-harness"

const course = createBlankCourse("course", "2026-09-07T00:00:00.000Z", {
  backing: "repobee",
  displayName: "Course",
})
const bundle = {
  course,
  credentials: defaultAppCredentials,
  preferences: defaultAppPreferences,
}
const stamp = { revision: 1, updatedAt: "2026-09-07T01:00:00.000Z" }

it("claims a save refused after close-port transfer while its renderer queue turn is pending", {
  timeout: 3000,
}, async () => {
  resetStores()
  const channel = requestChannel()
  const admission = new HostAdmission(() => {})
  const earlier = deferred<void>()
  const earlierStarted = deferred<void>()
  const refusedSave = deferred<void>()
  let refused = 0
  let writes = 0
  const controller = startController({
    onBootstrapReady: async () => {
      admission.dispatch({ type: "bootstrap-acknowledged" })
    },
    workflowClient: workflowClient(async (id) => {
      if (id === "settings.loadApp") return makeSettings()
      try {
        admission.startWorkflow(id, { cancel() {} })
      } catch (error) {
        assert.ok(error instanceof HostAdmissionRefusedError)
        refused++
        refusedSave.resolve()
        throw error
      }
      assert.fail("A background save must not win admission during close.")
    }),
  })
  await waitForSnapshot(
    controller,
    (snapshot) => snapshot.bootstrap.status === "ready",
  )
  controller.setTheme("dark")
  const body = controller.operations.execute("course.list", async (scope) => {
    earlierStarted.resolve()
    await scope.follow(() => earlier.promise)
  })
  await earlierStarted.promise
  const host = createHostRequestTransport({
    admission,
    cancel() {},
    receive(request, message) {
      if (message.type === "bundle")
        void commitRequestPersistence({
          request,
          bundle: message.bundle,
          admission,
          transport: host,
          handlers: {
            "settings.saveCredentials": async () => {
              assert.fail("Credentials are clean")
            },
            "settings.savePreferences": async (preferences) => {
              assert.equal(preferences.appearance.theme, "dark")
              writes++
            },
            "course.save": async () => {
              assert.fail("No course is loaded")
            },
          },
        })
      if (message.type === "close-ready") {
        host.acknowledgeClose(request)
        admission.dispatch({ type: "close-ready", request })
      }
    },
  })
  const renderer = createPreloadRequestTransport({
    channel() {
      throw new Error("No command")
    },
    terminal(error) {
      admission.dispatch({ type: "terminal", error })
    },
  })
  renderer.bridge.onClose((request) => {
    const exchange = createRequestPersistenceExchange(request)
    return {
      admission() {},
      prepare() {
        void controller.requestClose("close", exchange.commit).then(
          () => request.readyToClose(),
          (error) => request.fail(String(error)),
        )
      },
      persisted: exchange.persisted,
      failed: exchange.failed,
      progress() {},
      output() {},
      settlement() {},
      released() {},
      closeAcknowledged() {},
    }
  })
  const request = { cancel() {} }
  try {
    admission.dispatch({ type: "host-start", source: "window-close", request })
    host.prepareClose(request, channel.host)
    renderer.close(channel.renderer)
    await refusedSave.promise
    assert.equal(refused, 1)
    assert.equal(writes, 0)
    earlier.resolve()
    await body
    await until(() => admission.getSnapshot().phase === "closing.ready")
    assert.equal(writes, 1)
    assert.equal(canStartPersistenceWorker(controller.getSnapshot()), false)
  } finally {
    controller.dispose()
    host.dispose()
    renderer.dispose()
    channel.dispose()
  }
})

function admitted(close = false) {
  const effects: string[] = []
  const admission = new HostAdmission((effect) => {
    effects.push(effect.type)
  })
  const request: HostRequest = { cancel() {} }
  admission.dispatch({ type: "bootstrap-acknowledged" })
  admission.dispatch(
    close
      ? { type: "host-start", source: "window-close", request }
      : { type: "exclusive-intent", command: "repo.clone", request },
  )
  return { admission, request, effects }
}

for (const unit of ["credentials", "preferences", "course"] as const) {
  for (const boundary of ["before", "after"] as const) {
    it(`terminates ${boundary} the ${unit} commit without publishing partial success`, async () => {
      const h = admitted()
      const writes: string[] = []
      const error = new Error(`${unit} ${boundary}`)
      const write = async (name: string) => {
        if (name === unit && boundary === "before") throw error
        writes.push(name)
        if (name === unit && boundary === "after") throw error
      }
      let published = false
      await commitRequestPersistence({
        ...h,
        bundle,
        handlers: {
          "settings.saveCredentials": () => write("credentials"),
          "settings.savePreferences": () => write("preferences"),
          "course.save": async () => {
            await write("course")
            return stamp
          },
        },
        transport: {
          persistenceCommitted() {
            published = true
          },
        },
      })
      assert.equal(h.admission.getSnapshot().phase, "terminal")
      assert.equal(published, false)
      assert.equal(h.effects.filter((value) => value === "end-host").length, 1)
      const order = ["credentials", "preferences", "course"]
      assert.deepEqual(
        writes,
        order.slice(0, order.indexOf(unit) + (boundary === "after" ? 1 : 0)),
      )
    })
  }
}

it("treats an application-handler row mismatch as terminal preparation", async () => {
  const h = admitted()
  const handlers = createCourseWorkflowHandlers({
    listCourses: async () => [],
    loadCourse: async () => null,
    deleteCourse: async () => {},
    saveCourse: async () => {
      throw new Error("row mismatch")
    },
  })
  await commitRequestPersistence({
    ...h,
    bundle: { course },
    handlers: {
      ...handlers,
      "settings.saveCredentials": async () => {},
      "settings.savePreferences": async () => {},
    },
    transport: {
      persistenceCommitted() {
        assert.fail("No result after row mismatch")
      },
    },
  })
  const state = h.admission.getSnapshot()
  assert.equal(state.phase, "terminal")
  if (state.phase === "terminal")
    assert.equal((state.error as { type: string }).type, "course-storage")
})

for (const close of [false, true]) {
  it(`commits and returns stamps over the ${close ? "close" : "command"} request port`, async () => {
    const channel = requestChannel()
    const h = admitted(close)
    // Commands are admitted by their transport below.
    const admission = close ? h.admission : new HostAdmission(() => {})
    if (!close) admission.dispatch({ type: "bootstrap-acknowledged" })
    const writes: string[] = []
    const handlers: PreparationHandlers = {
      "settings.saveCredentials": async () => {
        writes.push("credentials")
      },
      "settings.savePreferences": async () => {
        writes.push("preferences")
      },
      "course.save": async () => {
        writes.push("course")
        return stamp
      },
    }
    const host = createHostRequestTransport({
      admission,
      cancel() {},
      receive(request, message) {
        assert.equal(message.type, "bundle")
        if (message.type === "bundle")
          void commitRequestPersistence({
            request,
            bundle: message.bundle,
            admission,
            handlers,
            transport: host,
          })
      },
    })
    const renderer = createPreloadRequestTransport({
      channel: (command) => ({
        renderer: channel.renderer,
        transfer: () => {
          host.acceptCommand(command, channel.host)
        },
      }),
      terminal: (error) => {
        admission.dispatch({ type: "terminal", error })
      },
    })
    let prepared = false
    let exchange: ReturnType<typeof createRequestPersistenceExchange>
    const observer: RendererRequestObserver = {
      admission() {},
      prepare() {
        prepared = true
      },
      persisted(value) {
        exchange.persisted(value)
      },
      failed(value) {
        exchange.failed(value)
      },
      progress() {},
      output() {},
      settlement() {},
      released() {},
      closeAcknowledged() {},
    }
    try {
      if (close) {
        renderer.bridge.onClose((request) => {
          exchange = createRequestPersistenceExchange(request)
          return observer
        })
        host.prepareClose(h.request, channel.host)
        renderer.close(channel.renderer)
      } else {
        exchange = createRequestPersistenceExchange(
          renderer.bridge.command("repo.clone", observer),
        )
      }
      await until(() => prepared)
      const result = await exchange!.commit(bundle)
      assert.deepEqual(writes, ["credentials", "preferences", "course"])
      assert.deepEqual(result, { course: { courseId: course.id, ...stamp } })
      assert.equal(
        admission.getSnapshot().phase,
        close ? "closing.preparing" : "preparing",
      )
    } finally {
      host.dispose()
      renderer.dispose()
      channel.dispose()
    }
  })
}

import { createRequestPersistenceExchange } from "../request-persistence-exchange"

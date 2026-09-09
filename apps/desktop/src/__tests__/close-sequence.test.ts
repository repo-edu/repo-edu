import assert from "node:assert/strict"
import { it } from "node:test"
import {
  deferred,
  makeCourse,
  makeSettings,
  resetStores,
  startController,
  waitForSnapshot,
  workflowClient,
} from "../../../../packages/renderer-app/src/__tests__/session-controller.test-support"
import { useCourseStore } from "../../../../packages/renderer-app/src/stores/course-store"
import { HostAdmission } from "../host-admission"
import { createHostRequestTransport } from "../host-request-transport"
import { createPreloadRequestTransport } from "../preload-request-transport"
import { commitRequestPersistence } from "../request-persistence"
import { requestChannel, until } from "./request-port-harness"

it("drains host calls before close transfer and queues persistence behind renderer publication", {
  timeout: 5000,
}, async () => {
  resetStores()
  const channel = requestChannel()
  const hostResult = deferred<void>()
  const publication = deferred<void>()
  const hostStarted = deferred<void>()
  const order: string[] = []
  const admission = new HostAdmission((effect) => {
    if (effect.type === "prepare-close") {
      order.push("transfer")
      host.prepareClose(effect.request, channel.host)
      renderer.close(channel.renderer)
    } else if (effect.type === "end-host") {
      order.push("end-host")
    }
  })
  const controller = startController({
    onBootstrapReady: async () => {
      admission.dispatch({ type: "bootstrap-acknowledged" })
    },
    workflowClient: workflowClient(async (id) => {
      if (id === "settings.loadApp")
        return makeSettings({
          activeSurface: { kind: "course", courseId: "course" },
        })
      if (id === "course.load") return makeCourse("course")
      const retire = admission.startWorkflow(id, { cancel() {} })
      hostStarted.resolve()
      await hostResult.promise
      retire()
      return []
    }),
  })
  const host = createHostRequestTransport({
    admission,
    receive(request, message) {
      if (message.type === "bundle") {
        order.push("bundle")
        void commitRequestPersistence({
          request,
          bundle: message.bundle,
          admission,
          transport: host,
          handlers: {
            "settings.savePreferences": async () => {},
            "settings.saveCredentials": async () => {},
            "course.save": async (course) => {
              assert.equal(course.displayName, "Dirty")
              return { revision: 5, updatedAt: "2026-09-07T12:00:00.000Z" }
            },
          },
        })
      } else if (message.type === "close-ready") {
        assert.equal(useCourseStore.getState().course?.revision, 5)
        order.push("ready")
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
      throw error
    },
  })
  renderer.bridge.onClose((request) => {
    const exchange = createRequestPersistenceExchange(request)
    const unexpected = () => {
      throw new Error("Unexpected command message")
    }
    return {
      admission: unexpected,
      prepare() {
        order.push("queued")
        void controller.requestClose(exchange.commit).then(
          () => request.readyToClose(),
          (error) => request.fail(String(error)),
        )
      },
      persisted: exchange.persisted,
      failed: exchange.failed,
      progress: unexpected,
      output: unexpected,
      settlement: unexpected,
      released: unexpected,
      closeAcknowledged() {
        order.push("acknowledged")
      },
    }
  })
  try {
    await waitForSnapshot(
      controller,
      (state) => state.bootstrap.status === "ready",
    )
    controller.setDisplayName("course", "Dirty")
    const earlier = controller.operations.execute(
      "course.list",
      async (scope) => {
        await scope.run("course.list", undefined)
        await publication.promise
        scope.publish(() => order.push("published"))
      },
    )
    await hostStarted.promise
    admission.dispatch({
      type: "host-start",
      source: "window-close",
      request: { cancel() {} },
    })
    assert.equal(admission.getSnapshot().phase, "closing.draining")
    assert.deepEqual(order, [])
    assert.throws(() => admission.startWorkflow("course.list", { cancel() {} }))
    hostResult.resolve()
    await until(() => order.includes("queued"))
    assert.deepEqual(order, ["transfer", "queued"])
    assert.equal(
      controller.operations.change(() => order.push("edit")),
      false,
    )
    publication.resolve()
    await earlier
    await until(() => order.includes("acknowledged"))
    assert.deepEqual(order, [
      "transfer",
      "queued",
      "published",
      "bundle",
      "ready",
      "end-host",
      "acknowledged",
    ])
    assert.equal(admission.getSnapshot().phase, "closing.ready")
    assert.equal(controller.operations.reserve("course.list"), null)
    assert.throws(() => admission.startWorkflow("course.list", { cancel() {} }))
  } finally {
    controller.dispose()
    renderer.dispose()
    host.dispose()
    channel.dispose()
  }
})

import { createRequestPersistenceExchange } from "../request-persistence-exchange"

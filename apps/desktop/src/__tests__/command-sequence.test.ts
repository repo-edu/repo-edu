import assert from "node:assert/strict"
import { it } from "node:test"
import type {
  ExclusiveRequestOperation,
  WorkflowHandlerMap,
} from "@repo-edu/application-contract"
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
import type { HostRequest } from "../host-admission-model"
import { executeHostCommand } from "../host-command-execution"
import { createHostRequestTransport } from "../host-request-transport"
import { createPreloadRequestTransport } from "../preload-request-transport"
import { createRendererCommandClient } from "../renderer-command-client"
import { commitRequestPersistence } from "../request-persistence"
import { requestChannel, until } from "./request-port-harness"

const target = {
  kind: "user-save-target-ref" as const,
  referenceId: "target",
  displayName: "students.csv",
  suggestedFormat: "csv" as const,
}

it("orders preparation, capture, running, publication, acknowledgement and release under one freeze", {
  timeout: 5000,
}, async () => {
  resetStores()
  const channel = requestChannel()
  const persistence = deferred<void>()
  const effect = deferred<void>()
  const callback = deferred<void>()
  const callbackFollowup = deferred<void>()
  const publication = deferred<void>()
  const published = deferred<void>()
  const order: string[] = []
  let releaseRequest: HostRequest | undefined
  let received: ExclusiveRequestOperation | undefined
  let latePublish: (() => void) | undefined
  const admission = new HostAdmission((event) => {
    order.push(event.type)
    if (event.type === "release-command") releaseRequest = event.request
  })
  const handlers = {
    "settings.savePreferences": async () => {},
    "settings.saveCredentials": async () => {},
    "course.save": async () => {
      order.push("persist")
      await persistence.promise
      return { revision: 4, updatedAt: "2026-09-07T12:00:00.000Z" }
    },
    "roster.exportMembers": async (input, options) => {
      order.push("handler")
      assert.equal(admission.getSnapshot().phase, "executing.running")
      assert.equal(input.course.revision, 4)
      assert.equal(input.course.displayName, "Dirty")
      options?.onProgress?.({ step: 1, totalSteps: 1, label: "Export" })
      options?.onOutput?.({ channel: "info", message: "Writing" })
      await effect.promise
      return { file: target }
    },
  } as WorkflowHandlerMap
  const host = createHostRequestTransport({
    admission,
    receive(request, message, signal) {
      if (message.type === "bundle") {
        void commitRequestPersistence({
          request,
          bundle: message.bundle,
          admission,
          handlers,
          transport: host,
        })
      } else if (message.type === "input") {
        received = message.input as ExclusiveRequestOperation
        void executeHostCommand({
          request,
          operation: received,
          signal: signal!,
          admission,
          handlers,
          transport: host,
        })
      } else if (message.type === "acknowledged") {
        order.push("acknowledged")
        admission.dispatch({ type: "settlement-acknowledged", request })
      }
    },
  })
  const preload = createPreloadRequestTransport({
    channel(command) {
      order.push("intent")
      return {
        renderer: channel.renderer,
        transfer: () => {
          host.acceptCommand(command, channel.host)
        },
      }
    },
    terminal(error) {
      throw error
    },
  })
  const controller = startController({
    commandClient: createRendererCommandClient(preload.bridge),
    workflowClient: workflowClient(async (id) => {
      if (id === "settings.loadApp")
        return makeSettings({
          activeSurface: { kind: "course", courseId: "course" },
        })
      if (id === "course.load") return makeCourse("course")
      throw new Error(`Unexpected ordinary workflow ${id}`)
    }),
    onBootstrapReady: async () => {
      admission.dispatch({ type: "bootstrap-acknowledged" })
    },
  })
  try {
    await waitForSnapshot(
      controller,
      (state) => state.bootstrap.status === "ready",
    )
    const staleCourse = useCourseStore.getState().course!
    controller.setDisplayName("course", "Dirty")
    const running = controller.operations.execute(
      "roster.exportMembers",
      async (scope) => {
        latePublish = () => scope.publish(() => order.push("late publication"))
        const result = await scope.run(
          "roster.exportMembers",
          { course: staleCourse, target, format: "csv" },
          {
            onProgress: async () => {
              await callback.promise
              order.push("progress-applied")
              void scope.follow(async () => {
                await callbackFollowup.promise
                scope.publish(() => order.push("callback follow-up"))
              })
            },
            onOutput: () => {
              order.push("output-applied")
            },
          },
        )
        assert.deepEqual(result, { file: target })
        await publication.promise
        scope.publish(() => order.push("published"))
        published.resolve()
      },
    )
    assert.equal(
      controller.operations.change(() => order.push("edit")),
      false,
    )
    assert.equal(controller.operations.reserve("course.list"), null)
    await until(() => order.includes("persist"))
    assert.equal(received, undefined)
    assert.equal(order.includes("handler"), false)
    assert.throws(() => admission.startWorkflow("course.list", { cancel() {} }))
    persistence.resolve()
    await until(() => order.includes("handler"))
    assert.equal(staleCourse.revision, 0)
    assert.equal(useCourseStore.getState().course?.revision, 4)
    effect.resolve()
    await until(() => admission.getSnapshot().phase === "executing.settling")
    const state = admission.getSnapshot()
    assert.equal(state.phase, "executing.settling")
    if (state.phase !== "executing.settling")
      throw new Error("No official result")
    assert.deepEqual(state.completion?.outcome, {
      disposition: "completed",
      completion: { status: "succeeded", result: { file: target } },
    })
    publication.resolve()
    await published.promise
    assert.equal(releaseRequest, undefined)
    callback.resolve()
    await until(() => order.includes("progress-applied"))
    assert.equal(releaseRequest, undefined)
    callbackFollowup.resolve()
    await until(() => releaseRequest !== undefined)
    assert.throws(() => latePublish?.(), /retired/)
    assert.equal(
      controller.operations.change(() => order.push("early edit")),
      false,
    )
    assert.equal(controller.operations.reserve("course.list"), null)
    assert.equal(controller.getSnapshot().transactions.admitted.size, 1)
    host.release(releaseRequest!)
    await running
    assert.equal(controller.getSnapshot().transactions.admitted.size, 0)
    assert.equal(
      controller.operations.change(() => order.push("edit")),
      true,
    )
    assert.ok(order.indexOf("published") < order.indexOf("acknowledged"))
    assert.ok(order.indexOf("progress-applied") < order.indexOf("acknowledged"))
    assert.equal(admission.getSnapshot().phase, "interactive")
  } finally {
    controller.dispose()
    preload.dispose()
    host.dispose()
    channel.dispose()
  }
})

it("does not create an intent when a reserved picker is cancelled", async () => {
  const client = createRendererCommandClient({
    command() {
      throw new Error("Unexpected intent")
    },
    onClose: () => () => {},
  })
  let settled = false
  assert.equal(
    await client.runBody(
      "roster.exportMembers",
      async () => {
        throw new Error("Unexpected preparation")
      },
      async () => "cancelled picker",
      async () => {
        settled = true
      },
    ),
    "cancelled picker",
  )
  assert.equal(settled, true)
})

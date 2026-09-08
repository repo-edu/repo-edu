import assert from "node:assert/strict"
import { it } from "node:test"
import {
  CommandOutcomeError,
  type WorkflowHandlerMap,
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
import { assertCommandFreeze } from "./command-freeze-assertions"
import { requestChannel, until } from "./request-port-harness"

for (const reason of ["confirmation-expired", "proof-lost"] as const) {
  it(`${reason} ${reason === "confirmation-expired" ? "retires unknown before the next session operation" : "ends admission without settlement"}`, {
    timeout: 5000,
  }, async () => {
    resetStores()
    const channel = requestChannel()
    const effect = deferred<void>()
    const publication = deferred<void>()
    const order: string[] = []
    let release: HostRequest | undefined
    let starts = 0
    let writes = 0
    let endings = 0
    const outcome = {
      disposition: "uncertain" as const,
      reason,
      message: "Outside outcome unknown.",
    }
    const stamp = { revision: 7, updatedAt: "2026-09-08T12:00:00.000Z" }
    const admission = new HostAdmission((event) => {
      if (event.type === "release-command") release = event.request
      if (event.type === "end-host") {
        endings += 1
        host.dispose()
      }
    })
    const handlers = {
      "course.save": async (course) => {
        writes += 1
        assert.equal(course.displayName, "Dirty")
        order.push("preparation commit")
        return stamp
      },
      "gitUsernames.import": async ({ course }) => {
        starts += 1
        assert.equal(course.revision, stamp.revision)
        assert.equal(course.displayName, "Dirty")
        order.push("execution")
        await effect.promise
        throw new CommandOutcomeError(outcome)
      },
    } as WorkflowHandlerMap
    const host = createHostRequestTransport({
      admission,
      receive(request, message) {
        if (message.type === "bundle")
          void commitRequestPersistence({
            request,
            bundle: message.bundle,
            admission,
            handlers,
            transport: host,
          })
        if (message.type === "input")
          void executeHostCommand({
            request,
            operation: message.operation,
            signal: message.signal,
            admission,
            handlers,
            transport: host,
          })
        if (message.type === "acknowledged") {
          order.push("acknowledgement")
          admission.dispatch({ type: "settlement-acknowledged", request })
        }
      },
    })
    const preload = createPreloadRequestTransport({
      channel(command) {
        return {
          renderer: channel.renderer,
          transfer() {
            host.acceptCommand(command, channel.host)
          },
        }
      },
      terminal(error) {
        admission.terminal(error)
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
        assert.equal(
          id,
          "course.list",
          "No command, save or settlement read may bypass its port",
        )
        const settled = admission.startWorkflow(id, { cancel() {} })
        try {
          order.push("next host call")
          return []
        } finally {
          settled()
        }
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
      controller.setDisplayName("course", "Dirty")
      const loaded = useCourseStore.getState().course
      assert.ok(loaded)
      const before = structuredClone(loaded)
      let late: (() => void) | undefined
      const running = controller.operations.execute(
        "gitUsernames.import",
        async (scope) => {
          late = () => scope.publish(() => assert.fail("Late publication"))
          try {
            await scope.run("gitUsernames.import", {
              course: before,
              credentials: controller.getSnapshot().settings.credentials,
              file: {
                kind: "user-file-ref",
                referenceId: "file",
                displayName: "users.csv",
                mediaType: "text/csv",
                byteLength: 0,
              },
            })
            assert.fail("Unknown cannot become success")
          } catch (error) {
            if (reason === "confirmation-expired") {
              assert.ok(error instanceof CommandOutcomeError)
              assert.deepEqual(error.outcome, outcome)
              scope.publish(() => order.push("unknown presented"))
              await publication.promise
            }
            throw error
          }
        },
      )
      const rejected = assert.rejects(running)
      await until(() => starts === 1)
      await assertCommandFreeze(controller)
      effect.resolve()
      if (reason === "confirmation-expired") {
        await until(() => order.includes("unknown presented"))
        assert.deepEqual(useCourseStore.getState().course, {
          ...before,
          ...stamp,
        })
        await assertCommandFreeze(controller)
        assert.equal(release, undefined)
        publication.resolve()
        const releasing = await until(() => release)
        await assertCommandFreeze(controller)
        assert.throws(() => late?.(), /retired/)
        assert.equal(controller.getSnapshot().transactions.admitted.size, 1)
        order.push("host release")
        host.release(releasing)
        await rejected
        order.push("retirement")
        assert.equal(controller.getSnapshot().transactions.admitted.size, 0)
        await controller.operations.execute("course.list", async (scope) => {
          await scope.run("course.list", undefined)
          scope.publish(() => order.push("next publication"))
        })
        await controller.flush()
        assert.deepEqual(order, [
          "preparation commit",
          "execution",
          "unknown presented",
          "acknowledgement",
          "host release",
          "retirement",
          "next host call",
          "next publication",
        ])
        assert.equal(admission.getSnapshot().phase, "interactive")
        assert.equal(endings, 0)
      } else {
        await until(() => admission.getSnapshot().phase === "terminal")
        await rejected
        assert.equal(release, undefined)
        assert.equal(endings, 1)
        assert.deepEqual(order, ["preparation commit", "execution"])
        assert.throws(() =>
          admission.startWorkflow("course.list", { cancel() {} }),
        )
      }
      assert.equal(starts, 1, "The unknown action is never retried")
      assert.equal(
        writes,
        1,
        "Only preparation was saved, with no invented course result",
      )
    } finally {
      controller.dispose()
      preload.dispose()
      host.dispose()
      channel.dispose()
    }
  })
}

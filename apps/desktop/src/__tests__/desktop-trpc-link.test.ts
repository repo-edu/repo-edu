import assert from "node:assert/strict"
import { it } from "node:test"
import {
  HostAdmissionRefusedError,
  type WorkflowClient,
  type WorkflowId,
} from "@repo-edu/application-contract"
import { createTRPCClient } from "@trpc/client"
import type { TRPCResponseMessage } from "@trpc/server/rpc"
import { course } from "../../../../packages/application-contract/src/__tests__/workflow-input-fixtures"
import {
  makeSettings,
  resetStores,
  startController,
} from "../../../../packages/renderer-app/src/__tests__/session-controller.test-support"
import { createRendererQueryClient } from "../../../../packages/renderer-app/src/analysis/analysis-query-client"
import { scopedSessionQueryOptions } from "../../../../packages/renderer-app/src/session/session-query"
import { desktopTrpcLink } from "../desktop-trpc-link"
import type { DesktopTrpcBridge } from "../desktop-wire"
import { acceptedHostCallCount } from "../host-admission-model"
import type { DesktopRouter } from "../trpc"
import { runSubscriptionFromFactory } from "../workflow-client"
import { flushTransport, transportHarness } from "./desktop-transport-harness"

function loopback(handler: Parameters<typeof transportHarness>[0]) {
  const h = transportHarness(handler)
  const listeners = new Set<(message: TRPCResponseMessage) => void>()
  const bridge: DesktopTrpcBridge = {
    send(message) {
      h.receive(structuredClone({ kind: "trpc", message }))
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
  h.contents.send = (_channel, message) => {
    h.responses.push(message)
    queueMicrotask(() => {
      for (const listener of listeners) listener(structuredClone(message))
    })
    return h.responses.length
  }
  return {
    ...h,
    listeners,
    client: createTRPCClient<DesktopRouter>({
      links: [desktopTrpcLink(bridge)],
    }),
  }
}

it("delivers progress, streamed output and completion through public tRPC client semantics", async () => {
  const h = loopback(async (_input, options) => {
    options?.onProgress?.({ step: 1, totalSteps: 2, label: "Reading" })
    options?.onOutput?.({ channel: "info", message: "Loaded course" })
    return course
  })
  h.admission.dispatch({ type: "bootstrap-acknowledged" })
  const events: unknown[] = []
  const done = Promise.withResolvers<void>()
  h.client["course.load"].subscribe(
    { courseId: course.id },
    {
      onData(event) {
        events.push(event)
      },
      onError: done.reject,
      onComplete: done.resolve,
    },
  )
  await done.promise
  assert.deepEqual(
    events.map((event) => (event as { type: string }).type),
    ["progress", "output", "completed"],
  )
  assert.equal(h.listeners.size, 0)
  assert.equal(acceptedHostCallCount(h.admission.getSnapshot()), 0)
})

it("isolates concurrent call responses and removes each listener on completion", async () => {
  const first = Promise.withResolvers<undefined>()
  const second = Promise.withResolvers<undefined>()
  let starts = 0
  const h = loopback(async () =>
    ++starts === 1 ? first.promise : second.promise,
  )
  h.admission.dispatch({ type: "bootstrap-acknowledged" })
  const ended: number[] = []
  for (const id of [1, 2]) {
    h.client["course.list"].subscribe(undefined, {
      onComplete() {
        ended.push(id)
      },
    })
  }
  await flushTransport()
  assert.equal(h.listeners.size, 2)
  second.resolve(undefined)
  await flushTransport()
  assert.deepEqual(ended, [2])
  assert.equal(h.listeners.size, 1)
  first.resolve(undefined)
  await flushTransport()
  assert.deepEqual(ended, [2, 1])
  assert.equal(h.listeners.size, 0)
})

it("preserves admission refusal through the workflow client and cleans up its listener", async () => {
  const h = loopback(async () => {
    assert.fail("Refused workflow started")
  })
  await assert.rejects(
    runSubscriptionFromFactory<"course.list">((handlers) =>
      h.client["course.list"].subscribe(undefined, handlers),
    ),
    HostAdmissionRefusedError,
  )
  assert.equal(h.listeners.size, 0)
  assert.equal(h.admission.getSnapshot().phase, "starting")
})

it("sends an immediate unsubscribe to the accepted call before its handler starts", async () => {
  let starts = 0
  const h = loopback(async () => {
    starts++
  })
  h.admission.dispatch({ type: "bootstrap-acknowledged" })
  const subscription = h.client["course.list"].subscribe(undefined, {})
  subscription.unsubscribe()
  subscription.unsubscribe()
  await flushTransport()
  assert.equal(starts, 0)
  assert.equal(h.listeners.size, 0)
  assert.equal(acceptedHostCallCount(h.admission.getSnapshot()), 0)
})

it("completes an aborted call after retiring admission even before its handler starts", async () => {
  const h = loopback(async () => assert.fail("Cancelled workflow started"))
  h.admission.dispatch({ type: "bootstrap-acknowledged" })
  const controller = new AbortController()
  const running = runSubscriptionFromFactory<"course.list">(
    (handlers) => h.client["course.list"].subscribe(undefined, handlers),
    { signal: controller.signal },
  )
  controller.abort()
  await assert.rejects(running, { type: "cancelled" })
  assert.equal(acceptedHostCallCount(h.admission.getSnapshot()), 0)
  assert.equal(h.listeners.size, 0)
})

for (const outcome of ["resolve", "reject"] as const) {
  it(`holds a queued command until the cancelled host handler settles by ${outcome}`, {
    timeout: 3000,
  }, async (t) => {
    resetStores()
    const entered = Promise.withResolvers<AbortSignal>()
    const release = Promise.withResolvers<void>()
    t.after(() => release.resolve())
    const h = loopback(async (_input, options) => {
      assert.ok(options?.signal)
      entered.resolve(options.signal)
      await release.promise
      if (outcome === "reject") throw new Error("Cancelled host work ended")
      return "head"
    })
    h.admission.dispatch({ type: "bootstrap-acknowledged" })
    const controller = startController({
      workflowClient: {
        async run(
          id: WorkflowId,
          _input: unknown,
          options?: { signal?: AbortSignal },
        ) {
          if (id === "settings.loadApp") return makeSettings()
          assert.equal(id, "analysis.resolveSnapshotHead")
          return await runSubscriptionFromFactory<"analysis.resolveSnapshotHead">(
            (handlers) =>
              h.client["analysis.resolveSnapshotHead"].subscribe(
                { repositoryAbsolutePath: "/repos/one" },
                handlers,
              ),
            options,
          )
        },
      } as WorkflowClient,
    })
    const queryClient = createRendererQueryClient()
    t.after(() => {
      controller.dispose()
      queryClient.clear()
    })
    await controller.waitForIdle()
    const abort = new AbortController()
    const running = controller.operations
      .execute("analysis.resolveSnapshotHead", async (scope) => {
        return await queryClient.fetchQuery({
          queryKey: ["snapshot"],
          ...scopedSessionQueryOptions(scope, abort.signal, (signal) =>
            scope.run(
              "analysis.resolveSnapshotHead",
              { repositoryAbsolutePath: "/repos/one" },
              { signal },
            ),
          ),
        })
      })
      .catch(() => {})
    const hostSignal = await entered.promise
    let commandStarted = false
    const command = controller.operations.execute("repo.clone", async () => {
      commandStarted = true
      assert.equal(acceptedHostCallCount(h.admission.getSnapshot()), 0)
      assert.equal(
        h.admission.dispatch({
          type: "exclusive-intent",
          command: "repo.clone",
          request: { cancel() {} },
        }),
        "accepted",
      )
    })
    abort.abort()
    await queryClient.cancelQueries({ queryKey: ["snapshot"] })
    await flushTransport()
    assert.equal(hostSignal.aborted, true)
    assert.equal(commandStarted, false)
    assert.equal(acceptedHostCallCount(h.admission.getSnapshot()), 1)
    assert.equal(h.listeners.size, 1)
    assert.equal(
      h.responses.some(
        (message) => "result" in message && message.result.type === "stopped",
      ),
      false,
    )
    release.resolve()
    await Promise.all([running, command])
    assert.equal(commandStarted, true)
    assert.equal(queryClient.getQueryData(["snapshot"]), undefined)
    assert.equal(h.listeners.size, 0)
  })
}

it("enters terminal when response delivery fails before starting a workflow", async () => {
  let starts = 0
  const h = transportHarness(async () => {
    starts++
  })
  h.admission.dispatch({ type: "bootstrap-acknowledged" })
  h.contents.send = () => {
    throw new Error("Renderer transport lost")
  }
  h.receive({
    kind: "trpc",
    message: {
      id: 1,
      method: "subscription",
      params: { path: "course.list", input: undefined },
    },
  })
  await flushTransport()
  assert.equal(starts, 0)
  assert.equal(h.admission.getSnapshot().phase, "terminal")
  assert.equal(
    h.effects.filter((effect) => effect.type === "end-host").length,
    1,
  )
})

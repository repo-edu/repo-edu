import assert from "node:assert/strict"
import { it } from "node:test"
import { createTRPCClient } from "@trpc/client"
import type { TRPCResponseMessage } from "@trpc/server/rpc"
import { course } from "../../../../packages/application-contract/src/__tests__/workflow-input-fixtures"
import { desktopTrpcLink } from "../desktop-trpc-link"
import type { DesktopTrpcBridge } from "../desktop-wire"
import { acceptedHostCallCount } from "../host-admission-model"
import type { DesktopRouter } from "../trpc"
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

it("delivers admission refusal as a tRPC error and cleans up its listener", async () => {
  const h = loopback(async () => {
    assert.fail("Refused workflow started")
  })
  const failed = Promise.withResolvers<Error>()
  h.client["course.list"].subscribe(undefined, { onError: failed.resolve })
  const error = await failed.promise
  assert.match(error.message, /not accepting/)
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

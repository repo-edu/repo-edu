import assert from "node:assert/strict"
import { it } from "node:test"
import { acceptedHostCallCount } from "../host-admission-model"
import {
  flushTransport,
  startMessage,
  stopMessage,
  transportHarness,
} from "./desktop-transport-harness"

it("admits startup synchronously and settles before publishing its result", async () => {
  const h = transportHarness(async () => undefined)
  h.receive(startMessage("settings.loadApp", undefined))
  assert.equal(acceptedHostCallCount(h.admission.getSnapshot()), 1)
  await flushTransport()
  assert.equal(acceptedHostCallCount(h.admission.getSnapshot()), 0)
  assert.equal(h.responses.length, 3)
  assert.equal(
    h.admission.dispatch({ type: "bootstrap-acknowledged" }),
    "accepted",
  )
})

it("keeps a stopped accepted call in the drain until its handler settles", async () => {
  const body = Promise.withResolvers<undefined>()
  let signal: AbortSignal | undefined
  const h = transportHarness(async (_input, options) => {
    signal = options?.signal
    return await body.promise
  })
  h.admission.dispatch({ type: "bootstrap-acknowledged" })
  h.receive(startMessage("course.list", undefined))
  await flushTransport()
  h.admission.dispatch({
    type: "host-start",
    source: "window-close",
    request: { cancel() {} },
  })
  h.receive(stopMessage())
  h.receive(stopMessage())
  assert.equal(signal?.aborted, true)
  assert.equal(acceptedHostCallCount(h.admission.getSnapshot()), 1)
  assert.deepEqual(h.effects, [])
  body.resolve(undefined)
  await flushTransport()
  assert.equal(h.admission.getSnapshot().phase, "closing.preparing")
  assert.equal(h.effects.length, 1)
  assert.equal(h.effects[0]?.type, "prepare-close")
  assert.deepEqual(
    h.responses.map((response) => "result" in response && response.result.type),
    ["started", "stopped"],
  )
})

it("installs call identity before asynchronous dispatch so immediate stop prevents the handler", async () => {
  let starts = 0
  const h = transportHarness(async () => {
    starts++
  })
  h.admission.dispatch({ type: "bootstrap-acknowledged" })
  h.receive(startMessage("course.list", undefined))
  h.receive(stopMessage())
  h.receive(stopMessage())
  await flushTransport()
  h.receive(stopMessage())
  h.receive(stopMessage(999))
  assert.equal(starts, 0)
  assert.equal(acceptedHostCallCount(h.admission.getSnapshot()), 0)
  assert.deepEqual(h.responses, [{ id: 1, result: { type: "stopped" } }])
  assert.equal(h.admission.getSnapshot().phase, "interactive")
})

for (const synchronous of [true, false]) {
  it(`settles ${synchronous ? "synchronous" : "asynchronous"} handler failures exactly once`, async () => {
    const h = transportHarness(() => {
      if (synchronous) throw new Error("handler failed")
      return Promise.reject(new Error("handler failed"))
    })
    h.admission.dispatch({ type: "bootstrap-acknowledged" })
    h.receive(startMessage("course.list", undefined))
    await flushTransport()
    h.receive(stopMessage())
    assert.equal(acceptedHostCallCount(h.admission.getSnapshot()), 0)
    assert.equal(h.admission.getSnapshot().phase, "interactive")
    assert.equal(h.responses.length, synchronous ? 2 : 3)
  })
}

it("rejects duplicate active identities before a second admission or handler", async () => {
  const h = transportHarness(async () => undefined)
  h.admission.dispatch({ type: "bootstrap-acknowledged" })
  h.receive(startMessage("course.list", undefined))
  h.receive(startMessage("course.list", undefined))
  await flushTransport()
  assert.equal(h.admission.getSnapshot().phase, "terminal")
  assert.equal(
    h.effects.filter((effect) => effect.type === "end-host").length,
    1,
  )
  assert.deepEqual(h.responses, [])
})

import assert from "node:assert/strict"
import { it } from "node:test"
import {
  type WorkflowHandlerMap,
  type WorkflowId,
  workflowCatalog,
} from "@repo-edu/application-contract"
import { HostAdmission } from "../host-admission"
import {
  acceptedHostCallCount,
  type HostAdmissionEffect,
} from "../host-admission-model"
import { createDesktopWorkflowRouter } from "../trpc"

function harness(
  handler: (workflow: WorkflowId, signal?: AbortSignal) => Promise<unknown>,
) {
  const effects: HostAdmissionEffect[] = []
  const admission = new HostAdmission((effect) => effects.push(effect))
  const registry = Object.fromEntries(
    Object.keys(workflowCatalog).map((id) => [
      id,
      (_input: unknown, options?: { signal?: AbortSignal }) =>
        handler(id as WorkflowId, options?.signal),
    ]),
  ) as WorkflowHandlerMap
  const caller = createDesktopWorkflowRouter(registry, admission).createCaller(
    {},
  )
  return { admission, caller, effects }
}

it("settles host startup before publishing its terminal tRPC result", async () => {
  const { admission, caller } = harness(async () => undefined)
  const stream = await caller["settings.loadApp"](undefined)
  const done = Promise.withResolvers<void>()
  stream.subscribe({
    next() {
      assert.equal(acceptedHostCallCount(admission.getSnapshot()), 0)
      assert.equal(
        admission.dispatch({ type: "bootstrap-acknowledged" }),
        "accepted",
      )
    },
    complete: done.resolve,
    error: done.reject,
  })
  await done.promise
  assert.equal(admission.getSnapshot().phase, "interactive")
})

it("keeps a stopped accepted call in the drain until its handler settles", async () => {
  const body = Promise.withResolvers<unknown>()
  let signal: AbortSignal | undefined
  const { admission, caller, effects } = harness(
    async (_id, receivedSignal) => {
      signal = receivedSignal
      return await body.promise
    },
  )
  admission.dispatch({ type: "bootstrap-acknowledged" })
  const stream = await caller["course.list"](undefined)
  const subscription = stream.subscribe({
    next: () => assert.fail("Stopped stream published a result"),
  })
  assert.equal(acceptedHostCallCount(admission.getSnapshot()), 1)
  admission.dispatch({
    type: "host-start",
    source: "window-close",
    request: { cancel() {} },
  })
  subscription.unsubscribe()
  subscription.unsubscribe()
  assert.equal(signal?.aborted, true)
  assert.equal(acceptedHostCallCount(admission.getSnapshot()), 1)
  assert.deepEqual(effects, [])
  body.resolve([])
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(admission.getSnapshot().phase, "closing.preparing")
  assert.equal(effects.length, 1)
  assert.equal(effects[0]?.type, "prepare-close")
})

it("refuses exclusive and cancellation workflows on the ordinary transport before handlers", async () => {
  let starts = 0
  const { admission, caller } = harness(async () => {
    starts++
  })
  admission.dispatch({ type: "bootstrap-acknowledged" })
  for (const id of ["repo.clone", "examination.stopGeneration"]) {
    const stream = await caller[id](undefined)
    assert.throws(() => stream.subscribe({}), /not accepting/)
  }
  assert.equal(starts, 0)
  assert.equal(acceptedHostCallCount(admission.getSnapshot()), 0)
})

it("settles synchronous setup failures before propagating them", async () => {
  const { admission, caller } = harness(() => {
    throw new Error("setup failed")
  })
  admission.dispatch({ type: "bootstrap-acknowledged" })
  const stream = await caller["course.list"](undefined)
  assert.throws(() => stream.subscribe({}), /setup failed/)
  assert.equal(acceptedHostCallCount(admission.getSnapshot()), 0)
  assert.equal(admission.getSnapshot().phase, "interactive")
})

it("settles rejected handlers exactly once through result and cleanup", async () => {
  const { admission, caller } = harness(async () => {
    throw new Error("handler failed")
  })
  admission.dispatch({ type: "bootstrap-acknowledged" })
  const stream = await caller["course.list"](undefined)
  const done = Promise.withResolvers<void>()
  const subscription = stream.subscribe({
    complete: done.resolve,
    error: done.reject,
  })
  await done.promise
  subscription.unsubscribe()
  subscription.unsubscribe()
  assert.equal(acceptedHostCallCount(admission.getSnapshot()), 0)
  assert.equal(admission.getSnapshot().phase, "interactive")
})

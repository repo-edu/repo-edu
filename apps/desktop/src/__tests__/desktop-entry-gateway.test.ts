import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { WorkflowId } from "@repo-edu/application-contract"
import { workflowInputSchemas } from "@repo-edu/application-contract"
import { workflowInputs } from "../../../../packages/application-contract/src/__tests__/workflow-input-fixtures"
import { desktopWorkflowStarts } from "../host-entry-inventory"
import {
  flushTransport,
  startMessage,
  stopMessage,
  transportHarness,
} from "./desktop-transport-harness"

describe("gateway workflow inputs", () => {
  for (const path of Object.keys(workflowInputSchemas) as WorkflowId[]) {
    it(`${path} validates its complete structured-clone input before admission`, async () => {
      const inputs: unknown[] = []
      const h = transportHarness(async (input) => {
        inputs.push(input)
      })
      if (desktopWorkflowStarts[path] !== "startup")
        h.admission.dispatch({ type: "bootstrap-acknowledged" })
      h.receive(structuredClone(startMessage(path, workflowInputs[path])))
      await flushTransport()
      const classification = desktopWorkflowStarts[path]
      if (classification === "exclusive" || classification === "cancellation") {
        assert.deepEqual(inputs, [])
        assert.ok(h.responses.some((response) => "error" in response))
      } else {
        assert.deepEqual(inputs, [
          workflowInputSchemas[path].parse(workflowInputs[path]),
        ])
      }
      assert.notEqual(h.admission.getSnapshot().phase, "terminal")
    })
    it(`${path} rejects malformed input before any transport result`, async () => {
      let starts = 0
      const h = transportHarness(async () => {
        starts++
      })
      h.receive(startMessage(path, null))
      await flushTransport()
      assert.equal(starts, 0)
      assert.deepEqual(h.responses, [])
      assert.equal(h.admission.getSnapshot().phase, "terminal")
      assert.equal(h.effects.length, 1)
    })
  }
})

it("validates sender authority before reading any envelope property", () => {
  const h = transportHarness(async () => undefined)
  const raw = new Proxy(
    {},
    {
      get() {
        assert.fail("Read a foreign message")
      },
    },
  )
  h.receive(raw, { ...h.event, sender: {} } as typeof h.event)
  assert.equal(h.admission.getSnapshot().phase, "terminal")
  assert.deepEqual(h.responses, [])
})

it("refuses child, absent, stale and wrong-URL frames for starts and stops", () => {
  for (const frame of [
    null,
    {},
    { parent: {}, url: "file:///app/index.html" },
  ]) {
    for (const message of [
      startMessage("course.list", undefined),
      stopMessage(),
    ]) {
      const h = transportHarness(async () => undefined)
      h.receive(message, { ...h.event, senderFrame: frame } as typeof h.event)
      assert.equal(h.admission.getSnapshot().phase, "terminal")
      assert.deepEqual(h.responses, [])
    }
  }
  const h = transportHarness(async () => undefined)
  h.contents.mainFrame.url = "https://foreign.test/"
  h.receive(stopMessage())
  assert.equal(h.admission.getSnapshot().phase, "terminal")
})

it("rejects complete-envelope violations before identity cleanup", () => {
  const malformed = [
    null,
    [],
    {},
    { kind: "unknown" },
    { ...stopMessage(), extra: true },
    {
      kind: "trpc",
      message: { id: 1, method: "subscription.stop", params: {} },
    },
    { kind: "trpc", message: { id: "1", method: "subscription.stop" } },
    { kind: "trpc", message: { id: NaN, method: "subscription.stop" } },
    { kind: "trpc", message: { id: 1.5, method: "subscription.stop" } },
    {
      kind: "trpc",
      message: { id: 1, method: "query", params: { path: "course.list" } },
    },
    startMessage("not-a-workflow", undefined),
    {
      kind: "trpc",
      message: {
        id: 1,
        method: "subscription",
        params: { path: "course.list", input: undefined, extra: true },
      },
    },
  ]
  for (const raw of malformed) {
    const h = transportHarness(async () => undefined)
    h.receive(raw)
    h.receive(raw)
    assert.equal(h.admission.getSnapshot().phase, "terminal")
    assert.equal(h.effects.length, 1)
    assert.deepEqual(h.responses, [])
  }
})

it("validates direct actions through the same sender proof and rejects unknown actions", () => {
  const h = transportHarness(async () => undefined)
  h.invoke({ action: "setNativeTheme", input: "dark" })
  assert.deepEqual(h.direct, [{ action: "setNativeTheme", input: "dark" }])
  h.invoke({ action: "setNativeTheme", input: "other" })
  assert.equal(h.admission.getSnapshot().phase, "terminal")
  assert.equal(h.direct.length, 1)
  const other = transportHarness(async () => undefined)
  other.invoke({ action: "unknown" })
  assert.equal(other.admission.getSnapshot().phase, "terminal")
  assert.deepEqual(other.direct, [])
})

it("removes its raw registrations on disposal", () => {
  const h = transportHarness(async () => undefined)
  h.gateway.dispose()
  h.gateway.dispose()
  assert.equal(h.listeners.size, 0)
  assert.equal(h.handlers.size, 0)
})

it("rejects destroyed and detached current frames for direct and tRPC messages", () => {
  for (const destroyed of [false, true]) {
    const h = transportHarness(async () => undefined)
    h.contents.mainFrame.detached = !destroyed
    h.contents.mainFrame.isDestroyed = () => destroyed
    h.invoke({ action: "bootstrapReady" })
    h.receive(stopMessage())
    assert.equal(h.admission.getSnapshot().phase, "terminal")
    assert.equal(h.effects.length, 1)
    assert.deepEqual(h.direct, [])
    assert.deepEqual(h.responses, [])
  }
})

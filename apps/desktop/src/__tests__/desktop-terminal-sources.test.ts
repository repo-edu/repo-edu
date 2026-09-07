import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import { it } from "node:test"
import type { Details, WebContents } from "electron"
import { workflowInputs } from "../../../../packages/application-contract/src/__tests__/workflow-input-fixtures"
import { installDesktopTerminalSources } from "../desktop-terminal-sources"
import { HostAdmission } from "../host-admission"
import type {
  HostAdmissionEffect,
  HostAdmissionEvent,
} from "../host-admission-model"
import { createHostRequestTransport } from "../host-request-transport"
import {
  flushTransport,
  observeTerminalEnding,
  startMessage,
  transportHarness,
} from "./desktop-transport-harness"
import { requestChannel, until } from "./request-port-harness"

// Exhaustive against the installed Electron contract, with future values added below.
const childTypes: Record<Details["type"], true> = {
  Utility: true,
  Zygote: true,
  "Sandbox helper": true,
  GPU: true,
  "Pepper Plugin": true,
  "Pepper Plugin Broker": true,
  Unknown: true,
}
const reasons: Record<Details["reason"], true> = {
  "clean-exit": true,
  "abnormal-exit": true,
  killed: true,
  crashed: true,
  oom: true,
  "launch-failed": true,
  "integrity-failure": true,
  "memory-eviction": true,
}

function recordTerminalEvents(admission: HostAdmission) {
  const events: HostAdmissionEvent[] = []
  const dispatch = admission.dispatch.bind(admission)
  admission.dispatch = (event) => {
    if (event.type === "terminal") events.push(event)
    return dispatch(event)
  }
  return events
}

function sourceHarness() {
  const app = new EventEmitter()
  const process = new EventEmitter()
  const renderer = new EventEmitter()
  const effects: HostAdmissionEffect[] = []
  const terminalTrace: string[] = []
  const admission = new HostAdmission((effect) => {
    effects.push(effect)
    void observeTerminalEnding(effect, admission.getSnapshot, terminalTrace)
  })
  const events = recordTerminalEvents(admission)
  const sources = installDesktopTerminalSources({
    app,
    process,
    terminal: admission.terminal,
  })
  sources.observeRenderer(renderer as unknown as WebContents)
  return { app, process, renderer, admission, events, effects, terminalTrace }
}

for (const type of [...Object.keys(childTypes), "Future child"]) {
  for (const reason of [...Object.keys(reasons), "future-reason"]) {
    it(`classifies child loss ${type}/${reason} before reducer dispatch and ending`, async () => {
      const h = sourceHarness()
      h.app.emit(
        "child-process-gone",
        {},
        { type, reason, exitCode: 0, name: "child", serviceName: "service" },
      )
      if (reason === "clean-exit") {
        assert.deepEqual(h.events, [])
        assert.deepEqual(h.effects, [])
        assert.equal(h.admission.getSnapshot().phase, "starting")
      } else {
        assert.equal(h.events.length, 1)
        const event = h.events[0]
        assert.equal(event.type, "terminal")
        assert.deepEqual(Object.keys(event).sort(), ["error", "type"])
        assert.ok(event.error instanceof Error)
        assert.deepEqual(Object.keys(event.error), [])
        assert.equal(event.error.cause, undefined)
        assert.deepEqual(h.effects, [{ type: "end-host", reason: "failure" }])
      }
      await flushTransport()
      assert.deepEqual(
        h.terminalTrace,
        reason === "clean-exit"
          ? []
          : ["disable", "stop", "close-storage", "exit:1"],
      )
    })
  }
}

for (const reason of [...Object.keys(reasons), "future-reason"]) {
  it(`always reports session renderer loss: ${reason}`, async () => {
    const h = sourceHarness()
    h.renderer.emit("render-process-gone", {}, { reason, exitCode: 0 })
    assert.equal(h.events.length, 1)
    assert.equal(h.events[0].type, "terminal")
    assert.deepEqual(h.effects, [{ type: "end-host", reason: "failure" }])
    await flushTransport()
    assert.deepEqual(h.terminalTrace, [
      "disable",
      "stop",
      "close-storage",
      "exit:1",
    ])
  })
}

it("reports arbitrary rejection reasons and coalesces cascading sources through reducer state", async () => {
  for (const reason of [new Error("rejected"), "rejected", undefined]) {
    const h = sourceHarness()
    h.process.emit("unhandledRejection", reason, Promise.resolve())
    h.renderer.emit("render-process-gone", {}, { reason: "crashed" })
    h.app.emit("child-process-gone", {}, { type: "GPU", reason: "killed" })
    assert.deepEqual(h.events, [{ type: "terminal", error: reason }])
    assert.deepEqual(h.effects, [{ type: "end-host", reason: "failure" }])
    await flushTransport()
    assert.deepEqual(h.terminalTrace, [
      "disable",
      "stop",
      "close-storage",
      "exit:1",
    ])
  }
})

for (const [name, trigger] of Object.entries({
  "foreign gateway sender": (h: ReturnType<typeof transportHarness>) =>
    h.receive({}, { ...h.event, sender: {} } as typeof h.event),
  "malformed gateway message": (h: ReturnType<typeof transportHarness>) =>
    h.receive(null),
  "unknown gateway action": (h: ReturnType<typeof transportHarness>) =>
    h.invoke({ action: "unknown" }),
  "renderer navigation": (h: ReturnType<typeof transportHarness>) =>
    h.contents.emit("will-navigate", { preventDefault() {} }),
  "renderer redirect": (h: ReturnType<typeof transportHarness>) =>
    h.contents.emit("will-redirect", {
      isMainFrame: true,
      preventDefault() {},
    }),
  "renderer reload": (h: ReturnType<typeof transportHarness>) =>
    h.contents.emit("did-start-navigation", { isMainFrame: true }),
  "renderer URL change": (h: ReturnType<typeof transportHarness>) =>
    h.contents.emit("did-navigate-in-page", {}, "file:///changed", true),
  "replacement document": (h: ReturnType<typeof transportHarness>) =>
    h.contents.emit(
      "did-frame-navigate",
      {},
      "file:///app/index.html",
      200,
      "OK",
      true,
    ),
  "renderer-created window": (h: ReturnType<typeof transportHarness>) =>
    h.contents.openWindow(),
})) {
  it(`${name} reports one terminal event before workflow or shell work`, async () => {
    const h = transportHarness(async () => assert.fail("Workflow started"))
    const events = recordTerminalEvents(h.admission)
    trigger(h)
    trigger(h)
    assert.equal(events.length, 1)
    assert.deepEqual(h.effects, [{ type: "end-host", reason: "failure" }])
    assert.deepEqual(h.direct, [])
    assert.deepEqual(h.responses, [])
    await flushTransport()
    assert.deepEqual(h.terminalTrace, [
      "disable",
      "stop",
      "close-storage",
      "exit:1",
    ])
    h.gateway.dispose()
  })
}

for (const source of [
  "current port loss",
  "malformed port message",
  "wrong port stage",
] as const) {
  it(`${source} reports one terminal event without starting request work`, async () => {
    const channel = requestChannel()
    const h = sourceHarness()
    h.admission.dispatch({ type: "bootstrap-acknowledged" })
    const transport = createHostRequestTransport({
      admission: h.admission,
      receive: () => assert.fail("Request work started"),
    })
    try {
      transport.acceptCommand("userFile.exportPreview", channel.host)
      h.effects.length = 0
      if (source === "current port loss") channel.renderer.close()
      else
        channel.renderer.postMessage(
          source === "malformed port message" ? null : { type: "acknowledged" },
        )
      await until(() => h.events.length > 0)
      assert.equal(h.events.length, 1)
      assert.deepEqual(h.effects, [{ type: "end-host", reason: "failure" }])
      await flushTransport()
      assert.deepEqual(h.terminalTrace, [
        "disable",
        "stop",
        "close-storage",
        "exit:1",
      ])
    } finally {
      transport.dispose()
      channel.dispose()
    }
  })
}

for (const workflow of [
  "course.save",
  "settings.saveCredentials",
  "settings.savePreferences",
] as const) {
  it(`${workflow} failure reaches terminal before call retirement`, async () => {
    const error =
      workflow === "course.save"
        ? { type: "course-storage", message: "row mismatch" }
        : new Error("store failed")
    const h = transportHarness(async () => {
      throw error
    })
    const events = recordTerminalEvents(h.admission)
    h.admission.dispatch({ type: "bootstrap-acknowledged" })
    h.receive(startMessage(workflow, workflowInputs[workflow]))
    h.admission.dispatch({
      type: "host-start",
      source: "window-close",
      request: { cancel() {} },
    })
    await flushTransport()
    assert.deepEqual(events, [{ type: "terminal", error }])
    assert.deepEqual(h.terminalTrace, [
      "disable",
      "stop",
      "close-storage",
      "exit:1",
    ])
    assert.deepEqual(h.effects, [
      { type: "disable-input" },
      { type: "end-host", reason: "failure" },
    ])
    assert.equal(
      h.responses.some(
        (response) => "result" in response && response.result.type === "data",
      ),
      false,
    )
    h.gateway.dispose()
  })
}

import assert from "node:assert/strict"
import { it } from "node:test"
import {
  type ExclusiveCommandId,
  exclusiveCommandDeclarations,
} from "@repo-edu/application-contract"
import { workflowInputs } from "../../../../packages/application-contract/src/__tests__/workflow-input-fixtures"
import { HostAdmission } from "../host-admission"
import type { HostRequest } from "../host-admission-model"
import { createHostRequestTransport } from "../host-request-transport"
import {
  createPreloadRequestTransport,
  type RendererRequest,
  type RendererRequestObserver,
} from "../preload-request-transport"
import { commandPayloadSchemas } from "../request-command-schemas"
import { createRequestMessageParser } from "../request-port-protocol"
import { requestChannel, until } from "./request-port-harness"

const input = {
  workflowId: "userFile.exportPreview" as const,
  input: {
    kind: "user-save-target-ref" as const,
    referenceId: "target",
    displayName: "preview.txt",
    suggestedFormat: "txt" as const,
  },
  settlementInput: undefined,
}
const settlement = {
  workflowId: "userFile.exportPreview" as const,
  outcome: {
    disposition: "completed" as const,
    completion: {
      status: "succeeded" as const,
      result: {
        workflowId: "userFile.exportPreview" as const,
        displayName: "preview.txt",
        preview: "hello",
        savedAt: "now",
      },
    },
  },
  authoritative: undefined,
}

function observer(events: string[]): RendererRequestObserver {
  return {
    admission: (status) => {
      events.push(status)
    },
    prepare: () => {
      events.push("prepare")
    },
    persisted: () => {
      events.push("persisted")
    },
    progress: () => {
      events.push("progress")
    },
    output: () => {
      events.push("output")
    },
    settlement: () => {
      events.push("settlement")
    },
    released: () => {
      events.push("released")
    },
    closeAcknowledged: () => {
      events.push("close-acknowledged")
    },
    failed: () => {
      events.push("failed")
    },
  }
}

function harness() {
  const effects: string[] = []
  const bodies: string[] = []
  const admission = new HostAdmission((effect) => {
    effects.push(effect.type)
    if (effect.type === "release-command") host.release(effect.request)
  })
  admission.dispatch({ type: "bootstrap-acknowledged" })
  const host = createHostRequestTransport({
    admission,
    cancel() {
      bodies.push("cancel-effect")
    },
    receive(request, message) {
      bodies.push(message.type)
      switch (message.type) {
        case "bundle":
          if (admission.getSnapshot().phase === "preparing")
            admission.dispatch({ type: "preparation-committed", request })
          host.persistenceCommitted(request, {})
          break
        case "input":
          admission.dispatch({ type: "input-prepared", request })
          break
        case "acknowledged":
          admission.dispatch({ type: "settlement-acknowledged", request })
          break
        case "close-ready":
          host.acknowledgeClose(request)
          admission.dispatch({ type: "close-ready", request })
          break
      }
    },
  })
  const channels: ReturnType<typeof requestChannel>[] = []
  const renderer = createPreloadRequestTransport({
    channel(command) {
      const channel = requestChannel()
      channels.push(channel)
      return {
        renderer: channel.renderer,
        transfer() {
          assert.equal(
            channel.listenerCounts[1],
            3,
            "Renderer endpoint must be retained and listening before transfer",
          )
          host.acceptCommand(command, channel.host)
        },
      }
    },
    terminal(error) {
      admission.dispatch({ type: "terminal", error })
    },
  })
  return {
    host,
    renderer,
    admission,
    bodies,
    effects,
    channels,
    dispose() {
      host.dispose()
      renderer.dispose()
      for (const channel of channels) channel.dispose()
    },
  }
}

it("retains an endpoint before intent and gives concurrent attempts their own result", async () => {
  const h = harness()
  try {
    const first: string[] = [],
      second: string[] = []
    h.renderer.bridge.command("userFile.exportPreview", observer(first))
    h.renderer.bridge.command("repo.clone", observer(second))
    await until(() => first.length === 2 && second.length === 1)
    assert.deepEqual(first, ["accepted", "prepare"])
    assert.deepEqual(second, ["busy"])
    assert.deepEqual(h.channels[1].listenerCounts, [0, 0])
    assert.deepEqual(h.channels[0].listenerCounts, [3, 3])
    assert.equal(h.admission.getSnapshot().phase, "preparing")
  } finally {
    h.dispose()
  }
})

it("carries persistence, input, progress, output, settlement and release on one port", async () => {
  const h = harness()
  try {
    const events: string[] = []
    const request = h.renderer.bridge.command(
      "userFile.exportPreview",
      observer(events),
    )
    await until(() => events.includes("prepare"))
    request.persist({})
    await until(() => events.includes("persisted"))
    request.prepareInput(input)
    await until(() => h.admission.getSnapshot().phase === "executing.running")
    const state = h.admission.getSnapshot()
    assert.ok("request" in state)
    h.host.progress(state.request, { step: 1, totalSteps: 1, label: "Export" })
    h.host.output(state.request, { channel: "info", message: "Written" })
    h.admission.dispatch({ type: "outcome-fixed", request: state.request })
    h.host.settlement(state.request, settlement)
    await until(() => events.includes("settlement"))
    request.acknowledgeSettlement()
    await until(() => events.includes("released"))
    assert.equal(h.admission.getSnapshot().phase, "interactive")
    assert.deepEqual(events, [
      "accepted",
      "prepare",
      "persisted",
      "progress",
      "output",
      "settlement",
      "released",
    ])
    assert.deepEqual(h.channels[0].listenerCounts, [0, 0])
    assert.equal(h.effects.includes("end-host"), false)
  } finally {
    h.dispose()
  }
})

it("binds the host-created close port through persistence and acknowledgement", async () => {
  const h = harness()
  const channel = requestChannel()
  try {
    const events: string[] = []
    let rendererRequest: RendererRequest | undefined
    h.renderer.bridge.onClose((request) => {
      rendererRequest = request
      return observer(events)
    })
    const request: HostRequest = {
      cancel() {
        assert.fail("Close cancellation")
      },
    }
    h.admission.dispatch({
      type: "host-start",
      source: "window-close",
      request,
    })
    h.host.prepareClose(request, channel.host)
    h.renderer.close(channel.renderer)
    await until(() => events.includes("prepare"))
    rendererRequest?.persist({})
    await until(() => events.includes("persisted"))
    rendererRequest?.readyToClose()
    await until(() => events.includes("close-acknowledged"))
    assert.equal(h.admission.getSnapshot().phase, "closing.ready")
    assert.deepEqual(channel.listenerCounts, [0, 0])
  } finally {
    h.dispose()
    channel.dispose()
  }
})

for (const malformed of [
  null,
  {},
  { type: "unknown" },
  { type: "bundle", bundle: { course: null } },
  { type: "bundle", bundle: {}, extra: true },
  { type: "input", input },
  { type: "acknowledged" },
]) {
  it(`terminates before work for invalid or out-of-stage ${JSON.stringify(malformed)}`, async () => {
    const h = harness()
    try {
      h.renderer.bridge.command("userFile.exportPreview", observer([]))
      h.channels[0].renderer.postMessage(malformed)
      await until(() => h.admission.getSnapshot().phase === "terminal")
      assert.deepEqual(h.bodies, [])
      assert.equal(h.effects.filter((type) => type === "end-host").length, 1)
    } finally {
      h.dispose()
    }
  })
}

it("terminates duplicate persistence and cancellation instead of replaying them", async () => {
  for (const type of ["bundle", "cancel"]) {
    const h = harness()
    try {
      h.renderer.bridge.command("userFile.exportPreview", observer([]))
      const message = type === "bundle" ? { type, bundle: {} } : { type }
      h.channels[0].renderer.postMessage(message)
      h.channels[0].renderer.postMessage(message)
      await until(() => h.admission.getSnapshot().phase === "terminal")
      assert.equal(
        h.bodies.filter((body) => body === "bundle").length,
        type === "bundle" ? 1 : 0,
      )
    } finally {
      h.dispose()
    }
  }
})

it("terminates unexpected remote closure and removes both listener sets", async () => {
  const h = harness()
  try {
    h.renderer.bridge.command("userFile.exportPreview", observer([]))
    h.channels[0].renderer.close()
    await until(() => h.admission.getSnapshot().phase === "terminal")
    await until(() =>
      h.channels[0].listenerCounts.every((count) => count === 0),
    )
    assert.deepEqual(h.channels[0].listenerCounts, [0, 0])
  } finally {
    h.dispose()
  }
})

it("validates command-specific result and input payloads", () => {
  const parse = createRequestMessageParser(
    commandPayloadSchemas("userFile.exportPreview"),
  )
  assert.deepEqual(parse({ type: "input", input }), { type: "input", input })
  assert.deepEqual(parse({ type: "settlement", settlement }), {
    type: "settlement",
    settlement,
  })
  assert.throws(() =>
    parse({ type: "input", input: { ...input, workflowId: "repo.clone" } }),
  )
  assert.throws(() =>
    parse({
      type: "settlement",
      settlement: {
        ...settlement,
        outcome: { disposition: "uncertain", message: "unknown" },
      },
    }),
  )
  assert.throws(() =>
    parse({ type: "output", output: { channel: "info", message: 42 } }),
  )
})

it("validates the prepared input of every declared exclusive command", () => {
  for (const command of Object.keys(
    exclusiveCommandDeclarations,
  ) as ExclusiveCommandId[]) {
    const prepared = structuredClone(workflowInputs[command])
    if ("generationControlId" in prepared)
      delete (prepared as { generationControlId?: string }).generationControlId
    const operation = {
      workflowId: command,
      input: prepared,
      settlementInput:
        command === "examination.archive.import"
          ? {
              summaries: workflowInputs["examination.lookupQuestionSummaries"],
              questions: [workflowInputs["examination.lookupQuestions"]],
            }
          : undefined,
    }
    const parse = createRequestMessageParser(commandPayloadSchemas(command))
    assert.equal(parse({ type: "input", input: operation }).type, "input")
    assert.throws(() =>
      parse({ type: "input", input: { ...operation, input: null } }),
    )
  }
})

it("settles accepted persistence before preparation cancellation and rejects late output", async () => {
  const h = harness()
  try {
    const events: string[] = []
    const request = h.renderer.bridge.command(
      "userFile.exportPreview",
      observer(events),
    )
    await until(() => events.includes("prepare"))
    request.cancel()
    request.persist({})
    await until(() => events.includes("persisted"))
    const state = h.admission.getSnapshot()
    assert.equal(state.phase, "executing.settling")
    assert.ok("request" in state)
    h.host.settlement(state.request, {
      ...settlement,
      outcome: { disposition: "stopped", result: null },
    })
    await until(() => events.includes("settlement"))
    h.host.output(state.request, { channel: "info", message: "Too late" })
    assert.equal(h.admission.getSnapshot().phase, "terminal")
    assert.equal(events.includes("output"), false)
    assert.equal(h.bodies.includes("input"), false)
  } finally {
    h.dispose()
  }
})

it("rejects a formerly current command port after host close enters aborting", async () => {
  const h = harness()
  try {
    const events: string[] = []
    const request = h.renderer.bridge.command(
      "userFile.exportPreview",
      observer(events),
    )
    await until(() => events.includes("prepare"))
    h.admission.dispatch({
      type: "host-start",
      source: "window-close",
      request: { cancel() {} },
    })
    request.persist({})
    await until(() => h.admission.getSnapshot().phase === "terminal")
    assert.equal(h.bodies.includes("bundle"), false)
  } finally {
    h.dispose()
  }
})

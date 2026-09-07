import assert from "node:assert/strict"
import { it } from "node:test"
import { z } from "zod"
import {
  createRequestPortEndpoint,
  type RequestPort,
} from "../request-port-endpoint"
import {
  advanceRequestProtocol,
  type RequestPortSide,
  type RequestPortState,
} from "../request-port-protocol"
import type { RequestMessage } from "../request-port-wire"

type Message = RequestMessage<unknown, unknown, unknown, unknown>
const command: Array<[RequestPortSide, Message]> = [
  ["host", { type: "admission", status: "accepted" }],
  ["host", { type: "prepare" }],
  ["renderer", { type: "bundle", bundle: {} }],
  ["host", { type: "persisted", result: {} }],
  ["renderer", { type: "input", input: {} }],
  ["host", { type: "settlement", settlement: {} }],
  ["renderer", { type: "acknowledged" }],
  ["host", { type: "released" }],
]
const close: Array<[RequestPortSide, Message]> = [
  ["host", { type: "prepare" }],
  ["renderer", { type: "bundle", bundle: {} }],
  ["host", { type: "persisted", result: {} }],
  ["renderer", { type: "close-ready" }],
  ["host", { type: "close-acknowledged" }],
]

for (const kind of ["command", "close"] as const) {
  it(`rejects duplicate, late and reversed ${kind} messages at every ordered stage`, () => {
    let state: RequestPortState = {
      stage: kind === "command" ? "admission" : "prepare",
      cancellationSeen: false,
    }
    const sequence = kind === "command" ? command : close
    for (const [index, [sender, message]] of sequence.entries()) {
      assert.throws(() =>
        advanceRequestProtocol(
          state,
          kind,
          sender === "host" ? "renderer" : "host",
          message,
        ),
      )
      state = advanceRequestProtocol(state, kind, sender, message)
      for (const [lateSender, lateMessage] of sequence.slice(0, index + 1)) {
        assert.throws(() =>
          advanceRequestProtocol(state, kind, lateSender, lateMessage),
        )
      }
    }
    assert.equal(state.stage, "finished")
  })
}

it("permits progress and output only during running and never skips persistence for settlement", () => {
  for (const stage of [
    "admission",
    "prepare",
    "bundle",
    "persisting",
    "input",
    "running",
    "acknowledgement",
    "release",
    "finished",
  ] as const) {
    const state = { stage, cancellationSeen: false }
    for (const message of [
      { type: "progress", progress: {} },
      { type: "output", output: {} },
    ] as const) {
      if (stage === "running")
        assert.equal(
          advanceRequestProtocol(state, "command", "host", message).stage,
          "running",
        )
      else
        assert.throws(() =>
          advanceRequestProtocol(state, "command", "host", message),
        )
    }
  }
  assert.throws(() =>
    advanceRequestProtocol(
      { stage: "persisting", cancellationSeen: true },
      "command",
      "host",
      { type: "settlement", settlement: {} },
    ),
  )
})

it("accepts one staged cancellation, including after settlement, without accepting duplicates", () => {
  for (const stage of [
    "bundle",
    "persisting",
    "input",
    "running",
    "acknowledgement",
  ] as const) {
    const before = { stage, cancellationSeen: false }
    const after = advanceRequestProtocol(before, "command", "renderer", {
      type: "cancel",
    })
    assert.equal(after.stage, before.stage)
    assert.throws(() =>
      advanceRequestProtocol(after, "command", "renderer", { type: "cancel" }),
    )
    assert.throws(() =>
      advanceRequestProtocol(before, "close", "renderer", { type: "cancel" }),
    )
  }
})

it("closes unexpected transferred ports and retires listeners on decode failure", () => {
  for (const scenario of ["transfer", "decode"] as const) {
    let receive: Parameters<RequestPort["listen"]>[0] | undefined
    let malformed: (() => void) | undefined
    const events: string[] = []
    createRequestPortEndpoint({
      port: {
        postMessage() {
          assert.fail("Unexpected reply")
        },
        start() {},
        close() {
          events.push("closed")
        },
        listen(message, _closed, invalid) {
          receive = message
          malformed = invalid
          return () => {
            events.push("unlisten")
          }
        },
      },
      side: "host",
      kind: "command",
      schemas: {
        input: z.never(),
        progress: z.never(),
        output: z.never(),
        settlement: z.never(),
      },
      permit() {
        assert.fail("Invalid transfer reached stage admission")
      },
      receive() {
        assert.fail("Invalid transfer reached application work")
      },
      terminal() {
        events.push("terminal")
      },
      retired() {
        events.push("retired")
      },
    })
    if (scenario === "transfer")
      receive?.({ type: "cancel" }, [
        {
          close() {
            events.push("transferred-closed")
          },
        },
      ])
    else malformed?.()
    assert.deepEqual(events, [
      ...(scenario === "transfer" ? ["transferred-closed"] : []),
      "terminal",
      "unlisten",
      "closed",
      "retired",
    ])
  }
})

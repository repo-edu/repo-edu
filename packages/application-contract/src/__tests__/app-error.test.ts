import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  createCancelledAppError,
  createTransportAppError,
  isAppError,
} from "../index.js"

describe("isAppError", () => {
  it("recognizes a transport error", () => {
    const error = createTransportAppError("ipc-disconnected", "Connection lost")
    assert.equal(isAppError(error), true)
  })

  it("recognizes a cancelled error", () => {
    const error = createCancelledAppError()
    assert.equal(isAppError(error), true)
  })

  it("recognizes all known error types", () => {
    const types = [
      "transport",
      "cancelled",
      "validation",
      "not-found",
      "conflict",
      "provider",
      "persistence",
      "unexpected",
    ] as const

    for (const type of types) {
      assert.equal(
        isAppError({ type, message: "test" }),
        true,
        `Should recognize type '${type}'.`,
      )
    }
  })

  it("rejects a WorkflowEvent object", () => {
    assert.equal(isAppError({ type: "progress", data: {} }), false)
    assert.equal(isAppError({ type: "completed", data: {} }), false)
    assert.equal(isAppError({ type: "output", data: {} }), false)
    assert.equal(isAppError({ type: "failed", error: {} }), false)
  })

  it("rejects a plain object with an unknown type field", () => {
    assert.equal(isAppError({ type: "something-else", message: "hi" }), false)
  })

  it("rejects null and undefined", () => {
    assert.equal(isAppError(null), false)
    assert.equal(isAppError(undefined), false)
  })

  it("rejects primitives", () => {
    assert.equal(isAppError("transport"), false)
    assert.equal(isAppError(42), false)
    assert.equal(isAppError(true), false)
  })

  it("rejects an Error instance without a matching type", () => {
    const error = new Error("something")
    assert.equal(isAppError(error), false)
  })

  it("rejects an object without a type field", () => {
    assert.equal(isAppError({ message: "no type" }), false)
  })
})

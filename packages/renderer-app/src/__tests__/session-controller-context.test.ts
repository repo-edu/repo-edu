import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { registerRendererCloseHandlers } from "../components/App.js"
import { runSessionOperationBestEffort } from "../session/session-controller-context.js"

it("reports rejected best-effort session operations", async () => {
  const originalError = console.error
  const reported: unknown[][] = []
  console.error = (...args: unknown[]) => {
    reported.push(args)
  }
  try {
    const failure = new Error("operation failed")
    runSessionOperationBestEffort(Promise.reject(failure), "test operation")
    await new Promise<void>((resolve) => setImmediate(resolve))

    assert.deepStrictEqual(reported, [
      ["Session test operation failed", failure],
    ])
  } finally {
    console.error = originalError
  }
})

describe("renderer close host registration", () => {
  it("forwards close and cancellation attempts and cleans up both registrations", async () => {
    const callbacks: {
      close?: (attemptId: string) => Promise<void>
      cancel?: (attemptId: string) => void
    } = {}
    const cleanupCalls: string[] = []
    const closeAttempts: string[] = []
    const cancelAttempts: string[] = []

    const cleanup = registerRendererCloseHandlers(
      {
        onCloseRequest(callback) {
          callbacks.close = callback
          return () => cleanupCalls.push("close")
        },
        onCloseCancel(callback) {
          callbacks.cancel = callback
          return () => cleanupCalls.push("cancel")
        },
      },
      {
        async requestClose(attemptId) {
          closeAttempts.push(attemptId)
        },
        cancelClose(attemptId) {
          cancelAttempts.push(attemptId)
          return true
        },
      },
    )

    assert.ok(callbacks.close)
    assert.ok(callbacks.cancel)
    await callbacks.close("close-1")
    callbacks.cancel("close-1")
    cleanup()

    assert.deepEqual(closeAttempts, ["close-1"])
    assert.deepEqual(cancelAttempts, ["close-1"])
    assert.deepEqual(cleanupCalls, ["close", "cancel"])
  })
})

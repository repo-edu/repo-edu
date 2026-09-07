import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { CommitPersistencePreparation } from "@repo-edu/application-contract"
import { registerRendererCloseHandlers } from "../session/renderer-close-registration.js"

describe("renderer close host registration", () => {
  it("forwards close and cancellation attempts and cleans up both registrations", async () => {
    const callbacks: {
      close?: (commit: CommitPersistencePreparation) => Promise<void>
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
    await callbacks.close(async () => ({}))
    callbacks.cancel("close-1")
    cleanup()

    assert.deepEqual(closeAttempts, ["close"])
    assert.deepEqual(cancelAttempts, ["close-1"])
    assert.deepEqual(cleanupCalls, ["close", "cancel"])
  })
})

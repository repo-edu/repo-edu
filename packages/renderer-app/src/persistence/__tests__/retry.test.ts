import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { runWithRetry } from "../retry.js"

describe("runWithRetry", () => {
  it("does not start another attempt after cancellation during the retry delay", async () => {
    let calls = 0
    let cancelled = false
    const retryable = {
      type: "persistence",
      message: "busy",
      operation: "write",
      retryable: true,
    }

    await assert.rejects(
      runWithRetry(
        async () => {
          calls += 1
          if (calls === 1) {
            setTimeout(() => {
              cancelled = true
            }, 0)
            throw retryable
          }
          return "saved"
        },
        { retryDelaysMs: [10], isCancelled: () => cancelled },
      ),
      (error: unknown) => error === retryable,
    )

    assert.equal(calls, 1)
  })
})

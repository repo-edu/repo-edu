import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { runSubscriptionFromFactory } from "../workflow-client.js"

describe("desktop workflow subscription cancellation", () => {
  it("retains the subscription after abort until the host completes it", async () => {
    const abortController = new AbortController()
    let unsubscribeCalls = 0
    let complete = () => {}
    let settled = false

    const resultPromise = runSubscriptionFromFactory<"course.load">(
      (handlers) => {
        assert.equal(handlers.signal, abortController.signal)
        complete = handlers.onComplete
        return {
          unsubscribe() {
            unsubscribeCalls += 1
          },
        }
      },
      { signal: abortController.signal },
    )
    const cancelled = assert
      .rejects(resultPromise, { type: "cancelled" })
      .then(() => {
        settled = true
      })

    abortController.abort()
    await new Promise<void>((resolve) => setImmediate(resolve))
    assert.equal(settled, false)
    assert.equal(unsubscribeCalls, 0)
    complete()
    await cancelled
  })

  it("rejects immediately when the signal is already aborted", async () => {
    const abortController = new AbortController()
    abortController.abort()

    await assert.rejects(
      runSubscriptionFromFactory<"course.load">(
        () => ({
          unsubscribe() {
            throw new Error("unsubscribe should not be called.")
          },
        }),
        { signal: abortController.signal },
      ),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "type" in error &&
        error.type === "cancelled",
    )
  })
})

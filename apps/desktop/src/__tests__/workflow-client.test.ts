import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { runSubscriptionFromFactory } from "../workflow-client.js"

describe("desktop workflow subscription cancellation", () => {
  it("rejects with cancelled and unsubscribes when an in-flight workflow is aborted", async () => {
    const abortController = new AbortController()
    let unsubscribeCalls = 0

    const resultPromise = runSubscriptionFromFactory<"course.load">(
      () => ({
        unsubscribe() {
          unsubscribeCalls += 1
        },
      }),
      { signal: abortController.signal },
    )

    abortController.abort()

    await assert.rejects(
      resultPromise,
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "type" in error &&
        error.type === "cancelled",
    )
    assert.equal(unsubscribeCalls, 1)
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

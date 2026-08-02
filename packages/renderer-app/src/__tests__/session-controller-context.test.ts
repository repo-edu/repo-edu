import assert from "node:assert/strict"
import { it } from "node:test"
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

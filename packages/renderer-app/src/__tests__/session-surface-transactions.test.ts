import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { SessionSurfaceTransactions } from "../session/session-surface-transactions.js"

function harness() {
  const admitted = new Set<number>()
  let running: number | null = null
  let disposed = false
  const transactions = new SessionSurfaceTransactions({
    enter(turnId) {
      if (disposed) return false
      admitted.add(turnId)
      return true
    },
    start(turnId) {
      if (disposed || !admitted.has(turnId) || running !== null) return false
      running = turnId
      return true
    },
    canContinue(turnId) {
      return !disposed && running === turnId
    },
    retire(turnId) {
      admitted.delete(turnId)
      if (running === turnId) running = null
    },
  })
  return {
    transactions,
    dispose: () => {
      disposed = true
    },
  }
}

describe("SessionSurfaceTransactions", () => {
  it("keeps queued bodies and their durable settlements in order", async () => {
    const { transactions } = harness()
    const order: string[] = []
    const first = transactions.enqueue({ kind: "duplicate" }, async (scope) => {
      order.push("first-body")
      void scope.required(async () => {
        await Promise.resolve()
        order.push("first-durable")
      })
    })
    const second = transactions.enqueue({ kind: "rename" }, async () => {
      order.push("second-body")
    })
    await Promise.all([first, second])
    assert.deepEqual(order, ["first-body", "first-durable", "second-body"])
  })

  it("rejects a queued body disposed before start", async () => {
    const { transactions, dispose } = harness()
    const reservation = transactions.reserve<void>({ kind: "bootstrap" })
    assert.ok(reservation)
    dispose()
    await assert.rejects(
      reservation.run(async () => undefined),
      /disposed/,
    )
  })

  it("preserves the body error over a later settlement error", async () => {
    const { transactions } = harness()
    const bodyError = new Error("body failed")
    await assert.rejects(
      transactions.enqueue({ kind: "duplicate" }, async (scope) => {
        void scope.required(async () => {
          throw new Error("settlement failed")
        })
        throw bodyError
      }),
      (error) => error === bodyError,
    )
  })
})

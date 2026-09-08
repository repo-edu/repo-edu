import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { createWriteQueue } from "../index.js"

describe("createWriteQueue", () => {
  it("runs queued tasks sequentially", async () => {
    const enqueue = createWriteQueue()
    const events: string[] = []
    let releaseFirst = () => {}
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })

    const first = enqueue(async () => {
      events.push("first-start")
      await firstGate
      events.push("first-end")
      return 1
    })
    const second = enqueue(async () => {
      events.push("second-start")
      events.push("second-end")
      return 2
    })

    await Promise.resolve()
    assert.deepStrictEqual(events, ["first-start"])

    releaseFirst()

    assert.equal(await first, 1)
    assert.equal(await second, 2)
    assert.deepStrictEqual(events, [
      "first-start",
      "first-end",
      "second-start",
      "second-end",
    ])
  })

  it("continues queue processing after a rejected task", async () => {
    const enqueue = createWriteQueue()

    await assert.rejects(
      enqueue(async () => {
        throw new Error("first failed")
      }),
      /first failed/,
    )

    const value = await enqueue(async () => 7)
    assert.equal(value, 7)
  })
})

import assert from "node:assert/strict"
import { it } from "node:test"
import { invokeRendererCloseHandler } from "../renderer-close"

it("reports readiness only after the renderer close body completes", async () => {
  const body = Promise.withResolvers<void>()
  let completed = false
  const response = invokeRendererCloseHandler(() => body.promise, "close").then(
    (result) => {
      completed = true
      return result
    },
  )
  await Promise.resolve()
  assert.equal(completed, false)
  body.resolve()
  assert.deepEqual(await response, { requestId: "close", ok: true })
})

it("reports an unavailable or failed renderer close", async () => {
  assert.equal((await invokeRendererCloseHandler(null, "close")).ok, false)
  assert.deepEqual(
    await invokeRendererCloseHandler(async () => {
      throw new Error("save failed")
    }, "close"),
    {
      requestId: "close",
      ok: false,
      message: "save failed",
    },
  )
})

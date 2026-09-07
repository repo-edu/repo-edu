import assert from "node:assert/strict"
import { it } from "node:test"
import { CommandOutcomeError } from "@repo-edu/application-contract"
import { mapConcurrent } from "../repository-workflows/git-helpers.js"

it("waits for every started batch effect and preserves uncertainty over a sibling stop", async () => {
  const first = Promise.withResolvers<void>()
  const second = Promise.withResolvers<void>()
  const started: number[] = []
  let ended = false
  const unknown = new CommandOutcomeError({
    disposition: "uncertain",
    reason: "confirmation-expired",
    message: "Unconfirmed tree.",
  })
  const run = mapConcurrent(
    [1, 2, 3],
    async (item) => {
      started.push(item)
      await (item === 1 ? first.promise : second.promise)
      throw item === 1
        ? new CommandOutcomeError({ disposition: "stopped", result: null })
        : unknown
    },
    2,
  ).finally(() => {
    ended = true
  })
  const rejection = assert.rejects(run, (error) => error === unknown)
  first.resolve()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(ended, false)
  assert.deepEqual(started, [1, 2])
  second.resolve()
  await rejection
})

it("does not let confirmation expiry hide a sibling failure without proof", async () => {
  const error = new Error("Filesystem mutation failed.")
  await assert.rejects(
    mapConcurrent(
      [1, 2],
      async (item) => {
        throw item === 1
          ? new CommandOutcomeError({
              disposition: "uncertain",
              reason: "confirmation-expired",
              message: "Unconfirmed tree.",
            })
          : error
      },
      2,
    ),
    (actual) => actual === error,
  )
})

import assert from "node:assert/strict"
import { PassThrough, Writable } from "node:stream"
import { test } from "node:test"
import { readRulingReply } from "../ruling-input.js"

function streams(tty = true) {
  const input = Object.assign(new PassThrough(), { isTTY: tty })
  const output = new Writable({
    write(_chunk, _encoding, done) {
      done()
    },
  })
  return { input, output }
}

test("a ruling reply keeps pasted lines and submits only on a blank line", async () => {
  const { input, output } = streams()
  const reply = readRulingReply(input, output)
  input.write("\nChoose option 1.\nKeep automatic lookup.\n\n")
  assert.equal(await reply, "Choose option 1.\nKeep automatic lookup.")
  assert.equal(input.isPaused(), true)
})

for (const ending of ["interrupt", "eof", "abort"] as const) {
  test(`${ending} discards an unfinished ruling without leaving input listeners`, async () => {
    const { input, output } = streams()
    const controller = new AbortController()
    const listeners = input.listenerCount("keypress")
    const reply = readRulingReply(input, output, controller.signal)
    input.write("An unfinished reply")
    if (ending === "interrupt") input.write("\u0003")
    if (ending === "eof") input.end()
    if (ending === "abort") controller.abort()
    assert.equal(await reply, null)
    assert.equal(input.listenerCount("keypress"), listeners)
    assert.equal(input.isPaused(), true)
  })
}

test("non-terminal input does not submit piped text as a ruling", async () => {
  const { input, output } = streams(false)
  input.write("Apply everything.\n\n")
  assert.equal(await readRulingReply(input, output), null)
  assert.equal(input.readableLength, "Apply everything.\n\n".length)
})

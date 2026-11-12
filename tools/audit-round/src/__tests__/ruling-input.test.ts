import assert from "node:assert/strict"
import { PassThrough, Writable } from "node:stream"
import { test } from "node:test"
import { readRulingInput, readRulingReply } from "../ruling-input.js"

function streams(tty = true) {
  const input = Object.assign(new PassThrough(), { isTTY: tty })
  let written = ""
  const output = new Writable({
    write(chunk, _encoding, done) {
      written += chunk.toString()
      done()
    },
  })
  return { input, output, written: () => written }
}

test("contest input records each winner and leaves not yet for the fix", async () => {
  const { input, output } = streams()
  const reply = readRulingInput([1, 2, 3, 4], input, output)
  input.write(
    "vet\nThe verdict fits the evidence.\nauditor\nThe original finding stands.\nneither\nA later commit resolved it.\nnot yet\nExplain the fourth contest.\n\n",
  )
  assert.deepEqual(await reply, {
    rulings: [
      {
        finding: 1,
        winner: "vet",
        reason: "The verdict fits the evidence.",
      },
      {
        finding: 2,
        winner: "auditor",
        reason: "The original finding stands.",
      },
      {
        finding: 3,
        winner: "neither",
        reason: "A later commit resolved it.",
      },
    ],
    reply: "Explain the fourth contest.",
  })
})

test("a winner without a reason is refused and a complete ruling allows an empty reply", async () => {
  const { input, output, written } = streams()
  const reply = readRulingInput([7], input, output)
  input.write("vet\n\nThe vet read the contract correctly.\n\n")
  assert.deepEqual(await reply, {
    rulings: [
      {
        finding: 7,
        winner: "vet",
        reason: "The vet read the contract correctly.",
      },
    ],
    reply: "",
  })
  assert.match(written(), /winner needs a one-line reason/)
})

test("not yet keeps the contest for the next ruling input", async () => {
  const first = streams()
  const firstReply = readRulingInput([2], first.input, first.output)
  first.input.write("not yet\nWhich contract applies?\n\n")
  assert.deepEqual(await firstReply, {
    rulings: [],
    reply: "Which contract applies?",
  })

  const second = streams()
  const secondReply = readRulingInput([2], second.input, second.output)
  second.input.write("auditor\nThe named contract applies.\n\n")
  assert.deepEqual(await secondReply, {
    rulings: [
      {
        finding: 2,
        winner: "auditor",
        reason: "The named contract applies.",
      },
    ],
    reply: "",
  })
})

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

test("non-terminal input does not answer contest questions", async () => {
  const { input, output } = streams(false)
  input.write("vet\nBecause.\n\n")
  assert.equal(await readRulingInput([1], input, output), null)
  assert.equal(input.readableLength, "vet\nBecause.\n\n".length)
})

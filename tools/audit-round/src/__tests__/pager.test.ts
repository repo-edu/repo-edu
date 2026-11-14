import assert from "node:assert/strict"
import { Writable } from "node:stream"
import { test } from "node:test"
import { setTimeout as wait } from "node:timers/promises"
import { stripVTControlCharacters } from "node:util"
import type { Terminal as Screen } from "@earendil-works/pi-tui"
import { createPager } from "../pager.js"

const readOut = [
  "# Model read-out",
  "",
  "## Rounds by plan",
  "",
  "| Plan | Model | Rounds |",
  "| --- | --- | ---: |",
  "| alpha | m1 | 1 |",
  "|  | m2 | 2 |",
  "|  | m3 | 3 |",
  "| beta | m1 | 4 |",
  "| gamma | m1 | 5 |",
  "|  | m2 | 6 |",
  "",
  "Closing paragraph.",
  "",
  "## Notes",
  "",
  "1. One",
  "2. Two",
].join("\n")

function stream(tty: boolean): NodeJS.WriteStream {
  return Object.assign(
    new Writable({
      write(_chunk, _encoding, callback) {
        callback()
      },
    }),
    { isTTY: tty },
  ) as unknown as NodeJS.WriteStream
}

const esc = "\u001b"
/** The view moves to a row and clears it before it draws the row's text. */
const rowStart = new RegExp(`${esc}\\[(\\d+);1H${esc}\\[2K`)
const leaveAlternateScreen = `${esc}[?1049l`

/** A screen that keeps what the view drew, row by row, and takes typed keys. */
function fakeScreen(columns: number, rows: number) {
  const drawn: string[] = Array.from({ length: rows }, () => "")
  const writes: string[] = []
  let started = false
  let type: (data: string) => void = () => {}
  const screen: Screen = {
    start(onInput) {
      started = true
      type = onInput
    },
    stop() {},
    async drainInput() {},
    write(data) {
      writes.push(data)
      const parts = data.split(rowStart)
      for (let index = 1; index < parts.length; index += 2)
        drawn[Number(parts[index]) - 1] = stripVTControlCharacters(
          parts[index + 1],
        ).trimEnd()
    },
    get columns() {
      return columns
    },
    get rows() {
      return rows
    },
    get kittyProtocolActive() {
      return false
    },
    moveBy() {},
    hideCursor() {},
    showCursor() {},
    clearLine() {},
    clearFromCursor() {},
    clearScreen() {},
    setTitle() {},
    setProgress() {},
  }
  return {
    screen,
    drawn,
    writes,
    started: () => started,
    async press(...keys: string[]) {
      for (const key of keys) type(key)
      // One frame is drawn at most every 16 ms.
      await wait(50)
    },
  }
}

const down = `${esc}[B`

test("the view stays closed without a terminal or for a document that fits", async () => {
  for (const [output, input, rows] of [
    [stream(false), { isTTY: true }, 12],
    [stream(true), { isTTY: false }, 12],
    [stream(true), { isTTY: true }, 40],
  ] as const) {
    const fake = fakeScreen(60, rows)
    await createPager(output, input, () => fake.screen)(readOut)
    assert.equal(fake.started(), false)
    assert.deepEqual(fake.writes, [])
  }
})

test("the view pins the headings of the part under the top edge and leaves on q", async () => {
  const fake = fakeScreen(60, 12)
  let left = false
  const reading = createPager(
    stream(true),
    { isTTY: true },
    () => fake.screen,
  )(readOut).then(() => {
    left = true
  })
  await fake.press()
  assert.equal(fake.started(), true)
  assert.equal(fake.drawn[0], "Model read-out")
  assert.equal(fake.drawn[2], "Rounds by plan")
  assert.match(fake.drawn[11], /q Esc quit +lines 1–11 of 26$/)

  await fake.press(down, down, down)
  assert.deepEqual(fake.drawn.slice(0, 8), [
    "Rounds by plan",
    "┌───────┬───────┬────────┐",
    "│ Plan  │ Model │ Rounds │",
    "├───────┼───────┼────────┤",
    "│ alpha │ m1    │ 1      │",
    "├───────┼───────┼────────┤",
    "│       │ m2    │ 2      │",
    "├───────┼───────┼────────┤",
  ])
  assert.match(fake.drawn[11], /lines 4–14 of 26$/)

  // One more step moves one whole row: its text line and the rule under it.
  // The new first row leaves its plan cell empty, so the view names it.
  await fake.press(down)
  assert.equal(fake.drawn[4], "│ alpha │ m2    │ 2      │")
  assert.equal(fake.drawn[6], "│       │ m3    │ 3      │")
  assert.match(fake.drawn[11], /lines 6–16 of 26$/)
  assert.equal(left, false)

  const before = fake.writes.length
  await fake.press("q")
  await reading
  const closing = fake.writes.slice(before).join("")
  assert.ok(closing.includes(leaveAlternateScreen))
  // The caller prints the document, so leaving the view must not print it.
  assert.doesNotMatch(closing, /Model read-out/)
})

test("the view leaves on Esc too", async () => {
  const fake = fakeScreen(60, 12)
  const reading = createPager(
    stream(true),
    { isTTY: true },
    () => fake.screen,
  )(readOut)
  await fake.press()
  await fake.press(esc)
  await reading
  assert.ok(fake.writes.join("").includes(leaveAlternateScreen))
})

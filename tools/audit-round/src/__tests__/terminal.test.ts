import assert from "node:assert/strict"
import { Writable } from "node:stream"
import { test } from "node:test"
import { stripVTControlCharacters } from "node:util"
import { createTerminal } from "../terminal.js"

function capture(tty: boolean) {
  const chunks: string[] = []
  const stream = Object.assign(
    new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(chunk.toString())
        callback()
      },
    }),
    { isTTY: tty, columns: 48, rows: 4 },
  )
  return { stream: stream as NodeJS.WriteStream, chunks }
}

test("Markdown is rendered at the current width without a second wrap or height clipping", () => {
  const { stream, chunks } = capture(true)
  const source = "9. **Finding**\n\n   Supporting evidence."
  const rendered = [
    "\u001b[1mFindings\u001b[0m",
    "",
    "  9. Finding",
    "     Supporting evidence.",
    "",
    "     if (ready) {",
    `       run('${"x".repeat(70)}')`,
    "     }",
  ].join("\n")
  const widths: number[] = []
  const terminal = createTerminal(stream, (text, width) => {
    assert.equal(text, source)
    widths.push(width)
    return rendered
  })
  terminal.status("[audit] working")
  terminal.write(source, "markdown")
  assert.equal(chunks.at(-1), `${rendered}\n`)
  terminal.status("[audit] still working")
  stream.columns = 100
  terminal.write(source, "markdown")
  assert.equal(chunks.at(-1), `${rendered}\n`)
  stream.columns = 0
  terminal.write(source, "markdown")
  assert.deepEqual(widths, [48, 100, 80])
  terminal.clear()
})

test("redirected Markdown and plain status messages do not invoke Glow", () => {
  const source = "## Findings\n\n9. **Title**\n\n   Indented evidence."
  for (const tty of [false, true]) {
    const { stream, chunks } = capture(tty)
    const terminal = createTerminal(stream, () => {
      assert.fail("Plain or redirected output must not invoke Glow")
    })
    terminal.write(source, tty ? undefined : "markdown")
    terminal.clear()
    assert.equal(stripVTControlCharacters(chunks.join("")), `${source}\n`)
  }
})

test("a rendering failure leaves the error with the round instead of dumping raw Markdown", () => {
  const { stream, chunks } = capture(true)
  const failure = new Error("Glow failed")
  const terminal = createTerminal(stream, () => {
    throw failure
  })
  assert.throws(() => terminal.write("# Findings", "markdown"), failure)
  assert.deepEqual(chunks, [])
  terminal.clear()
})

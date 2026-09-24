import assert from "node:assert/strict"
import { Writable } from "node:stream"
import { test } from "node:test"
import { WriteStream } from "node:tty"
import { stripVTControlCharacters } from "node:util"
import { visibleWidth } from "@earendil-works/pi-tui"
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
    {
      isTTY: tty,
      columns: 48,
      rows: 4,
      getColorDepth: WriteStream.prototype.getColorDepth,
    },
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

test("rendered messages lose outer padding but retain internal spacing and styles", () => {
  const content = [
    "  \u001b[1mReading the session code.\u001b[0m  ",
    "\u001b[0m   \u001b[0m",
    "    Indented supporting evidence.",
  ].join("\n")
  for (const padding of ["\n", "\n   \n", "\u001b[0m   \u001b[0m\n"]) {
    const { stream, chunks } = capture(true)
    const terminal = createTerminal(
      stream,
      () => `${padding}${content}\n${padding}`,
    )
    terminal.write("[audit] first")
    terminal.write("Reading the session code.", "markdown")
    terminal.write("[audit] next")
    assert.equal(chunks.join(""), `[audit] first\n${content}\n[audit] next\n`)
    terminal.clear()
  }
})

test("report rendering preserves finding numbers, paragraphs and nested list markers", () => {
  const { stream, chunks } = capture(true)
  const terminal = createTerminal(stream)
  terminal.write(
    [
      "## Findings",
      "",
      "9. **First finding**",
      "   Introductory evidence.",
      "",
      "   Separate paragraph with `source.ts`.",
      "",
      "   - A nested observation.",
      "   - Another observation.",
      "",
      "   Choices:",
      "",
      "   1. First choice.",
      "   2. Second choice.",
      "",
      "10. **Next finding**",
      "    More evidence.",
    ].join("\n"),
    "markdown",
  )
  const lines = stripVTControlCharacters(chunks.join(""))
    .split("\n")
    .map((line) => line.trimEnd())
  assert.deepEqual(lines, [
    "Findings",
    "",
    "9. First finding",
    "   Introductory evidence.",
    "",
    "   Separate paragraph with source.ts.",
    "",
    "    - A nested observation.",
    "    - Another observation.",
    "",
    "   Choices:",
    "",
    "    1. First choice.",
    "    2. Second choice.",
    "",
    "10. Next finding",
    "    More evidence.",
    "",
  ])
  terminal.clear()
})

test("rendered reports wrap nested evidence and long paths at the current width", () => {
  const { stream, chunks } = capture(true)
  const terminal = createTerminal(stream)
  const source = [
    "1. **Finding**",
    "",
    "   - Evidence with `packages/application/src/examination-workflows/examination-workflows.ts` followed by more evidence.",
    "",
    "   1. A nested choice with enough explanation to span several terminal lines.",
    "",
    "   ```ts",
    "   const answer = 42",
    "   ```",
  ].join("\n")
  for (const width of [40, 80]) {
    stream.columns = width
    terminal.write(source, "markdown")
    const rendered = chunks.at(-1) ?? ""
    assert.ok(rendered.split("\n").every((line) => visibleWidth(line) <= width))
    const words = stripVTControlCharacters(rendered).replace(/\s/g, "")
    assert.ok(words.includes("examination-workflows/examination-workflows.ts"))
    assert.ok(words.includes("spanseveralterminallines."))
    assert.ok(words.includes("constanswer=42"))
  }
  terminal.clear()
})

test("NO_COLOR removes styling while preserving report layout", (t) => {
  const previous = process.env.NO_COLOR
  process.env.NO_COLOR = "1"
  t.after(() => {
    if (previous === undefined) delete process.env.NO_COLOR
    else process.env.NO_COLOR = previous
  })
  const { stream, chunks } = capture(true)
  const terminal = createTerminal(stream)
  terminal.write("## Findings\n\nEvidence in `source.ts`.", "markdown")
  const rendered = chunks.join("")
  assert.equal(rendered, stripVTControlCharacters(rendered))
  assert.match(rendered, /Findings\s*\n\s*\nEvidence in source\.ts\./)
  terminal.clear()
})

test("redirected Markdown and plain status messages do not invoke the renderer", () => {
  const source = "## Findings\n\n9. **Title**\n\n   Indented evidence."
  for (const tty of [false, true]) {
    const { stream, chunks } = capture(tty)
    const terminal = createTerminal(stream, () => {
      assert.fail("Plain or redirected output must not invoke the renderer")
    })
    terminal.write(source, tty ? undefined : "markdown")
    terminal.clear()
    assert.equal(stripVTControlCharacters(chunks.join("")), `${source}\n`)
  }
})

test("a rendering failure leaves the error with the round instead of dumping raw Markdown", () => {
  const { stream, chunks } = capture(true)
  const failure = new Error("Markdown rendering failed")
  const terminal = createTerminal(stream, () => {
    throw failure
  })
  assert.throws(() => terminal.write("# Findings", "markdown"), failure)
  assert.deepEqual(chunks, [])
  terminal.clear()
})

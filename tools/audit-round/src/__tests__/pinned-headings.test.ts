import assert from "node:assert/strict"
import { Writable } from "node:stream"
import { test } from "node:test"
import { stripVTControlCharacters } from "node:util"
import {
  layoutDocument,
  pinnedLines,
  type Region,
  steppedTop,
} from "../pinned-headings.js"
import { renderMarkdownLines } from "../terminal.js"

const plain = new Writable({
  write(_chunk, _encoding, callback) {
    callback()
  },
}) as unknown as NodeJS.WriteStream

const render = (markdown: string, width: number) =>
  renderMarkdownLines(markdown, width, plain)

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
  "### Detail",
  "",
  "1. One",
  "2. Two",
].join("\n")

const tableHeading = [
  "┌───────┬───────┬────────┐",
  "│ Plan  │ Model │ Rounds │",
  "├───────┼───────┼────────┤",
]
const rule = "├───────┼───────┼────────┤"

function pinnedAt(
  top: number,
  markdown = readOut,
  width = 60,
  viewport = 40,
): string[] {
  return pinnedLines(
    layoutDocument(markdown, width, render),
    top,
    viewport,
  ).map((line) => stripVTControlCharacters(line).trimEnd())
}

test("the layout keeps the rendered lines and each heading is the document's own lines", () => {
  const layout = layoutDocument(readOut, 60, render)
  assert.deepEqual(layout.lines, render(readOut, 60))
  assert.equal(layout.lines.length, 28)
  const check = (region: Region) => {
    assert.deepEqual(
      layout.lines.slice(region.start, region.start + region.header.length),
      region.header,
    )
    region.children.forEach(check)
  }
  layout.regions.forEach(check)
  assert.deepEqual(
    layout.regions.map((region) => [region.start, region.end]),
    [
      [2, 21],
      [22, 28],
    ],
  )
})

test("nothing is pinned above the first section and the title never is", () => {
  assert.deepEqual(pinnedAt(0), [])
  assert.deepEqual(pinnedAt(1), [])
})

test("a section heading stays while its body is under the top edge", () => {
  assert.deepEqual(pinnedAt(2), ["Rounds by plan"])
  assert.deepEqual(pinnedAt(20), ["Rounds by plan"])
  assert.deepEqual(pinnedAt(21), [])
  assert.deepEqual(pinnedAt(22), ["Notes"])
  assert.deepEqual(pinnedAt(23), ["Notes", "### Detail"])
})

test("a table keeps its column headings and the first row under them shows its group's name", () => {
  const headings = ["Rounds by plan", ...tableHeading]
  // A row that names its group needs nothing drawn over it.
  assert.deepEqual(pinnedAt(3), headings)
  // A row with an empty first cell gets the name, and keeps its other cells.
  assert.deepEqual(pinnedAt(5), [...headings, "│ alpha │ m2    │ 2      │"])
  assert.deepEqual(pinnedAt(7), [...headings, "│ alpha │ m3    │ 3      │"])
  assert.deepEqual(pinnedAt(9), headings)
  assert.deepEqual(pinnedAt(11), headings)
  assert.deepEqual(pinnedAt(13), [...headings, "│ gamma │ m2    │ 6      │"])
  // Between two rows the rule above the row stays as it is.
  assert.deepEqual(pinnedAt(4), [
    ...headings,
    rule,
    "│ alpha │ m2    │ 2      │",
  ])
})

test("a heading leaves with its region and never covers the lines after it", () => {
  // Three table lines remain above the bottom border: the whole heading fits.
  assert.deepEqual(pinnedAt(14), ["Rounds by plan", ...tableHeading])
  assert.deepEqual(pinnedAt(15), ["Rounds by plan", ...tableHeading.slice(1)])
  assert.deepEqual(pinnedAt(16), ["Rounds by plan", rule])
  assert.deepEqual(pinnedAt(17), ["Rounds by plan"])
})

/** Every position a run of equal steps passes, until a step moves nothing. */
function steps(from: number, lines: number, viewport: number): number[] {
  const layout = layoutDocument(readOut, 60, render)
  const passed: number[] = []
  for (let top = from; ; ) {
    const next = steppedTop(layout, top, lines, viewport)
    if (next === top) return passed
    passed.push(next)
    top = next
  }
}

test("a step of one line moves one line, inside a table too", () => {
  // A view of 8 lines ends its scrolling at line 20.
  const all = Array.from({ length: 20 }, (_, index) => index + 1)
  assert.deepEqual(steps(0, 1, 8), all)
  assert.deepEqual(steps(20, -1, 8), [...all.slice(0, -1).reverse(), 0])
})

test("a longer step moves its full length unless that would skip a line", () => {
  const layout = layoutDocument(readOut, 60, render)
  // A step may end in the middle of a row.
  assert.equal(steppedTop(layout, 3, 3, 12), 6)
  assert.equal(steppedTop(layout, 3, 4, 12), 7)
  // At 3 the view shows lines 7 to 14 under the headings. At 13 it would
  // start at line 17, so the step stops at 11, which starts at line 15.
  assert.equal(steppedTop(layout, 3, 10, 12), 11)
  // At 11 the view starts at line 15. At 1 it would end at line 12, so the
  // step stops at 3, which ends at line 14.
  assert.equal(steppedTop(layout, 11, -10, 12), 3)
})

test("a name of several lines fills the row's lines and is cut in a shorter row", () => {
  const wrapped = [
    "## Rounds",
    "",
    "| Plan | Model |",
    "| --- | --- |",
    "| a long plan name here | first model |",
    "|  | second model |",
    "|  | m3 |",
    "| b | m1 |",
  ].join("\n")
  // The name and both longer model names take two lines each.
  const named = (top: number) => pinnedAt(top, wrapped, 30).slice(4)
  assert.deepEqual(named(4), [
    "│ a long plan    │ second    │",
    "│ name here      │ model     │",
  ])
  assert.deepEqual(named(7), ["│ a long plan…   │ m3        │"])
  assert.deepEqual(named(9), [])
})

test("the pinned lines fill at most half the view and a name cut there ends in …", () => {
  const wrapped = [
    "## Rounds",
    "",
    "| Plan | Model |",
    "| --- | --- |",
    "| a long plan name here | first model |",
    "|  | second model |",
  ].join("\n")
  const pinned = (viewport: number) => pinnedAt(4, wrapped, 30, viewport)
  assert.deepEqual(pinned(10).slice(4), ["│ a long plan…   │ second    │"])
  // No line of the name fits beside the headings.
  assert.equal(pinned(8).length, 4)
  // The headings alone are cut too.
  assert.deepEqual(pinned(4), ["Rounds", "┌────────────────┬───────────┐"])
})

test("a table too narrow to draw as a grid has no pinned headings and no grouped rows", () => {
  const layout = layoutDocument(readOut, 8, render)
  assert.deepEqual(layout.regions[0].children, [])
  assert.deepEqual(layout.groupedRows, [])
})

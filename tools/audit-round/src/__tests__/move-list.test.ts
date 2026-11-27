import assert from "node:assert/strict"
import { test } from "node:test"
import { moveListText, readMoveList } from "../move-list.js"
import { roundGrammarExample, roundGrammarExamples } from "./round-grammar.js"

test("the round grammar's move-list examples are reader fixtures", () => {
  for (const example of roundGrammarExamples("move-list/")) {
    if (example.outcome === "parsed") {
      assert.doesNotThrow(() => readMoveList(example.source), example.id)
    } else {
      assert.throws(
        () => readMoveList(example.source),
        (error: unknown) =>
          error instanceof Error && error.message === example.refusal,
        example.id,
      )
    }
  }
})

test("a move list gives its source, hash, area, writers and moves in list order", () => {
  const opening = {
    source: "packages/domain/src/roster.ts",
    hash: "3b18e512dba79e4c8300dd08aeb37f8e728b8dad",
    area: "pkg-domain",
  }
  const expectedMoves = [
    {
      target: "packages/domain/src/roster-names.ts",
      responsibility:
        "Builds and compares the display names of roster members.",
      ranges: [
        { start: 10, end: 40 },
        { start: 52, end: 60 },
      ],
    },
    {
      target: "packages/domain/src/roster-import.ts",
      responsibility: "Reads a roster from an imported student list.",
      ranges: [
        { start: 61, end: 118 },
        { start: 120, end: 120 },
      ],
    },
  ]
  const gbx = { tag: "gbx", model: "gemini-4-neon", effort: "xhigh" } as const
  const abx = { tag: "abx", model: "claude-opus-5-5", effort: "xhigh" } as const
  const obx = { tag: "obx", model: "gpt-5.6-sol", effort: "xhigh" } as const
  const moves = readMoveList(roundGrammarExample("move-list/moves").source)
  assert.deepEqual(moves, {
    ...opening,
    kind: "moves",
    designer: gbx,
    moves: expectedMoves,
  })
  assert.deepEqual(
    readMoveList(roundGrammarExample("move-list/repaired-moves").source),
    {
      ...opening,
      kind: "moves",
      designer: gbx,
      picker: abx,
      moves: expectedMoves,
    },
  )
  assert.deepEqual(
    readMoveList(roundGrammarExample("move-list/no-split").source),
    {
      ...opening,
      kind: "no-split",
      designer: obx,
      result: "needs-plan",
      reason: "The seam between names and imports cuts through one function.",
    },
  )
  assert.deepEqual(
    readMoveList(roundGrammarExample("move-list/picker-no-split").source),
    {
      ...opening,
      kind: "no-split",
      picker: abx,
      result: "fine",
      reason: "The file holds one responsibility.",
    },
  )
  for (const id of [
    "move-list/moves",
    "move-list/repaired-moves",
    "move-list/no-split",
    "move-list/picker-no-split",
  ]) {
    const example = roundGrammarExample(id)
    assert.equal(
      moveListText(readMoveList(example.source), 120),
      `${example.source}\n`,
      id,
    )
  }
  assert.match(moveListText(moves, 50), /\nRemaining: 0 lines\n/)
})

test("path punctuation, indentation and spacing after range commas preserve the moves", () => {
  const source = roundGrammarExample("move-list/moves").source
  const formatted = source
    .replace(/^(Source: .+|### .+)$/gm, "$1.")
    .replaceAll(", ", ",")
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n")
  assert.deepEqual(readMoveList(formatted), readMoveList(source))
})

test("a move list refuses missing or malformed opening, writer, size and section lines", () => {
  const baseOpening = [
    "# Move list",
    "",
    "Source: `packages/domain/src/roster.ts`",
    "Hash: 3b18e512dba79e4c8300dd08aeb37f8e728b8dad",
    "Area: pkg-domain",
    "Size: 120 lines",
  ]
  const movesOpening = [
    ...baseOpening,
    "Remaining: 89 lines",
    "Designer: abx (claude-opus-5-5 xhigh)",
    "",
  ]
  const noSplitOpening = [
    ...baseOpening,
    "Designer: abx (claude-opus-5-5 xhigh)",
    "",
  ]
  const oneMove = [
    "## Moves",
    "",
    "### 1. `packages/domain/src/names.ts`",
    "",
    "Responsibility: Builds the names.",
    "Ranges: 10-40",
    "Size: 31 lines",
  ]
  const oneNoSplit = [
    "## No split",
    "",
    "Result: fine. The file holds one responsibility.",
  ]
  const refusals: readonly [readonly string[], string][] = [
    [
      [...baseOpening, ""],
      "Move list needs a ## Moves or a ## No split section after its opening",
    ],
    [
      [...movesOpening, "## Moves"],
      "Move list needs at least one move under ## Moves",
    ],
    [
      [
        ...movesOpening,
        "## Moves",
        "",
        "### 1. `packages/domain/src/names.ts`",
      ],
      "Move list move 1 needs Responsibility:, Ranges: and Size: lines",
    ],
    [
      [
        ...movesOpening,
        "## Moves",
        "",
        "### 1. `packages/domain/src/names.ts`",
        "",
        "Responsibility: Builds the names.",
        "Ranges: 10-40",
      ],
      "Move list move 1 needs Responsibility:, Ranges: and Size: lines",
    ],
    [
      [
        ...movesOpening,
        "## Moves",
        "",
        "### 1. `packages/domain/src/names.ts`",
        "",
        "Responsibility: Builds the names.",
        "Ranges: 10-40",
        "Size: 0 lines",
      ],
      "Move list move 1 Size: line must give the target line count as n lines",
    ],
    [
      [
        ...movesOpening,
        "## Moves",
        "",
        "### 1. `packages/domain/src/names.ts`",
        "",
        "Responsibility: Builds the names.",
        "Ranges: 10 to 40",
        "Size: 31 lines",
      ],
      "Move list move 1 has the malformed range 10 to 40",
    ],
    [
      [...noSplitOpening, ...oneNoSplit, "", "More text."],
      "Move list ## No split section needs one line Result: with its word and reason",
    ],
    [
      baseOpening.filter((line) => !line.startsWith("Size:")),
      "Move list needs Source:, Hash:, Area: and Size: lines after its heading",
    ],
    [
      baseOpening
        .map((line) => line.replace("120 lines", "120 bytes"))
        .concat("", ...oneNoSplit),
      "Move list Size: line must give the source line count as n lines",
    ],
    [
      [...noSplitOpening, ...oneMove],
      "Move list Remaining: line must give the remaining source line count as n lines",
    ],
    [
      [
        ...baseOpening,
        "Remaining: 89 bytes",
        "Designer: abx (claude-opus-5-5 xhigh)",
        "",
        ...oneMove,
      ],
      "Move list Remaining: line must give the remaining source line count as n lines",
    ],
    [
      [...baseOpening, "Remaining: 89 lines", "", ...oneMove],
      "Move list needs a Designer: line after its Remaining: line",
    ],
    [
      [
        ...baseOpening,
        "Remaining: 89 lines",
        "Picker: abx (claude-opus-5-5 xhigh)",
        "",
        ...oneMove,
      ],
      "Move list Designer: line must name tag (model effort)",
    ],
    [
      [
        ...baseOpening,
        "Remaining: 89 lines",
        "Designer: xyz (claude-opus-5-5 xhigh)",
        "",
        ...oneMove,
      ],
      "Move list Designer: line must name tag (model effort)",
    ],
    [
      [
        ...baseOpening,
        "Remaining: 89 lines",
        "Designer: abx (claude-opus-5-5 xhigh)",
        "Picker: otx (gpt-6.2-astra invalid)",
        "",
        ...oneMove,
      ],
      "Move list Picker: line must name tag (model effort)",
    ],
    [
      [...movesOpening, ...oneNoSplit],
      "Move list needs one Designer: or Picker: line after its Size: line",
    ],
    [
      [
        ...baseOpening,
        "Designer: abx (claude-opus-5-5 xhigh)",
        "Picker: otx (gpt-6.2-astra xhigh)",
        "",
        ...oneNoSplit,
      ],
      "Move list needs one Designer: or Picker: line after its Size: line",
    ],
    [
      [
        ...baseOpening,
        "Designer: abx claude-opus-5-5 xhigh",
        "",
        ...oneNoSplit,
      ],
      "Move list Designer: line must name tag (model effort)",
    ],
    [
      [...baseOpening, "Picker: invalid", "", ...oneNoSplit],
      "Move list Picker: line must name tag (model effort)",
    ],
  ]
  for (const [lines, refusal] of refusals)
    assert.throws(
      () => readMoveList(lines.join("\n")),
      (error: unknown) => error instanceof Error && error.message === refusal,
      refusal,
    )
})

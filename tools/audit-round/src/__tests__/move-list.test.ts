import assert from "node:assert/strict"
import { test } from "node:test"
import { readMoveList } from "../move-list.js"
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

test("a move list gives its source, hash, area and moves in list order", () => {
  const opening = {
    source: "packages/domain/src/roster.ts",
    hash: "3b18e512dba79e4c8300dd08aeb37f8e728b8dad",
    area: "pkg-domain",
  }
  assert.deepEqual(
    readMoveList(roundGrammarExample("move-list/moves").source),
    {
      ...opening,
      kind: "moves",
      moves: [
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
      ],
    },
  )
  assert.deepEqual(
    readMoveList(roundGrammarExample("move-list/no-split").source),
    {
      ...opening,
      kind: "no-split",
      result: "needs-plan",
      reason: "The seam between names and imports cuts through one function.",
    },
  )
})

test("a move list refuses a missing section, a move without its lines and text after its result", () => {
  const opening = [
    "# Move list",
    "",
    "Source: `packages/domain/src/roster.ts`",
    "Hash: 3b18e512dba79e4c8300dd08aeb37f8e728b8dad",
    "Area: pkg-domain",
    "",
  ]
  const refusals: readonly [readonly string[], string][] = [
    [
      opening,
      "Move list needs a ## Moves or a ## No split section after its opening",
    ],
    [
      [...opening, "## Moves"],
      "Move list needs at least one move under ## Moves",
    ],
    [
      [...opening, "## Moves", "", "### 1. `packages/domain/src/names.ts`"],
      "Move list move 1 needs a Responsibility: line and a Ranges: line",
    ],
    [
      [
        ...opening,
        "## Moves",
        "",
        "### 1. `packages/domain/src/names.ts`",
        "",
        "Responsibility: Builds the names.",
        "Ranges: 10 to 40",
      ],
      "Move list move 1 has the malformed range 10 to 40",
    ],
    [
      [
        ...opening,
        "## No split",
        "",
        "Result: fine. The file holds one responsibility.",
        "",
        "More text.",
      ],
      "Move list ## No split section needs one line Result: with its word and reason",
    ],
    [
      ["# Move list", "", "Source: packages/domain/src/roster.ts"],
      "Move list needs Source:, Hash: and Area: lines after its heading",
    ],
  ]
  for (const [lines, refusal] of refusals)
    assert.throws(
      () => readMoveList(lines.join("\n")),
      (error: unknown) => error instanceof Error && error.message === refusal,
      refusal,
    )
})

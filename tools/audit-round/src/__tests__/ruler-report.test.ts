import assert from "node:assert/strict"
import { test } from "node:test"
import { readRulerReport, unopenedSources } from "../ruler-report.js"
import { roundGrammarExamples } from "./round-grammar.js"

const panel = ["abx", "obh"]

test("the round grammar's ruler examples are reader fixtures", () => {
  const given = [{ number: 2, tier: "C" as const }]
  for (const example of roundGrammarExamples("ruler/")) {
    if (example.outcome === "parsed") {
      assert.equal(
        readRulerReport(example.source, given, panel).winners.length,
        1,
        example.id,
      )
    } else {
      assert.throws(
        () => readRulerReport(example.source, given, panel),
        (error: unknown) =>
          error instanceof Error && error.message === example.refusal,
        example.id,
      )
    }
  }
})

test("the ruler reader returns each winner and every named source once", () => {
  const reading = readRulerReport(
    [
      "Head drift: none.",
      "- Opened: `/path/to/plan/active/example.md`, its decisions.",
      "",
      "### 1. [C] Keep the record",
      "",
      "  - Opened: `/path/to/repo-edu/tools/audit-round/src/report.ts`",
      "- Opened: `abc123`",
      "",
      "Winner: abx, obh. Both revisions land one correction.",
      "",
      "### 3. [D]",
      "",
      "Opened: `/path/to/plan/active/example.md`",
      "Winner: neither.  A real choice remains.  ",
    ].join("\n"),
    [
      { number: 1, tier: "C" },
      { number: 3, tier: "D" },
    ],
    panel,
  )
  assert.deepEqual(reading, {
    winners: [
      {
        number: 1,
        tier: "C",
        winner: ["abx", "obh"],
        reason: "Both revisions land one correction.",
      },
      {
        number: 3,
        tier: "D",
        winner: "neither",
        reason: "A real choice remains.",
      },
    ],
    sources: [
      "/path/to/plan/active/example.md",
      "/path/to/repo-edu/tools/audit-round/src/report.ts",
      "abc123",
    ],
  })
})

test("the ruler reader refuses entries out of audit report order", () => {
  const entry = (number: number) =>
    `### ${number}. [C]\n\n- Opened: \`abc123\`\n\nWinner: report. It stands.\n`
  const given = [
    { number: 1, tier: "C" as const },
    { number: 2, tier: "C" as const },
  ]
  for (const source of [`${entry(2)}\n${entry(1)}`, `${entry(1)}\n${entry(1)}`])
    assert.throws(
      () => readRulerReport(source, given, panel),
      /Ruler findings must follow audit report order, each once/,
    )
})

test("the ruler reader refuses a winner before the first entry", () => {
  assert.throws(
    () =>
      readRulerReport(
        "Winner: abx. It holds.\n\n### 2. [C]\n\n- Opened: `abc123`\n\nWinner: abx. It holds.",
        [{ number: 2, tier: "C" }],
        panel,
      ),
    /Ruler report names a winner before its first finding/,
  )
})

test("the ruler reader names a commit only by its first six characters", () => {
  for (const name of ["abc12", "abc1234", "ABC123"])
    assert.throws(
      () =>
        readRulerReport(
          `### 2. [C]\n\n- Opened: \`${name}\`\n\nWinner: abx. It holds.`,
          [{ number: 2, tier: "C" }],
          panel,
        ),
      /Ruler finding 2 has a source that is no absolute path/,
      name,
    )
})

test("the reading check passes a source named in a tool line or supplied whole", () => {
  assert.deepEqual(
    unopenedSources(
      ["/repo/a.ts", "abc123", "/repo/b.md", "/repo/c.ts"],
      ["Read /repo/a.ts", "Bash git show abc123 --stat"],
      ["/repo/b.md"],
    ),
    ["/repo/c.ts"],
  )
  // A read relative to an earlier cd does not count for the absolute name.
  assert.deepEqual(
    unopenedSources(
      ["/repo/src/round-data.ts"],
      ["Bash sed -n 1,5p round-data.ts"],
      [],
    ),
    ["/repo/src/round-data.ts"],
  )
})

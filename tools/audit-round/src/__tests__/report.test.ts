import assert from "node:assert/strict"
import { test } from "node:test"
import { readReport as readAuditReport } from "../report.js"
import { readVet } from "../vet.js"

const readReport = (source: string, kind: "planning" | "implementation") =>
  readAuditReport(source, kind).findings

const ratings = "[growth:none] [reach:developer] [complexity:none]"
function finding(
  number = 1,
  location = "[area:tool-audit-round]",
  evidence = "The defect loses evidence.",
): string {
  return `${number}. **B: Preserve the evidence**\n   ${evidence}\n   ${location} ${ratings}\n`
}
const implementation = (body: string) =>
  `# Audit\n\nJudged repos: plan@abc123, repo-edu@def456\n\nOpening and coverage.\n\n## Findings\n\n${body}`
const planning = (excess: string, missing: string) =>
  `# Audit\n\nJudged repos: plan@abc123, repo-edu@def456\n\n## Excess functionality\n\n${excess}\n\n## Missing functionality\n\n${missing}`

test("the report opening identifies the judged repos independently of evidence", () => {
  for (const [line, judgedRepos] of [
    ["plan@abc123", ["plan"]],
    ["repo-edu@def456", ["repo-edu"]],
    ["plan@abc123, repo-edu@def456", ["plan", "repo-edu"]],
  ] as const) {
    assert.deepEqual(
      readAuditReport(
        `# Audit\n\nJudged repos: ${line}\n\n> Judged repos: other@abc123\n\n## Findings\n\nNo findings.`,
        "implementation",
      ),
      { findings: [], judgedRepos },
    )
  }
})

test("plain judged-repos lines survive formatted neighbours in the same paragraph", () => {
  for (const opening of [
    "Judged repos: repo-edu@def456\nPlan: `../plan/example.md`",
    "Plan: `../plan/example.md`\nJudged repos: repo-edu@def456",
    "**Audit**\nJudged repos: repo-edu@def456\n[Plan](../plan/example.md)",
    "Plan: `first\nsecond`\nJudged repos: repo-edu@def456",
  ])
    assert.deepEqual(
      readAuditReport(
        `${opening}\n\n## Findings\n\nNo findings.`,
        "implementation",
      ),
      { findings: [], judgedRepos: ["repo-edu"] },
    )
})

test("missing, duplicate, quoted and malformed judged-repos openings fail", () => {
  for (const opening of [
    "",
    "> Judged repos: plan@abc123",
    "```text\nJudged repos: plan@abc123\n```",
    "Judged repos: plan@abc123\nJudged repos: repo-edu@def456",
    "Judged repos: other@abc123",
    "Judged repos: plan@HEAD",
    "Judged repos: plan@abc123, plan@def456",
    "Judged repos: repo-edu@def456, plan@abc123",
    "Judged repos: **plan@abc123**",
    "**Opening:** Judged repos: plan@abc123",
    "Judged repos: plan@abc123 `extra`",
    "`Example:\nJudged repos: plan@abc123\nEnd`",
    "Judged repos: plan@abc123\nPlan: `example.md`\nJudged repos: repo-edu@def456",
  ])
    assert.throws(
      () =>
        readAuditReport(
          `${opening}\n\n## Findings\n\nNo findings.`,
          "implementation",
        ),
      /Judged repos/,
    )
})

test("reports read explicit empty fields and count both planning fields", () => {
  assert.deepEqual(
    readReport(implementation("No findings."), "implementation"),
    [],
  )
  assert.deepEqual(
    readReport(
      planning("No excess findings.", "No missing findings."),
      "planning",
    ),
    [],
  )
  assert.deepEqual(
    readReport(
      planning(
        finding(1, "[field:excess] [section:decisions]"),
        finding(2, "[field:missing] [section:implementation-plan]"),
      ),
      "planning",
    ),
    [1, 2],
  )
  assert.deepEqual(
    readReport(
      planning(
        "No excess findings.",
        finding(1, "[field:missing] [area:tool-audit-round]"),
      ),
      "planning",
    ),
    [1],
  )
})

test("implementation reports count deferred findings at either repository's root", () => {
  assert.deepEqual(
    readReport(
      implementation(
        finding().replace(
          "Preserve the evidence",
          "Preserve `readReport` evidence",
        ),
      ),
      "implementation",
    ),
    [1],
  )
  assert.deepEqual(
    readReport(
      implementation(finding(1, "[plan:../plan/example.md#decisions]")),
      "implementation",
    ),
    [1],
  )
  assert.deepEqual(
    readReport(
      implementation(finding(1, "[section:decisions]")),
      "implementation",
    ),
    [1],
  )
})

test("Markdown quotes, nested evidence and code cannot introduce findings or empty-field sentences", () => {
  const examples = `${finding(27)}\nNo findings.`
  const quoted = examples
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n")
  const fenced = `\`\`\`md\n${examples}\n\`\`\``
  assert.deepEqual(
    readReport(
      implementation(`No findings.\n\n${quoted}\n\n${fenced}`),
      "implementation",
    ),
    [],
  )
  const evidence = `Explanation.\n\n${`${quoted}\n\n${fenced}`
    .split("\n")
    .map((line) => `   ${line}`)
    .join("\n")}\n`
  assert.deepEqual(
    readReport(
      implementation(finding(1, "[area:tool-audit-round]", evidence)),
      "implementation",
    ),
    [1],
  )
})

test("closing metadata belongs to the finding after nested list evidence", () => {
  for (const evidence of [
    "Explanation.\n\n   - First correction.\n   - Last correction.",
    "Explanation.\n\n   1. First option.\n   2. Last option.",
    "Explanation.\n\n   - Outer detail.\n     - Nested detail.",
    "Explanation.\n\n   - A **formatted** correction.\n",
  ]) {
    assert.deepEqual(
      readReport(
        implementation(
          `${finding(1, "[area:tool-audit-round]", evidence)}\n${finding(2)}`,
        ),
        "implementation",
      ),
      [1, 2],
    )
    assert.deepEqual(
      readReport(
        planning(
          "No excess findings.",
          finding(1, "[field:missing] [section:decisions]", evidence),
        ),
        "planning",
      ),
      [1],
    )
  }
  const body = Array.from({ length: 10 }, (_, index) => {
    const number = index + 1
    const indent = " ".repeat(String(number).length + 2)
    return `${number}. **C: Preserve closing metadata**\n\n${indent}- Evidence.\n${indent}[area:tool-audit-round] ${ratings}\n`
  }).join("\n")
  assert.deepEqual(
    readReport(implementation(body), "implementation"),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  )
})

test("metadata inside nested evidence cannot close a finding", () => {
  const tokens = `[area:tool-audit-round] ${ratings}`
  for (const evidence of [
    `- Evidence.\n     ${tokens}`,
    `- Evidence.\n\n     ${tokens}`,
    `> Evidence.\n   ${tokens}`,
    `> ${tokens}`,
    `- > Evidence.\n   ${tokens}`,
    `\`\`\`text\n   ${tokens}`,
    `- \`\`\`text\n     ${tokens}`,
    `    ${tokens}`,
    `\`Evidence\n   ${tokens}\n   \``,
    `- Evidence.\n   ${tokens}\n   More evidence.`,
  ])
    assert.throws(
      () =>
        readReport(
          implementation(
            `1. **C: Missing closing metadata**\n\n   ${evidence}`,
          ),
          "implementation",
        ),
      /Malformed finding/,
      evidence,
    )
})

test("malformed, contradictory or incomplete fields fail instead of reading clean", () => {
  for (const body of [
    "",
    "Nothing found.",
    "No **missing** findings.",
    `No findings.\n\n${finding()}`,
    "No findings.\n\nNo findings.",
    finding().replace("**B:", "**E:"),
    finding().replace("1.", "-"),
    finding().replace(
      "**B: Preserve the evidence**",
      "[B] Preserve the evidence",
    ),
    finding().replace(ratings, ""),
    finding().replace("[reach:developer] ", ""),
    finding().replace("[area:tool-audit-round] ", ""),
    finding(2),
    `${finding()}\n${finding()}`,
    `${finding()}\n${finding(3)}`,
    `${finding()}\n\n## Findings\n\nNo findings.`,
  ])
    assert.throws(
      () => readReport(implementation(body), "implementation"),
      Error,
      body,
    )
  assert.throws(() => readReport("No findings.", "implementation"), /Findings/)
  assert.throws(
    () =>
      readReport("## Excess functionality\n\nNo excess findings.", "planning"),
    /Missing functionality/,
  )
  assert.throws(
    () => readReport(planning("No excess findings.", ""), "planning"),
    /Missing functionality/,
  )
  assert.throws(
    () =>
      readReport(
        planning(
          finding(1, "[field:missing] [section:decisions]"),
          "No missing findings.",
        ),
        "planning",
      ),
    /tokens/,
  )
})

test("vet reads unconditional accepts with preamble notes", () => {
  assert.equal(
    readVet(
      "Drift since the audit.\n\n1. [B] Accept\n\n2. [C] Accept\n",
      [1, 2],
    ),
    true,
  )
  assert.equal(readVet("1. [B] Accept\r\n", [1]), true)
  assert.equal(readVet("No findings to vet.", []), true)
})

test("every other verdict or line after a verdict prevents skipping the rebuttal", () => {
  for (const verdict of ["Revise", "Drop", "Needs user's ruling"])
    assert.equal(readVet(`1. [B] ${verdict}`, [1]), false)
  for (const condition of [
    "unique",
    "corroborated",
    "Noted as a narrowing",
    "Explanation.",
    "## Summary",
    "`unique`",
    " unique",
    "corroborated: note",
  ])
    assert.equal(readVet(`1. [B] Accept\n${condition}`, [1]), false)
})

test("vet refuses missing, duplicate, out-of-order and malformed verdict numbers", () => {
  for (const source of [
    "No verdicts",
    "1. [B] Accept",
    "1. [B] Accept\n1. [B] Accept",
    "2. [B] Accept\n1. [C] Accept",
    "1. [B] Accept\n3. [C] Accept",
    "1. [B] Accept with a condition\n2. [C] Accept",
    "1. [b] Accept\n2. [C] Accept",
  ])
    assert.throws(() => readVet(source, [1, 2]), /numbers/, source)
  assert.throws(() => readVet("1. [B] Accept\n2. [C] Accept", [1]), /numbers/)
})

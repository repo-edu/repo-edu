import assert from "node:assert/strict"
import { test } from "node:test"
import { readReport } from "../report.js"
import { readVet } from "../vet.js"

const ratings = "[growth:none] [reach:developer] [complexity:none]"
function finding(
  number = 1,
  location = "[area:tool-audit-round]",
  evidence = "The defect loses evidence.",
): string {
  return `${number}. **B: Preserve the evidence**\n   ${evidence}\n   ${location} ${ratings}\n`
}
const implementation = (body: string) =>
  `# Audit\n\nOpening and coverage.\n\n## Findings\n\n${body}`
const planning = (excess: string, missing: string) =>
  `# Audit\n\n## Excess functionality\n\n${excess}\n\n## Missing functionality\n\n${missing}`

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

test("vet reads unconditional accepts with exact markers and preamble notes", () => {
  assert.equal(
    readVet(
      "Drift since the audit.\n\n1. [B] Accept\ncorroborated\n\n2. [C] Accept\nunique\n",
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

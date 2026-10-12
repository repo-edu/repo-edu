import assert from "node:assert/strict"
import { test } from "node:test"
import {
  complexityValues,
  reachValues,
  reportLocationTable,
} from "../finding-tokens.js"
import { readReport as readAuditReport, reportKind } from "../report.js"
import { readRebuttal, readVet } from "../vet.js"
import { roundGrammarExample, roundGrammarExamples } from "./round-grammar.js"

const readReport = (
  source: string,
  kind: "widening" | "detailing" | "implementation",
) => readAuditReport(source, kind).findings.map((finding) => finding.number)

function assertNamedRefusal(run: () => unknown, refusal: string | null): void {
  assert.notEqual(refusal, null)
  assert.throws(
    run,
    (error: unknown) => error instanceof Error && error.message === refusal,
    refusal ?? undefined,
  )
}

test("the round grammar's report examples are parser fixtures", () => {
  for (const example of roundGrammarExamples("report/")) {
    const kind = example.source.includes("Planning round workflow")
      ? "detailing"
      : "implementation"
    if (example.outcome === "parsed") {
      assert.doesNotThrow(
        () => readAuditReport(example.source, kind),
        example.id,
      )
    } else {
      assertNamedRefusal(
        () => readAuditReport(example.source, kind),
        example.refusal,
      )
    }
  }
})

test("every shared rating and location-table cell has its labelled report example", () => {
  const examples = roundGrammarExamples("report/")
  for (const reach of reachValues)
    assert.ok(
      examples.some((example) => example.source.includes(`[reach:${reach}]`)),
      reach,
    )
  for (const complexity of complexityValues)
    assert.ok(
      examples.some((example) =>
        example.source.includes(`[complexity:${complexity}]`),
      ),
      complexity,
    )
  for (const locations of Object.values(reportLocationTable)) {
    for (const cell of Object.values(locations)) {
      const example = roundGrammarExample(cell.caseId)
      assert.equal(example.outcome, cell.outcome, cell.caseId)
      assert.equal(
        example.refusal,
        cell.outcome === "refused" ? `Finding 1 has an ${cell.refusal}` : null,
        cell.caseId,
      )
    }
  }
})

test("report routing reads the named workflow only in the opening", () => {
  assert.equal(
    reportKind("# Planning round workflow\n\nJudged repos: plan@abc123"),
    "planning",
  )
  assert.equal(
    reportKind(
      "**Implementation audit workflow**\n\nJudged repos: plan@abc123",
    ),
    "implementation",
  )
  for (const source of [
    "Judged repos: plan@abc123",
    "> Planning round workflow",
    "```text\nImplementation audit workflow\n```",
    "# Audit\n\n## Findings\n\nPlanning round workflow",
    "Planning round workflow\n\nImplementation audit workflow",
  ])
    assert.throws(() => reportKind(source), /Report opening must name/)
})

const ratings = "[growth-pattern:none] [reach:developer] [complexity:none]"
function finding(
  number = 1,
  location = "[area:tool-audit-round]",
  evidence = "The defect loses evidence.",
): string {
  return `${number}. **B: Preserve the evidence**\n\n   ${location} ${ratings}\n\n   ${evidence}\n`
}
const implementation = (body: string) =>
  `# Implementation audit workflow\n\nJudged repos: plan@abc123, repo-edu@def456\n\nOpening and coverage.\n\n## Findings\n\n${body}`
const planning = (excess: string, missing: string) =>
  `# Planning round workflow\n\nJudged repos: plan@abc123\n\n## Excess functionality\n\n${excess}\n\n## Missing functionality\n\n${missing}`

test("the report opening identifies the judged repos independently of evidence", () => {
  for (const [line, judgedRepos] of [
    ["plan@abc123", ["plan"]],
    ["repo-edu@def456", ["repo-edu"]],
    ["plan@abc123, repo-edu@def456", ["plan", "repo-edu"]],
  ] as const) {
    assert.deepEqual(
      readAuditReport(
        `# Implementation audit workflow\n\nJudged repos: ${line}\n\n> Judged repos: other@abc123\n\n## Findings\n\nNo findings.`,
        "implementation",
      ),
      {
        findings: [],
        judgedRepos,
      },
    )
  }
})

test("planning reports judge only the plan repository", () => {
  const valid = planning("No excess findings.", "No missing findings.")
  for (const reportClass of ["widening", "detailing"] as const) {
    assert.deepEqual(readAuditReport(valid, reportClass).judgedRepos, ["plan"])
    for (const opening of [
      "Judged repos: repo-edu@def456",
      "Judged repos: plan@abc123, repo-edu@def456",
    ])
      assert.throws(
        () =>
          readAuditReport(
            valid.replace("Judged repos: plan@abc123", opening),
            reportClass,
          ),
        /Judged repos/,
      )
  }
})

test("plain judged-repos lines survive formatted neighbours in the same paragraph", () => {
  for (const opening of [
    "Judged repos: repo-edu@def456\nPlan: `../plan/example.md`",
    "Plan: `../plan/example.md`\nJudged repos: repo-edu@def456",
    "**Audit**\nJudged repos: repo-edu@def456\n[Plan](../plan/example.md)",
    "Plan: `first\nsecond`\nJudged repos: repo-edu@def456",
    "Implementation audit workflow  \nArtifact: `example.md`  \nPhase: implementation  \nJudged repos: repo-edu@def456",
  ])
    assert.deepEqual(
      readAuditReport(
        `# Implementation audit workflow\n\n${opening}\n\n## Findings\n\nNo findings.`,
        "implementation",
      ),
      {
        findings: [],
        judgedRepos: ["repo-edu"],
      },
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
          `# Implementation audit workflow\n\n${opening}\n\n## Findings\n\nNo findings.`,
          "implementation",
        ),
      /Judged repos/,
    )
})

test("settled reports carry findings and judged repositories after routing", () => {
  assert.deepEqual(
    readAuditReport(implementation("No findings."), "implementation"),
    { findings: [], judgedRepos: ["plan", "repo-edu"] },
  )
  assert.deepEqual(
    readAuditReport(
      planning("No excess findings.", "No missing findings."),
      "detailing",
    ),
    { findings: [], judgedRepos: ["plan"] },
  )
})

test("reports require the workflow that matches their class", () => {
  assert.throws(
    () =>
      readAuditReport(
        planning("No excess findings.", "No missing findings."),
        "implementation",
      ),
    /names the planning workflow but the reader expected implementation/,
  )
  assert.throws(
    () => readAuditReport(implementation("No findings."), "detailing"),
    /names the implementation workflow but the reader expected planning/,
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
      "detailing",
    ),
    [],
  )
  assert.deepEqual(
    readReport(
      planning(
        finding(1, "[field:excess] [section:decisions]"),
        finding(2, "[field:missing] [section:implementation-plan]").replace(
          "Preserve the evidence",
          "Keep the implementation steps",
        ),
      ),
      "detailing",
    ),
    [1, 2],
  )
  assert.deepEqual(
    readReport(
      planning(
        "No excess findings.",
        finding(1, "[field:missing] [section:decisions]"),
      ),
      "detailing",
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
      implementation(finding(1, "[plan:../plan/example.md#decisions]")).replace(
        "plan@abc123, repo-edu@def456",
        "repo-edu@def456",
      ),
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

test("reports retain every finding location and both deferral directions", () => {
  const planningFinding = readAuditReport(
    planning(
      finding(1, "[field:excess] [section:decisions]"),
      "No missing findings.",
    ),
    "detailing",
  ).findings[0]
  const planFinding = readAuditReport(
    implementation(finding(1, "[section:decisions]")).replace(
      "plan@abc123, repo-edu@def456",
      "plan@abc123",
    ),
    "implementation",
  ).findings[0]
  const repoFinding = readAuditReport(
    implementation(
      finding(1, "[area:pkg-application] [cover:cover-analysis-workflow]"),
    ).replace("plan@abc123, repo-edu@def456", "repo-edu@def456"),
    "implementation",
  ).findings[0]
  const planDeferral = readAuditReport(
    implementation(finding(1, "[plan:../plan/example.md#decisions]")).replace(
      "plan@abc123, repo-edu@def456",
      "repo-edu@def456",
    ),
    "implementation",
  ).findings[0]
  const repoDeferral = readAuditReport(
    implementation(
      finding(1, "[area:pkg-application] [cover:cover-analysis-workflow]"),
    ).replace("plan@abc123, repo-edu@def456", "plan@abc123"),
    "implementation",
  ).findings[0]

  assert.deepEqual(planningFinding?.location, {
    kind: "planning",
    field: "excess",
    section: "decisions",
  })
  assert.deepEqual(planFinding?.location, {
    kind: "plan",
    section: "decisions",
  })
  assert.deepEqual(repoFinding?.location, {
    kind: "repo-edu",
    area: "pkg-application",
    covers: ["cover-analysis-workflow"],
  })
  assert.deepEqual(planDeferral?.location, {
    kind: "deferred",
    repository: "plan",
    plan: "../plan/example.md#decisions",
  })
  assert.deepEqual(repoDeferral?.location, {
    kind: "deferred",
    repository: "repo-edu",
    area: "pkg-application",
    covers: ["cover-analysis-workflow"],
  })
})

test("report finding titles are unique across tiers", () => {
  assert.throws(
    () =>
      readAuditReport(
        implementation(`${finding()}\n${finding(2).replace("**B:", "**C:")}`),
        "implementation",
      ),
    /title appears more than once/,
  )
})

test("report finding titles cannot contain the record bullet delimiter", () => {
  assert.throws(
    () =>
      readReport(
        implementation(
          finding().replace("Preserve the evidence", "Head drift: stale sha"),
        ),
        "implementation",
      ),
    /title cannot contain ": "/,
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

test("opening metadata stays independent of nested list evidence", () => {
  for (const evidence of [
    "Explanation.\n\n   - First correction.\n   - Last correction.",
    "Explanation.\n\n   1. First option.\n   2. Last option.",
    "Explanation.\n\n   - Outer detail.\n     - Nested detail.",
    "Explanation.\n\n   - A **formatted** correction.\n",
  ]) {
    assert.deepEqual(
      readReport(
        implementation(
          `${finding(1, "[area:tool-audit-round]", evidence)}\n${finding(2).replace("Preserve the evidence", "Keep the second finding")}`,
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
        "detailing",
      ),
      [1],
    )
  }
  const body = Array.from({ length: 10 }, (_, index) => {
    const number = index + 1
    const indent = " ".repeat(String(number).length + 2)
    return `${number}. **C: Preserve opening metadata ${number}**\n\n${indent}[area:tool-audit-round] ${ratings}\n\n${indent}- Evidence.\n`
  }).join("\n")
  assert.deepEqual(
    readReport(implementation(body), "implementation"),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  )
})

test("metadata must follow the title before any evidence", () => {
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
    `Evidence.\n   ${tokens}`,
    `Evidence.\n\n   ${tokens}`,
    `<!-- lint note -->\n\n   Evidence.\n\n   ${tokens}`,
    `<!-- rumdl-disable-next-line MD013 -->\n   ${tokens}`,
    `<!-- rumdl-disable-next-line MD013 -->\n\n   ${tokens}`,
    `<!-- First note -->\n   <!-- Second note -->\n\n   ${tokens}`,
    `<!-- A note\n   spanning lines -->\n\n   ${tokens}`,
    `<div>Evidence.</div>\n\n   ${tokens}`,
    `<!-- lint note --><div>Evidence.</div><!-- another note -->\n\n   ${tokens}`,
    `<!-- ${tokens} -->`,
    `<!-- unclosed comment\n   ${tokens}`,
    `${tokens} **extra**`,
    `**${tokens}**`,
  ])
    assert.throws(
      () =>
        readReport(
          implementation(
            `1. **C: Missing opening metadata**\n\n   ${evidence}`,
          ),
          "implementation",
        ),
      /Malformed finding/,
      evidence,
    )
})

test("tokens follow the title with or without blank lines", () => {
  for (const separator of ["\n", "\n\n"]) {
    const body = `1. **C: Preserve metadata**${separator}   [area:tool-audit-round] ${ratings}${separator}   Evidence with **formatting**.`
    assert.deepEqual(readReport(implementation(body), "implementation"), [1])
    assert.deepEqual(
      readReport(
        implementation(body.replaceAll("\n", "\r\n")),
        "implementation",
      ),
      [1],
    )
  }
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
  assert.throws(
    () =>
      readReport(
        "# Implementation audit workflow\n\nJudged repos: repo-edu@abc123\n\nNo findings.",
        "implementation",
      ),
    /Findings/,
  )
  assert.throws(
    () =>
      readReport(
        "# Planning round workflow\n\nJudged repos: plan@abc123\n\n## Excess functionality\n\nNo excess findings.",
        "detailing",
      ),
    /Missing functionality/,
  )
  assert.throws(
    () => readReport(planning("No excess findings.", ""), "detailing"),
    /Missing functionality/,
  )
  assert.throws(
    () =>
      readReport(
        planning(
          finding(1, "[field:missing] [section:decisions]"),
          "No missing findings.",
        ),
        "detailing",
      ),
    /planning location/,
  )
})

const twoFindings = readAuditReport(
  implementation(
    `${finding()}\n${finding(2).replace("**B: Preserve the evidence", "**C: Keep the record")}`,
  ),
  "implementation",
).findings

test("the round grammar's vet examples cover every verdict and named refusal", () => {
  const findings = twoFindings.slice(0, 1)
  for (const example of roundGrammarExamples("vet/")) {
    if (example.outcome === "parsed") {
      assert.equal(readVet(example.source, findings).reviews.length, 1)
    } else {
      assertNamedRefusal(
        () => readVet(example.source, findings),
        example.refusal,
      )
    }
  }
})

test("the round grammar's rebuttal examples cover every answer and named refusal", () => {
  const findings = twoFindings.slice(0, 1)
  const reviews = [{ number: 1, tier: "B", verdict: "revise" }] as const
  for (const example of roundGrammarExamples("rebuttal/")) {
    if (example.outcome === "parsed") {
      assert.equal(readRebuttal(example.source, findings, reviews).length, 1)
    } else {
      assertNamedRefusal(
        () => readRebuttal(example.source, findings, reviews),
        example.refusal,
      )
    }
  }
})

test("vet reads accepts from verdict lines alone", () => {
  const reading = readVet(
    "Drift since the audit.\n\n1. [B] Accept\nThe finding is well grounded.\n\n2. [C] Accept\n",
    twoFindings,
  )
  assert.deepEqual(reading, {
    reviews: [
      { number: 1, tier: "B", verdict: "accept" },
      { number: 2, tier: "C", verdict: "accept" },
    ],
    allAccepted: true,
  })
  assert.equal(
    readVet("1. [B] Accept\r\n", twoFindings.slice(0, 1)).allAccepted,
    true,
  )
  assert.equal(
    readVet("1. [B] Accept  \n", twoFindings.slice(0, 1)).allAccepted,
    true,
  )
  assert.equal(readVet("No findings to vet.", []).allAccepted, true)
})

test("vet reads a verdict line that ends in a Markdown hard break", () => {
  assert.equal(
    readVet(
      "1. [B] Revise  \nUse the tree entry.\n\n2. [C] Accept",
      twoFindings,
    ).allAccepted,
    false,
  )
})

test("vet reads verdict lines with surrounding whitespace", () => {
  assert.deepEqual(
    readVet(" 1. [B] Revise ", twoFindings.slice(0, 1)).reviews,
    [{ number: 1, tier: "B", verdict: "revise" }],
  )
})

test("every verdict that needs an answer prevents skipping the rebuttal", () => {
  for (const verdict of ["Revise", "Drop", "Needs user's ruling"])
    assert.equal(
      readVet(`1. [B] ${verdict}`, twoFindings.slice(0, 1)).allAccepted,
      false,
    )
})

test("vet refuses missing, duplicate, out-of-order and malformed verdict numbers", () => {
  for (const source of [
    "No verdicts",
    "1. [B] Accept",
    "1. [B] Accept\n1. [B] Accept",
    "2. [B] Accept\n1. [C] Accept",
    "1. [B] Accept\n3. [C] Accept",
    "1. [b] Accept\n2. [C] Accept",
  ])
    assert.throws(() => readVet(source, twoFindings), /numbers/, source)
  assert.throws(
    () => readVet("1. [B] Accept\n2. [C] Accept", twoFindings.slice(0, 1)),
    /numbers/,
  )
})

test("vet and rebuttal refuse a header whose word is outside their list by name", () => {
  for (const source of [
    "1. [B] Agree\n2. [C] Accept",
    "1. [B] Accept with a condition\n2. [C] Accept",
  ])
    assert.throws(
      () => readVet(source, twoFindings),
      /^Error: Vet verdict 1 uses the word ".+"; use Accept, Revise, Drop or Needs user's ruling$/,
      source,
    )
  const reviews = readVet("1. [B] Accept\n2. [C] Drop", twoFindings).reviews
  assert.throws(
    () => readRebuttal("2. [C] Drop\n\nAgree.", twoFindings, reviews),
    /^Error: Rebuttal answer 2 uses the word "Drop"; use Agree, Contest or For user's ruling$/,
  )
})

test("rebuttal reads an ordered subset and retains each answer", () => {
  const reviews = readVet(
    "1. [B] Revise\nUse the tree entry.\n\n2. [C] Needs user's ruling",
    twoFindings,
  ).reviews
  assert.deepEqual(
    readRebuttal(
      "1. [B] Agree\nExplanation.\n\n2. [C] For user's ruling\n",
      twoFindings,
      reviews,
    ),
    [
      { number: 1, tier: "B", answer: "agree" },
      { number: 2, tier: "C", answer: "for-user-ruling" },
    ],
  )
  assert.throws(
    () => readRebuttal("2. [C] Contest\n1. [B] Agree", twoFindings, reviews),
    /order/,
  )
})

test("rebuttal reads answer lines with surrounding whitespace", () => {
  const findings = twoFindings.slice(0, 1)
  const reviews = readVet("1. [B] Revise", findings).reviews

  assert.deepEqual(readRebuttal(" 1. [B] Agree ", findings, reviews), [
    { number: 1, tier: "B", answer: "agree" },
  ])
})

test("rebuttal omits accepted findings and answers changed verdicts", () => {
  const reviews = readVet(
    "1. [B] Accept\nThe finding is well grounded.\n\n2. [C] Revise\nUse the tree entry.",
    twoFindings,
  ).reviews
  assert.deepEqual(
    readRebuttal(
      "2. [C] Contest\nKeep the original wording.",
      twoFindings,
      reviews,
    ),
    [{ number: 2, tier: "C", answer: "contest" }],
  )

  for (const verdict of ["Revise", "Drop", "Needs user's ruling"]) {
    const changed = readVet(
      `1. [B] ${verdict}`,
      twoFindings.slice(0, 1),
    ).reviews
    assert.throws(
      () =>
        readRebuttal(
          "Unrecognised answer form",
          twoFindings.slice(0, 1),
          changed,
        ),
      /answer for finding 1/,
    )
  }
})

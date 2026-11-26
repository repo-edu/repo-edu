import assert from "node:assert/strict"
import { test } from "node:test"
import { phaseResultContract } from "../phase-result-schema.js"
import { type AuditScope, auditReport, auditSchema } from "../report.js"
import { rulerReport, rulerSchema, unopenedSources } from "../ruler-report.js"
import { rebuttalReport, rebuttalSchema, vetReport, vetSchema } from "../vet.js"
import { pinned } from "./configured-runner.js"
import { testContext } from "./helpers.js"

const finding = {
  title: "Keep the record",
  tier: "C",
  growthPattern: "none",
  reach: "developer",
  rarity: "ordinary",
  harm: null,
  complexity: "none",
  evidence: "The source **holds**.",
} as const
const planning: AuditScope = {
  target: "example-widen.md",
  planPhase: "widening",
  heads: [{ repository: "plan", head: "abc12345" }],
}
const findings = [{ number: 2, tier: "C" as const }]

test("the audit writer numbers excess first and preserves evidence and settling", () => {
  const answer = auditSchema(planning).parse({
    opening: "Opening evidence.",
    findings: [
      {
        ...finding,
        location: { kind: "planning", field: "missing", section: "decisions" },
      },
      {
        ...finding,
        location: { kind: "planning", field: "excess", section: "decisions" },
      },
    ],
    settling: { recommendation: "settle", reason: "The shape holds." },
  })
  const { text, report } = auditReport(planning, answer)
  assert.match(
    text,
    /^# Planning round workflow\n\nTarget: example-widen\.md\nJudged repos: plan@abc123/m,
  )
  assert.match(
    text,
    /## Excess functionality\n\n### 1\. C: Keep the record\n\n\[field:excess\].*\n\nThe source \*\*holds\*\*\./,
  )
  assert.match(text, /## Missing functionality\n\n### 2\. C: Keep the record/)
  assert.match(text, /Settling: settle\. The shape holds\.$/)
  assert.deepEqual(
    report.findings.map(({ number }) => number),
    [1, 2],
  )
  assert.equal(
    auditSchema(planning).safeParse({
      ...answer,
      findings: [{ ...answer.findings[0], harm: "low" }],
    }).success,
    false,
  )
})

test("the implementation audit schema admits only locations allowed by the judged repos", () => {
  const plan = { repository: "plan", head: "abc12345" } as const
  const edu = { repository: "repo-edu", head: "def12345" } as const
  const locations = [
    { kind: "plan", section: "decisions" },
    { kind: "repo-edu", area: "tool-audit-round", covers: [] },
    {
      kind: "deferred",
      repository: "repo-edu",
      area: "tool-audit-round",
      covers: [],
    },
    { kind: "deferred", repository: "plan", plan: "example.md#decisions" },
  ]
  for (const [heads, expected] of [
    [[plan], [true, false, true, false]],
    [[edu], [false, true, false, true]],
    [
      [plan, edu],
      [true, true, false, false],
    ],
  ] as const) {
    const schema = auditSchema({
      target: "example.md 2",
      planPhase: null,
      heads,
    })
    assert.deepEqual(
      locations.map(
        (location) =>
          schema.safeParse({
            opening: "",
            findings: [{ ...finding, location }],
            settling: null,
          }).success,
      ),
      expected,
    )
  }
})

test("the exported audit contracts omit lookaheads and still check finding text", () => {
  const repoOnly: AuditScope = {
    target: "example.md 2",
    planPhase: null,
    heads: [{ repository: "repo-edu", head: "def12345" }],
  }
  for (const reportScope of [planning, repoOnly]) {
    const contract = phaseResultContract({
      ...testContext(
        "/repo-edu",
        reportScope.planPhase === null ? "implementation" : "planning",
      ),
      assistant: "codex",
      model: pinned("codex"),
      phase: "audit",
      arguments: ["audit.md", reportScope.target],
      reportScope,
      sessionId: null,
    })
    JSON.parse(contract.schema, (key, value: unknown) => {
      if (key === "pattern" && typeof value === "string")
        assert.doesNotMatch(value, /^\^\(\?[=!]/)
      return value
    })
  }

  const schema = auditSchema(repoOnly)
  const accepts = (title: string, plan: string) =>
    schema.safeParse({
      opening: "",
      findings: [
        {
          ...finding,
          title,
          location: { kind: "deferred", repository: "plan", plan },
        },
      ],
      settling: null,
    }).success
  assert.ok(accepts("Review area:tool-audit-round", " example.md#decisions "))
  assert.ok(!accepts("Review area: tool-audit-round", "example.md"))
  for (const plan of ["", " \t", "example].md", "example\n.md"])
    assert.ok(!accepts(finding.title, plan))
})

test("vet and rebuttal use the runner's finding identities and panel", () => {
  const vet = vetSchema(findings)
  const revised = {
    verdict: "revise",
    revisedTier: "B",
    explanation: "The reason.",
  }
  const { reviews, text } = vetReport(
    findings,
    vet.parse({ headDrift: "", verdicts: { 2: revised } }),
  )
  assert.equal(text, "2. [C] Revise to [B]\n\nThe reason.")
  assert.throws(() =>
    vet.parse({
      headDrift: "",
      verdicts: { 2: { ...revised, revisedTier: "C" } },
    }),
  )
  assert.throws(() => vet.parse({ headDrift: "", verdicts: { 1: revised } }))
  const panel = [
    { vet: "obx", reviews },
    { vet: "abx", reviews: [{ number: 2, tier: "C", verdict: "accept" }] },
  ] as const
  const rebut = rebuttalSchema(findings, panel)
  const entry = { answer: "agree", explanation: "The change holds." }
  const reply = rebuttalReport(
    findings,
    panel,
    rebut.parse({ answers: { 2: { obx: entry } } }),
  )
  assert.equal(reply.text, "2. [C] [obx] Agree\n\nThe change holds.")
  assert.throws(() =>
    rebut.parse({ answers: { 2: { obx: entry, abx: entry } } }),
  )
  assert.throws(() => rebut.parse({ answers: {} }))
})

test("the ruler writes each named source and checks it against tool calls", () => {
  const schema = rulerSchema(findings, ["obx"])
  const answer = {
    points: [
      {
        question: "Does it stand?",
        sources: [
          { source: "/repo/plan.md", place: "Decision 1" },
          { source: "abc123", place: null },
        ],
        record: "The decision covers the case.",
      },
    ],
    winner: ["obx"],
    reason: "The decision holds.",
    openChoice: "Which option applies?",
  }
  const { text, reading } = rulerReport(
    findings,
    schema.parse({ headDrift: "", findings: { 2: answer } }),
  )
  assert.match(
    text,
    /- Opened: `\/repo\/plan\.md`, Decision 1\n- Opened: `abc123`\./,
  )
  assert.match(
    text,
    /Winner: obx\. The decision holds\.\nOpen choice: Which option applies\?/,
  )
  assert.deepEqual(
    unopenedSources(reading.sources, ["Read /repo/plan.md"], []),
    ["abc123"],
  )
  assert.deepEqual(
    unopenedSources(reading.sources, ["git show abc123"], ["/repo/plan.md"]),
    [],
  )
  assert.throws(() =>
    schema.parse({
      headDrift: "",
      findings: { 2: { ...answer, winner: ["abx"] } },
    }),
  )
})

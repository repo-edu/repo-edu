import assert from "node:assert/strict"
import { access, readFile } from "node:fs/promises"
import { join } from "node:path"
import { test } from "node:test"
import {
  type ImplementationRoundData,
  type PlanningRoundData,
  parseRoundDataFile,
  type ReportFinding,
  type RoundFinding,
  readPlanRoundData,
  reviewedRoundFindings,
  settleRoundFindings,
  writeRoundData,
} from "../round-data.js"
import { fixture } from "./helpers.js"

const settings: ImplementationRoundData["settings"] = {
  audit: {
    claude: { model: "claude-opus-5", effort: "xhigh" },
    codex: { model: "gpt-6-astra", effort: "xhigh" },
  },
  vet: {
    claude: { model: "claude-opus-5", effort: "high" },
    codex: { model: "gpt-6.1-sol", effort: "high" },
  },
  fix: { assistant: "codex", model: "gpt-6.1-sol", effort: "high" },
}

const reportFinding = (
  number: number,
  title: string,
  tier: ReportFinding["tier"] = "B",
  reach: ReportFinding["reach"] = "developer",
): ReportFinding => ({
  number,
  title,
  tier,
  reach,
  complexity: "none",
  growthPattern: "none",
  location: { kind: "repo-edu", area: "tool-audit-round", covers: [] },
})

const entry = (
  target: string,
  round: number,
  status: ImplementationRoundData["status"] = "finished",
): ImplementationRoundData => ({
  target,
  round,
  tag: "oth",
  started: `2026-10-${String(round).padStart(2, "0")}T10:00:00.000Z`,
  status,
  settings,
  auditor: {
    assistant: "codex",
    model: "gpt-6.1-sol",
    effort: "high",
    chosenBy: "settings",
  },
  phases: [],
  commits: [],
  findings: [],
  judge: null,
  scope: "all",
  judgedRepos: ["repo-edu"],
})

test("per-plan data replaces a target round in place and appends new identities", async (t) => {
  const f = await fixture(t)
  const path = join(f.root, "example-impl-rounds.json")
  writeRoundData(path, entry("example-impl-all", 1, "in-progress"))
  writeRoundData(path, entry("example-impl-all", 2))
  writeRoundData(path, entry("example-impl-all", 1, "failed"))

  const rounds = parseRoundDataFile(path, await readFile(path, "utf8"))
  assert.deepEqual(
    rounds.map(({ round, status }) => ({ round, status })),
    [
      { round: 1, status: "failed" },
      { round: 2, status: "finished" },
    ],
  )
  await assert.rejects(access(`${path}.tmp`), { code: "ENOENT" })
})

test("round data admits every end state", async (t) => {
  const f = await fixture(t)
  const path = join(f.root, "example-impl-rounds.json")
  const statuses = [
    "in-progress",
    "finished",
    "failed",
    "interrupted",
    "awaiting-ruling",
  ] as const
  statuses.forEach((status, index) => {
    writeRoundData(path, entry(`example-impl-${index + 1}`, 1, status))
  })
  assert.deepEqual(
    parseRoundDataFile(path, await readFile(path, "utf8")).map(
      (round) => round.status,
    ),
    statuses,
  )
})

test("a plan's watch evidence reads both round kinds and their trajectory fields", async (t) => {
  const f = await fixture(t)
  const {
    scope: _scope,
    judgedRepos: _judgedRepos,
    ...common
  } = entry("example-plan", 1, "finished")
  const planning: PlanningRoundData = {
    ...common,
    phase: "detailing",
    findings: [
      {
        ...reportFinding(1, "Dropped plan finding"),
        location: {
          kind: "planning",
          field: "missing",
          section: "Decisions",
        },
        vetVerdict: "drop",
        rebuttalAnswer: "agree",
        outcome: "dropped",
        finalTier: null,
        finalReach: null,
      },
    ],
  }
  const implementation: ImplementationRoundData = {
    ...entry("example-impl-all", 2, "failed"),
    phases: [
      {
        phase: "audit",
        assistant: "codex",
        model: "gpt-6.1-sol",
        effort: "high",
        milliseconds: 1200,
        tokens: [],
        peakContext: { tokens: 90_000, window: 100_000 },
        compactions: 1,
      },
    ],
  }
  writeRoundData(join(f.root, "example-plan-rounds.json"), planning)
  writeRoundData(join(f.root, "example-impl-rounds.json"), implementation)

  const evidence = await readPlanRoundData(f.root, "example")
  assert.equal(evidence.planning?.[0]?.findings[0]?.outcome, "dropped")
  assert.equal(evidence.implementation?.[0]?.status, "failed")
  assert.equal(evidence.implementation?.[0]?.phases[0]?.compactions, 1)
})

test("a plan's watch evidence omits a round kind whose file is absent", async (t) => {
  const f = await fixture(t)
  writeRoundData(
    join(f.root, "example-impl-rounds.json"),
    entry("example-impl-all", 1),
  )

  assert.deepEqual(await readPlanRoundData(f.root, "example"), {
    implementation: [entry("example-impl-all", 1)],
  })
})

test("review and rebuttal outcomes stay attached to report finding identity", () => {
  assert.deepEqual(
    reviewedRoundFindings(
      [reportFinding(1, "Reviewed finding")],
      [
        {
          number: 1,
          tier: "B",
          verdict: "revise",
          conditional: true,
        },
      ],
      [{ number: 1, tier: "B", answer: "contest" }],
    ),
    [
      {
        ...reportFinding(1, "Reviewed finding"),
        vetVerdict: "revise",
        rebuttalAnswer: "contest",
        outcome: null,
        finalTier: null,
        finalReach: null,
      },
    ],
  )
})

test("one finding recorded in both repositories settles once from the first record", () => {
  const findings = reviewedRoundFindings([
    reportFinding(1, "Shared correction", "B", "ordinary"),
  ])
  const settled = settleRoundFindings(findings, [
    {
      repository: "repo-edu",
      subject:
        "example/impl-audit-all oth growth-none B1 fix(audit-round): settle findings",
      message:
        "- [B] [area:tool-audit-round] [growth-pattern:none] [reach:rare] [complexity:none] Shared correction: Apply the code correction.",
    },
    {
      repository: "plan",
      subject:
        "example/impl-audit-all oth growth-none c1 docs(audit): settle findings",
      message:
        "- C [section:decisions] [growth-pattern:none] [reach:developer] [complexity:none] Shared correction: Apply the plan correction.",
    },
  ])

  assert.deepEqual(settled, [
    {
      ...findings[0],
      outcome: "kept",
      finalTier: null,
      finalReach: "rare",
    },
  ])
})

test("one repository cannot record the same finding title twice", () => {
  const record = {
    repository: "repo-edu" as const,
    subject:
      "example/impl-audit-all oth growth-none B1 fix(audit-round): settle findings",
    message:
      "- [B] [area:tool-audit-round] [growth-pattern:none] [reach:developer] [complexity:none] Repeated correction: Apply the correction.",
  }
  assert.throws(
    () => settleRoundFindings([], [record, record]),
    /title appears more than once/,
  )
})

test("record titles settle kept, dropped, narrowed and unmatched findings", () => {
  const findings = reviewedRoundFindings([
    reportFinding(1, "Kept finding"),
    reportFinding(2, "Dropped finding", "C"),
    reportFinding(3, "Narrowed finding", "B", "ordinary"),
  ])
  const records = [
    {
      repository: "repo-edu" as const,
      subject:
        "example/impl-audit-all oth growth-none B1C1d1 fix(audit-round): settle findings",
      message: [
        "- [B] [area:tool-audit-round] [growth-pattern:none] [reach:developer] [complexity:none] Kept finding: Retain the correction.",
        "- [C] [area:tool-audit-round] [growth-pattern:none] [reach:ordinary] [complexity:none] Narrowed finding: Keep the narrower result.",
        "- [D] [area:tool-audit-round] [growth-pattern:none] [reach:developer] [complexity:none] Unmatched finding: Record work found during the fix.",
      ].join("\n"),
    },
  ]

  const settled = settleRoundFindings(findings, records)
  const summary = Object.fromEntries(
    settled.map((finding) => [
      finding.title,
      {
        number: finding.number,
        outcome: finding.outcome,
        finalTier: finding.finalTier,
        finalReach: finding.finalReach,
      },
    ]),
  )
  assert.deepEqual(summary, {
    "Kept finding": {
      number: 1,
      outcome: "kept",
      finalTier: null,
      finalReach: null,
    },
    "Dropped finding": {
      number: 2,
      outcome: "dropped",
      finalTier: null,
      finalReach: null,
    },
    "Narrowed finding": {
      number: 3,
      outcome: "kept",
      finalTier: "C",
      finalReach: null,
    },
    "Unmatched finding": {
      number: null,
      outcome: "unmatched",
      finalTier: null,
      finalReach: null,
    },
  } satisfies Record<
    string,
    Pick<RoundFinding, "number" | "outcome" | "finalTier" | "finalReach">
  >)
})

import assert from "node:assert/strict"
import { access, readFile } from "node:fs/promises"
import { join } from "node:path"
import { test } from "node:test"
import {
  type ImplementationRoundData,
  parseRoundDataFile,
  type ReportFinding,
  type RoundFinding,
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

test("review and rebuttal outcomes stay attached to report finding identity", () => {
  assert.deepEqual(
    reviewedRoundFindings(
      [reportFinding(1, "Reviewed finding")],
      [{ number: 1, tier: "B", verdict: "revise" }],
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

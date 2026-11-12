import assert from "node:assert/strict"
import { access, mkdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { test } from "node:test"
import {
  type CommitRoundData,
  type ImplementationRoundData,
  type PlanningRoundData,
  parseRoundDataFile,
  type ReportFinding,
  type RoundFinding,
  readPlanRoundData,
  reviewedRoundFindings,
  roundDataFilename,
  roundDataFiles,
  settleRoundFindings,
  writeDisprovedFinding,
  writeRoundData,
} from "../round-data.js"
import { fixture } from "./helpers.js"

const settings: ImplementationRoundData["settings"] = {
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
  scope: "1",
  judgedRepos: ["repo-edu"],
})

const commitEntry = (
  target: string,
  round: number,
  status: CommitRoundData["status"] = "finished",
): CommitRoundData => {
  const { scope: _scope, ...common } = entry(target, round, status)
  const group = {
    repository: "repo-edu" as const,
    commits: ["a".repeat(40)],
    startingHead: "b".repeat(40),
  }
  return {
    ...common,
    originalGroups: [group],
    groups: [group],
  }
}

test("round data names both files from the round kind", () => {
  assert.equal(
    roundDataFilename("example", "planning"),
    "example-plan-rounds.json",
  )
  assert.equal(
    roundDataFilename("example", "implementation"),
    "example-impl-rounds.json",
  )
  assert.equal(
    roundDataFilename("commit-abc123", "commit"),
    "commit-abc123-rounds.json",
  )
})

test("commit data replaces a target round in place and appends new identities", async (t) => {
  const f = await fixture(t)
  const path = join(f.runtime.activeRoot, "commit-abc123-rounds.json")
  writeRoundData(path, commitEntry("commit-abc123", 1, "in-progress"))
  writeRoundData(path, commitEntry("commit-abc123", 2))
  writeRoundData(path, commitEntry("commit-abc123", 1, "finished"))

  const file = parseRoundDataFile(path, await readFile(path, "utf8"))
  assert.deepEqual(
    file.rounds.map(({ round, status }) => ({ round, status })),
    [
      { round: 1, status: "finished" },
      { round: 2, status: "finished" },
    ],
  )
  assert.equal("disproved" in file, false)
  await assert.rejects(access(`${path}.tmp`), { code: "ENOENT" })
})

test("per-plan data replaces a target round in place and appends new identities", async (t) => {
  const f = await fixture(t)
  const path = join(f.runtime.activeRoot, "example-impl-rounds.json")
  writeRoundData(path, entry("example-impl-audit-01..01", 1, "in-progress"))
  writeRoundData(path, entry("example-impl-audit-01..01", 2))
  writeRoundData(path, entry("example-impl-audit-01..01", 1, "failed"))

  const file = parseRoundDataFile(path, await readFile(path, "utf8"))
  assert.ok("disproved" in file)
  assert.deepEqual(
    file.rounds.map(({ round, status }) => ({ round, status })),
    [
      { round: 1, status: "failed" },
      { round: 2, status: "finished" },
    ],
  )
  assert.deepEqual(file.disproved, [])
  await assert.rejects(access(`${path}.tmp`), { code: "ENOENT" })
})

test("round data admits every end state", async (t) => {
  const f = await fixture(t)
  const path = join(f.runtime.activeRoot, "example-impl-rounds.json")
  const statuses = [
    "in-progress",
    "finished",
    "failed",
    "interrupted",
    "awaiting-ruling",
  ] as const
  statuses.forEach((status, index) => {
    writeRoundData(path, entry(`example-impl-audit-${index + 1}`, 1, status))
  })
  assert.deepEqual(
    parseRoundDataFile(path, await readFile(path, "utf8")).rounds.map(
      (round) => round.status,
    ),
    statuses,
  )
})

test("round data admits the series answer, resolved pool and model settings", async (t) => {
  const f = await fixture(t)
  const path = join(f.runtime.activeRoot, "example-impl-rounds.json")
  const parse = (round: unknown) =>
    parseRoundDataFile(path, JSON.stringify({ rounds: [round], disproved: [] }))
  const judged = {
    ...entry("example-impl-audit-01..01", 1),
    pool: [
      { assistant: "claude", model: "claude-opus-5", effort: "xhigh" },
      { assistant: "codex", model: "gpt-6.1-sol", effort: "high" },
    ],
    judge: {
      answer: { assistant: "claude", model: "claude-opus-5", effort: "xhigh" },
      reason: "Opus has the higher expected yield.",
    },
  }

  assert.deepEqual(parse(judged).rounds[0].judge, judged.judge)
  assert.deepEqual(parse(judged).rounds[0].pool, judged.pool)
  assert.equal(parse({ ...judged, pool: undefined }).rounds[0].pool, undefined)
  assert.throws(() =>
    parse({ ...judged, judge: { ...judged.judge, answer: "claude" } }),
  )
  assert.throws(() =>
    parse({
      ...judged,
      settings: {
        ...settings,
        audit: { claude: settings.vet.claude, codex: settings.vet.codex },
      },
    }),
  )
})

test("round data stores a vet tier that differs from the report tier", async (t) => {
  const f = await fixture(t)
  const path = join(f.runtime.activeRoot, "example-impl-rounds.json")
  const findings = reviewedRoundFindings(
    [reportFinding(1, "Retiered finding")],
    [{ number: 1, tier: "B", verdict: "revise", vetTier: "C" }],
  )

  writeRoundData(path, {
    ...entry("example-impl-audit-01..01", 1),
    findings: [...findings],
  })

  const file = parseRoundDataFile(path, await readFile(path, "utf8"))
  assert.equal(file.rounds[0]?.findings[0]?.vetTier, "C")
})

test("round data stores a contested verdict's user winner and reason together", async (t) => {
  const f = await fixture(t)
  const path = join(f.runtime.activeRoot, "example-impl-rounds.json")
  const [finding] = reviewedRoundFindings(
    [reportFinding(1, "Ruled contest")],
    [{ number: 1, tier: "B", verdict: "drop" }],
    [{ number: 1, tier: "B", answer: "contest" }],
  )
  assert.ok(finding)
  const ruled = {
    ...finding,
    rulingWinner: "vet" as const,
    rulingReason: "The vet applied the current contract.",
  }

  writeRoundData(path, {
    ...entry("example-impl-audit-01..01", 1),
    findings: [ruled],
  })

  const stored = parseRoundDataFile(path, await readFile(path, "utf8"))
    .rounds[0]?.findings[0]
  assert.equal(stored?.rulingWinner, "vet")
  assert.equal(stored?.rulingReason, "The vet applied the current contract.")
  assert.throws(() =>
    writeRoundData(path, {
      ...entry("example-impl-audit-01..01", 1),
      findings: [{ ...finding, rulingWinner: "vet" }],
    }),
  )
  assert.throws(() =>
    writeRoundData(path, {
      ...entry("example-impl-audit-01..01", 1),
      findings: [{ ...ruled, rulingReason: "First line.\nSecond line." }],
    }),
  )
})

test("a plan's watch evidence reads both round kinds and their trajectory fields", async (t) => {
  const f = await fixture(t)
  const {
    scope: _scope,
    judgedRepos: _judgedRepos,
    ...common
  } = entry("example-plan-audit", 1, "finished")
  const planning: PlanningRoundData = {
    ...common,
    phase: "detailing",
    settling: "",
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
    ...entry("example-impl-audit-01..01", 2, "failed"),
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
  writeRoundData(
    join(f.runtime.activeRoot, "example-plan-rounds.json"),
    planning,
  )
  writeRoundData(
    join(f.runtime.activeRoot, "example-impl-rounds.json"),
    implementation,
  )

  const evidence = await readPlanRoundData(f.runtime.activeRoot, "example")
  assert.equal(evidence.planning?.[0]?.findings[0]?.outcome, "dropped")
  assert.equal(evidence.implementation?.[0]?.status, "failed")
  assert.equal(evidence.implementation?.[0]?.phases[0]?.compactions, 1)
})

test("planning round data rejects history without the required settling", async (t) => {
  const f = await fixture(t)
  const {
    scope: _scope,
    judgedRepos: _judgedRepos,
    ...common
  } = entry("example-plan-audit", 1)
  const path = join(f.runtime.activeRoot, "example-plan-rounds.json")

  assert.throws(() =>
    parseRoundDataFile(
      path,
      JSON.stringify({
        rounds: [{ ...common, phase: "widening" }],
        disproved: [],
      }),
    ),
  )
})

test("round data stores attached and detached disproved findings beside rounds", async (t) => {
  const f = await fixture(t)
  const path = join(f.runtime.activeRoot, "example-impl-rounds.json")
  writeRoundData(path, entry("example-impl-audit-01..01", 1))
  writeDisprovedFinding(path, {
    date: "2026-11-05",
    reason: "The retained evidence disproves the claim.",
    target: "example-impl-audit-01..01",
    round: 1,
    finding: 2,
  })
  writeDisprovedFinding(path, {
    date: "2026-11-05",
    reason: "The finding never reached retained round data.",
    auditor: { model: "gpt-5.6-sol", effort: "xhigh" },
  })

  const file = parseRoundDataFile(path, await readFile(path, "utf8"))
  assert.ok("disproved" in file)
  assert.equal(file.rounds.length, 1)
  assert.deepEqual(file.disproved, [
    {
      date: "2026-11-05",
      reason: "The retained evidence disproves the claim.",
      target: "example-impl-audit-01..01",
      round: 1,
      finding: 2,
    },
    {
      date: "2026-11-05",
      reason: "The finding never reached retained round data.",
      auditor: { model: "gpt-5.6-sol", effort: "xhigh" },
    },
  ])
})

test("a second ruling on the same finding replaces the first while detached rulings append", async (t) => {
  const f = await fixture(t)
  const path = join(f.runtime.activeRoot, "example-impl-rounds.json")
  writeRoundData(path, entry("example-impl-audit-01..01", 1))
  writeDisprovedFinding(path, {
    date: "2026-11-05",
    reason: "The first wording of the reason.",
    target: "example-impl-audit-01..01",
    round: 1,
    finding: 2,
  })
  writeDisprovedFinding(path, {
    date: "2026-11-05",
    reason: "The finding never reached retained round data.",
    auditor: { model: "gpt-5.6-sol", effort: "xhigh" },
  })
  writeDisprovedFinding(path, {
    date: "2026-11-06",
    reason: "The reworded reason.",
    target: "example-impl-audit-01..01",
    round: 1,
    finding: 2,
  })
  writeDisprovedFinding(path, {
    date: "2026-11-06",
    reason: "A second finding the retained data never held.",
    auditor: { model: "gpt-5.6-sol", effort: "xhigh" },
  })

  const file = parseRoundDataFile(path, await readFile(path, "utf8"))
  assert.ok("disproved" in file)
  assert.deepEqual(file.disproved, [
    {
      date: "2026-11-05",
      reason: "The finding never reached retained round data.",
      auditor: { model: "gpt-5.6-sol", effort: "xhigh" },
    },
    {
      date: "2026-11-06",
      reason: "The reworded reason.",
      target: "example-impl-audit-01..01",
      round: 1,
      finding: 2,
    },
    {
      date: "2026-11-06",
      reason: "A second finding the retained data never held.",
      auditor: { model: "gpt-5.6-sol", effort: "xhigh" },
    },
  ])
})

test("a disproved finding can create an empty round-data file", async (t) => {
  const f = await fixture(t)
  const path = join(f.runtime.activeRoot, "example-plan-rounds.json")
  writeDisprovedFinding(path, {
    date: "2026-11-05",
    reason: "The finding predates retained round data.",
    auditor: { model: "gpt-5.6-sol", effort: "xhigh" },
  })

  assert.deepEqual(parseRoundDataFile(path, await readFile(path, "utf8")), {
    rounds: [],
    disproved: [
      {
        date: "2026-11-05",
        reason: "The finding predates retained round data.",
        auditor: { model: "gpt-5.6-sol", effort: "xhigh" },
      },
    ],
  })
})

test("a plan's watch evidence omits a round kind whose file is absent", async (t) => {
  const f = await fixture(t)
  writeRoundData(
    join(f.runtime.activeRoot, "example-impl-rounds.json"),
    entry("example-impl-audit-01..01", 1),
  )

  assert.deepEqual(await readPlanRoundData(f.runtime.activeRoot, "example"), {
    implementation: [entry("example-impl-audit-01..01", 1)],
  })
})

test("active and closed episodes read their own reused stem", async (t) => {
  const f = await fixture(t)
  const archive = join(f.runtime.planRoot, "archive", "example")
  await mkdir(archive, { recursive: true })
  writeRoundData(
    join(f.runtime.activeRoot, "example-impl-rounds.json"),
    entry("example-impl-audit-01..01", 1),
  )
  writeRoundData(
    join(archive, "example-impl-rounds.json"),
    entry("example-impl-audit-01..01", 2),
  )

  assert.deepEqual(await readPlanRoundData(f.runtime.activeRoot, "example"), {
    implementation: [entry("example-impl-audit-01..01", 1)],
  })
  assert.deepEqual(await readPlanRoundData(archive, "example"), {
    implementation: [entry("example-impl-audit-01..01", 2)],
  })
})

test("round data discovery ignores archive directories with data-file names", async (t) => {
  const f = await fixture(t)
  const archive = join(f.runtime.planRoot, "archive")
  const path = join(archive, "example", "example-impl-rounds.json")
  await mkdir(join(archive, "sample-plan-rounds.json"), { recursive: true })
  await mkdir(join(archive, "example"), { recursive: true })
  writeRoundData(path, entry("example-impl-audit-01..01", 1))

  assert.deepEqual(await roundDataFiles(f.runtime), [path])
})

test("plan round data discovery ignores commit round data", async (t) => {
  const f = await fixture(t)
  const path = join(f.runtime.activeRoot, "commit-abc123-rounds.json")
  writeRoundData(path, commitEntry("commit-abc123", 1))

  assert.deepEqual(await roundDataFiles(f.runtime), [])
  assert.deepEqual(
    await readPlanRoundData(f.runtime.activeRoot, "commit-abc123"),
    {},
  )
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
          vetTier: "C",
        },
      ],
      [{ number: 1, tier: "B", answer: "contest" }],
    ),
    [
      {
        ...reportFinding(1, "Reviewed finding"),
        vetVerdict: "revise",
        vetTier: "C",
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
        "example/impl-audit-1 oth growth-none B1 fix(audit-round): settle findings",
      message:
        "- [B] [finding:1] [area:tool-audit-round] [growth-pattern:none] [reach:rare] [complexity:none] Shared correction: Apply the code correction.",
    },
    {
      repository: "plan",
      subject:
        "example/impl-audit-1 oth growth-none c1 docs(audit): settle findings",
      message:
        "- C [finding:1] [section:decisions] [growth-pattern:none] [reach:developer] [complexity:none] Shared plan correction: Apply the plan correction.",
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

test("one repository cannot record the same finding number or unnumbered title twice", () => {
  const record = {
    repository: "repo-edu" as const,
    subject:
      "example/impl-audit-1 oth growth-none B1 fix(audit-round): settle findings",
    message:
      "- [B] [area:tool-audit-round] [growth-pattern:none] [reach:developer] [complexity:none] Repeated correction: Apply the correction.",
  }
  assert.throws(
    () => settleRoundFindings([], [record, record]),
    /title appears more than once/,
  )
  const numbered = {
    ...record,
    message:
      "- [B] [finding:1] [area:tool-audit-round] [growth-pattern:none] [reach:developer] [complexity:none] Repeated correction: Apply the correction.",
  }
  assert.throws(
    () =>
      settleRoundFindings(
        reviewedRoundFindings([reportFinding(1, "Report finding")]),
        [numbered, numbered],
      ),
    /number appears more than once/,
  )
})

test("a record bullet cannot name a finding the report does not have", () => {
  assert.throws(
    () =>
      settleRoundFindings(reviewedRoundFindings([reportFinding(1, "Only")]), [
        {
          repository: "repo-edu",
          subject:
            "example/impl-audit-1 oth growth-none B1 fix(audit-round): settle findings",
          message:
            "- [B] [finding:2] [area:tool-audit-round] [growth-pattern:none] [reach:developer] [complexity:none] Only: Apply the correction.",
        },
      ]),
    /names no report finding: 2/,
  )
})

test("unmatched deferred bullets keep the other repository's location", () => {
  const settled = settleRoundFindings(
    [],
    [
      {
        repository: "repo-edu",
        subject: "example/impl-audit-1 oth c1: defer the plan correction",
        message:
          "- [C] [plan:../plan/example.md#decisions] [growth-pattern:none] [reach:developer] [complexity:none] Plan deferral: Record the plan correction.",
      },
      {
        repository: "plan",
        subject: "example/impl-audit-1 oth c1: defer the code correction",
        message:
          "- C [area:tool-audit-round] [cover:cover-x] [growth-pattern:none] [reach:developer] [complexity:none] Code deferral: Record the code correction.",
      },
    ],
  )
  assert.deepEqual(
    settled.map((finding) => [
      finding.title,
      finding.outcome,
      finding.location,
    ]),
    [
      [
        "Plan deferral",
        "unmatched",
        {
          kind: "deferred",
          repository: "plan",
          plan: "../plan/example.md#decisions",
        },
      ],
      [
        "Code deferral",
        "unmatched",
        {
          kind: "deferred",
          repository: "repo-edu",
          area: "tool-audit-round",
          covers: ["cover-x"],
        },
      ],
    ],
  )
})

test("a planning record can defer an unmatched finding to Repo Edu", () => {
  const settled = settleRoundFindings(
    [],
    [
      {
        repository: "plan",
        subject:
          "example/plan-audit oth growth-none B1: defer the code correction",
        message:
          "- B [field:excess] [area:tool-audit-round] [cover:cover-x] [growth-pattern:none] [reach:developer] [complexity:none] Code deferral: Record the code correction.",
      },
    ],
  )

  assert.deepEqual(settled, [
    {
      number: null,
      title: "Code deferral",
      tier: "B",
      reach: "developer",
      complexity: "none",
      growthPattern: "none",
      location: {
        kind: "deferred",
        repository: "repo-edu",
        area: "tool-audit-round",
        covers: ["cover-x"],
      },
      vetVerdict: null,
      rebuttalAnswer: null,
      outcome: "unmatched",
      finalTier: null,
      finalReach: null,
    },
  ])
})

test("record numbers settle kept, dropped, narrowed and unmatched findings", () => {
  const findings = reviewedRoundFindings([
    reportFinding(1, "Kept finding"),
    reportFinding(2, "Dropped finding", "C"),
    reportFinding(3, "Narrowed finding", "B", "ordinary"),
  ])
  const records = [
    {
      repository: "repo-edu" as const,
      subject:
        "example/impl-audit-1 oth growth-none B1C1d1 fix(audit-round): settle findings",
      message: [
        "- [B] [finding:1] [area:tool-audit-round] [growth-pattern:none] [reach:developer] [complexity:none] Retitled kept finding: Retain the correction.",
        "- [C] [finding:3] [area:tool-audit-round] [growth-pattern:none] [reach:ordinary] [complexity:none] Narrowed finding: Keep the narrower result.",
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

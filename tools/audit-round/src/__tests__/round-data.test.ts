import assert from "node:assert/strict"
import { access, mkdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { test } from "node:test"
import {
  type CommitRoundData,
  findingSplit,
  type ImplementationRoundData,
  type PlanningRoundData,
  parseRoundDataFile,
  type ReportFinding,
  type RoundFinding,
  type RoundFindingReview,
  readPlanRoundData,
  reviewedRoundFindings,
  reviewsSplit,
  roundDataFilename,
  roundDataFiles,
  settleRoundFindings,
  writeDisprovedFinding,
  writeRoundData,
} from "../round-data.js"
import { fixture } from "./helpers.js"

const settings: ImplementationRoundData["settings"] = {
  vetters: [{ assistant: "claude", model: "claude-opus-5", effort: "high" }],
  fix: { assistant: "codex", model: "gpt-6.1-sol", effort: "high" },
}

const measured = {
  milliseconds: 1200,
  tokens: [],
  peakContext: null,
  compactions: 0,
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
        fix: settings.fix,
        vet: {
          claude: { model: "claude-opus-5", effort: "high" },
          codex: { model: "gpt-6.1-sol", effort: "high" },
        },
      },
    }),
  )
  assert.throws(() =>
    parse({ ...judged, settings: { ...settings, vetters: [] } }),
  )
})

test("round data names each vet phase entry by its tag and no other entry", async (t) => {
  const f = await fixture(t)
  const path = join(f.runtime.activeRoot, "example-impl-rounds.json")
  const parse = (phases: unknown) =>
    parseRoundDataFile(
      path,
      JSON.stringify({
        rounds: [{ ...entry("example-impl-audit-01..01", 1), phases }],
        disproved: [],
      }),
    )
  const vet = {
    phase: "vet",
    tag: "abh",
    assistant: "claude",
    model: "claude-opus-5",
    effort: "high",
    ...measured,
  }
  const audit = {
    phase: "audit",
    assistant: "codex",
    model: "gpt-6.1-sol",
    effort: "high",
    ...measured,
  }

  assert.deepEqual(parse([audit, vet]).rounds[0]?.phases, [audit, vet])
  const { tag: _tag, ...untagged } = vet
  assert.throws(() => parse([untagged]))
  assert.throws(() => parse([{ ...audit, tag: "oth" }]))
  assert.throws(() => parse([{ ...vet, tag: "abc" }]))
})

test("round data stores a revised tier that differs from the report tier", async (t) => {
  const f = await fixture(t)
  const path = join(f.runtime.activeRoot, "example-impl-rounds.json")
  const findings = reviewedRoundFindings(
    [reportFinding(1, "Retiered finding")],
    [
      {
        vet: "abh",
        reviews: [
          { number: 1, tier: "B", verdict: "revise", revisedTier: "C" },
        ],
      },
    ],
  )

  writeRoundData(path, {
    ...entry("example-impl-audit-01..01", 1),
    findings: [...findings],
  })

  const file = parseRoundDataFile(path, await readFile(path, "utf8"))
  assert.deepEqual(file.rounds[0]?.findings[0]?.reviews, [
    { vet: "abh", verdict: "revise", revisedTier: "C", answer: null },
  ])
  const [finding] = findings
  assert.ok(finding)
  const review = finding.reviews[0]
  assert.ok(review)
  for (const changed of [
    { ...review, revisedTier: "B" as const },
    { ...review, verdict: "drop" as const },
  ])
    assert.throws(() =>
      writeRoundData(path, {
        ...entry("example-impl-audit-01..01", 1),
        findings: [{ ...finding, reviews: [changed] }],
      }),
    )
})

test("round data stores a contested verdict's user winner and reason together", async (t) => {
  const f = await fixture(t)
  const path = join(f.runtime.activeRoot, "example-impl-rounds.json")
  const [finding] = reviewedRoundFindings(
    [reportFinding(1, "Ruled contest")],
    [{ vet: "abh", reviews: [{ number: 1, tier: "B", verdict: "drop" }] }],
    [{ number: 1, tier: "B", vet: "abh", answer: "contest" }],
  )
  assert.ok(finding)
  const write = (ruled: RoundFinding) =>
    writeRoundData(path, {
      ...entry("example-impl-audit-01..01", 1),
      findings: [ruled],
    })
  const ruling = (winner: unknown, reason = "The vet applied the contract.") =>
    ({ ...finding, ruling: { winner, reason } }) as RoundFinding

  for (const winner of ["report", "neither", ["abh"], ["abh", "oth"]]) {
    write(ruling(winner))
    assert.deepEqual(
      parseRoundDataFile(path, await readFile(path, "utf8")).rounds[0]
        ?.findings[0]?.ruling,
      { winner, reason: "The vet applied the contract." },
    )
  }
  for (const winner of ["vet", "auditor", [], ["vet"]])
    assert.throws(() => write(ruling(winner)))
  assert.throws(() => write(ruling("report", "First line.\nSecond line.")))
  assert.throws(() =>
    write({
      ...ruling("report"),
      reviews: finding.reviews.map((review) => ({
        ...review,
        answer: "agree",
      })),
    }),
  )
})

test("round data stores a ruling on a split the rebuttal agreed with", async (t) => {
  const f = await fixture(t)
  const path = join(f.runtime.activeRoot, "example-impl-rounds.json")
  const [finding] = reviewedRoundFindings(
    [reportFinding(1, "Ruled split")],
    [
      { vet: "abx", reviews: [{ number: 1, tier: "B", verdict: "drop" }] },
      { vet: "obx", reviews: [{ number: 1, tier: "B", verdict: "accept" }] },
    ],
    [{ number: 1, tier: "B", vet: "abx", answer: "agree" }],
  )
  assert.ok(finding)
  const ruled: RoundFinding = {
    ...finding,
    ruling: { winner: ["obx"], reason: "The finding stands as written." },
  }
  writeRoundData(path, {
    ...entry("example-impl-audit-01..01", 1),
    findings: [ruled],
  })
  assert.deepEqual(
    parseRoundDataFile(path, await readFile(path, "utf8")).rounds[0]
      ?.findings[0]?.ruling,
    ruled.ruling,
  )
  // Two drops the rebuttal agreed with neither split nor contest.
  assert.throws(() =>
    writeRoundData(path, {
      ...entry("example-impl-audit-01..01", 1),
      findings: [
        {
          ...ruled,
          reviews: ruled.reviews.map((review) => ({
            ...review,
            verdict: "drop",
            answer: "agree",
          })),
        },
      ],
    }),
  )
})

const review = (
  vet: string,
  verdict: RoundFindingReview["verdict"],
  answer: RoundFindingReview["answer"] = verdict === "accept" ? null : "agree",
): RoundFindingReview => ({ vet, verdict, answer })

test("two vets split on every pair of different verdict words", () => {
  const verdicts = ["accept", "revise", "drop", "needs-user-ruling"] as const
  for (const [index, first] of verdicts.entries())
    for (const second of verdicts.slice(index + 1)) {
      assert.equal(
        reviewsSplit(review("abx", first), review("obx", second)),
        true,
        `${first} and ${second}`,
      )
      assert.equal(
        findingSplit([review("abx", first), review("obx", second)]),
        true,
      )
    }
})

test("two vets with the same verdict split only on revisions the rebuttal does not both agree with", () => {
  for (const verdict of ["accept", "drop", "needs-user-ruling"] as const)
    assert.equal(
      reviewsSplit(review("abx", verdict), review("obx", verdict)),
      false,
      verdict,
    )
  assert.equal(
    reviewsSplit(review("abx", "drop", "contest"), review("obx", "drop")),
    false,
  )
  assert.equal(
    reviewsSplit(review("abx", "revise"), review("obx", "revise")),
    false,
  )
  for (const answer of ["contest", "for-user-ruling"] as const)
    assert.equal(
      reviewsSplit(review("abx", "revise"), review("obx", "revise", answer)),
      true,
      answer,
    )
})

test("a panel of three splits when any pair of its vets splits", () => {
  assert.equal(
    findingSplit([
      review("abx", "revise"),
      review("obx", "revise"),
      review("ath", "revise", "contest"),
    ]),
    true,
  )
  assert.equal(findingSplit([review("abx", "drop")]), false)
  assert.equal(findingSplit([]), false)
})

test("a single-vet round rewritten to the panel form keeps every verdict, answer and winner", async (t) => {
  const f = await fixture(t)
  const path = join(f.runtime.activeRoot, "example-impl-rounds.json")
  const reviewed = (
    number: number,
    review: Omit<RoundFinding["reviews"][number], "vet">,
    ruling?: RoundFinding["ruling"],
  ): RoundFinding => ({
    ...reportFinding(number, `Rewritten finding ${number}`),
    reviews: [{ vet: "obx", ...review }],
    ...(ruling === undefined ? {} : { ruling }),
    outcome: "kept",
    finalTier: null,
    finalReach: null,
  })
  const findings = [
    reviewed(1, { verdict: "accept", answer: null }),
    reviewed(2, { verdict: "revise", revisedTier: "C", answer: "agree" }),
    reviewed(
      3,
      { verdict: "drop", answer: "contest" },
      {
        winner: ["obx"],
        reason: "The vet's drop held.",
      },
    ),
    reviewed(
      4,
      { verdict: "drop", answer: "contest" },
      {
        winner: "report",
        reason: "The finding stood as written.",
      },
    ),
    reviewed(
      5,
      { verdict: "revise", answer: "contest" },
      {
        winner: "neither",
        reason: "A third correction was right.",
      },
    ),
    reviewed(6, { verdict: "needs-user-ruling", answer: "for-user-ruling" }),
    {
      ...reportFinding(7, "Unreviewed finding"),
      reviews: [],
      outcome: "dropped",
      finalTier: null,
      finalReach: null,
    },
  ] satisfies RoundFinding[]
  const round: ImplementationRoundData = {
    ...entry("example-impl-audit-01..01", 1),
    settings: {
      ...settings,
      vetters: [{ assistant: "codex", model: "gpt-5.6-sol", effort: "xhigh" }],
    },
    phases: [
      {
        phase: "vet",
        tag: "obx",
        assistant: "codex",
        model: "gpt-5.6-sol",
        effort: "xhigh",
        ...measured,
      },
    ],
    findings,
  }

  writeRoundData(path, round)

  assert.deepEqual(
    parseRoundDataFile(path, await readFile(path, "utf8")).rounds[0],
    round,
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
        reviews: [{ vet: "abh", verdict: "drop", answer: "agree" }],
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

test("a second ruling on the same finding replaces the first across sides while detached rulings append", async (t) => {
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
    reason: "The vet verdict was wrong instead.",
    target: "example-impl-audit-01..01",
    round: 1,
    finding: 2,
    side: "vet",
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
      reason: "The vet verdict was wrong instead.",
      target: "example-impl-audit-01..01",
      round: 1,
      finding: 2,
      side: "vet",
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

test("each vet's review and its rebuttal answer stay attached to report finding identity", () => {
  assert.deepEqual(
    reviewedRoundFindings(
      [reportFinding(1, "Reviewed finding"), reportFinding(2, "Accepted")],
      [
        {
          vet: "abx",
          reviews: [
            { number: 1, tier: "B", verdict: "revise", revisedTier: "C" },
            { number: 2, tier: "B", verdict: "accept" },
          ],
        },
        {
          vet: "obx",
          reviews: [
            { number: 1, tier: "B", verdict: "accept" },
            { number: 2, tier: "B", verdict: "accept" },
          ],
        },
      ],
      [{ number: 1, tier: "B", vet: "abx", answer: "contest" }],
    ),
    [
      {
        ...reportFinding(1, "Reviewed finding"),
        reviews: [
          {
            vet: "abx",
            verdict: "revise",
            revisedTier: "C",
            answer: "contest",
          },
          { vet: "obx", verdict: "accept", answer: null },
        ],
        outcome: null,
        finalTier: null,
        finalReach: null,
      },
      {
        ...reportFinding(2, "Accepted"),
        reviews: [
          { vet: "abx", verdict: "accept", answer: null },
          { vet: "obx", verdict: "accept", answer: null },
        ],
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
      reviews: [],
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

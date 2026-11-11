import assert from "node:assert/strict"
import { test } from "node:test"
import {
  decideSeries,
  openingAuditor,
  type SeriesCommit,
  type SeriesEvidence,
} from "../judge.js"
import type {
  ImplementationRoundData,
  PlanningRoundData,
  RoundData,
} from "../round-data.js"
import type { Auditor } from "../settings.js"

const selection = { model: "fixture-model", effort: "low" }
const fable: Auditor = {
  assistant: "claude",
  model: "claude-fable-5-1",
  effort: "high",
}
const opus: Auditor = {
  assistant: "claude",
  model: "claude-opus-5-5",
  effort: "xhigh",
}
const sol: Auditor = {
  assistant: "codex",
  model: "gpt-5.6-sol",
  effort: "xhigh",
}
const pool: readonly Auditor[] = [opus, sol]

function finding(tier: "A" | "B" | "C" | "D") {
  return {
    number: 1,
    title: `${tier} finding`,
    tier,
    reach: "developer" as const,
    complexity: "none" as const,
    growthPattern: "none",
    location: {
      kind: "planning" as const,
      field: "missing" as const,
      section: "decisions",
    },
    vetVerdict: "accept" as const,
    rebuttalAnswer: null,
    outcome: "kept" as const,
    finalTier: null,
    finalReach: null,
  }
}

function planningRound(
  auditor: Auditor,
  round: number,
  started: string,
  options: {
    readonly phase?: "widening" | "detailing"
    readonly tier?: "A" | "B" | "C" | "D"
    readonly settling?: string
    readonly status?: RoundData["status"]
  } = {},
): PlanningRoundData {
  return {
    target: "example-plan-audit",
    round,
    tag: auditor.assistant === "claude" ? "abh" : "obh",
    started,
    status: options.status ?? "finished",
    settings: {
      vet: { claude: selection, codex: selection },
      fix: { assistant: "codex", ...selection },
    },
    auditor: { ...auditor, chosenBy: "settings" },
    phases: [],
    commits: [{ repository: "plan", sha: round.toString(16).repeat(40) }],
    findings: options.tier === undefined ? [] : [finding(options.tier)],
    judge: null,
    phase: options.phase ?? "detailing",
    settling: options.settling ?? "",
  }
}

function implementationRound(
  auditor: Auditor,
  round: number,
  started: string,
  tier?: "A" | "B" | "C" | "D",
): ImplementationRoundData {
  const {
    phase: _phase,
    settling: _settling,
    ...common
  } = planningRound(auditor, round, started, { tier })
  return {
    ...common,
    target: "example-impl-audit-01..02",
    scope: "1-2",
    judgedRepos: ["repo-edu"],
  }
}

function commit(
  overrides: Partial<SeriesCommit> & Pick<SeriesCommit, "committed">,
): SeriesCommit {
  return {
    repository: "plan",
    sha: "a".repeat(40),
    subject: "example/plan-audit obh growth-none a1: fixture",
    role: "plan-audit",
    files: ["active/example.md"],
    renames: [],
    acceptedTiers: [],
    changesPlan: true,
    ownStem: true,
    ...overrides,
  }
}

function evidence(
  rounds: readonly RoundData[],
  commits: readonly SeriesCommit[] = [],
  commitTimes: ReadonlyMap<string, number> = new Map(
    rounds.flatMap((round) =>
      round.commits.map(
        (entry) =>
          [
            `${entry.repository}@${entry.sha}`,
            Date.parse(round.started),
          ] as const,
      ),
    ),
  ),
): SeriesEvidence {
  return {
    roundData: { file: "example-plan-rounds.json", rounds },
    roundCommits: new Set(
      rounds.flatMap((round) => round.commits.map((entry) => entry.sha)),
    ),
    roundCommitTimes: commitTimes,
    commits,
  }
}

function current(entry: RoundData) {
  return { target: entry.target, round: entry.round }
}

test("a real bug makes every earlier read stale and switches assistants", () => {
  const codex = planningRound(sol, 1, "2026-11-08T10:00:00Z", {
    tier: "B",
  })
  assert.deepEqual(decideSeries(evidence([codex]), current(codex), pool), {
    answer: opus,
    reason:
      "Rule 3: claude claude-opus-5-5 xhigh has no current read and did not audit this round.",
  })

  const claude = planningRound(opus, 2, "2026-11-08T11:00:00Z")
  assert.deepEqual(
    decideSeries(evidence([codex, claude]), current(claude), pool),
    {
      answer: sol,
      reason:
        "Rule 3: codex gpt-5.6-sol xhigh has no current read and did not audit this round.",
    },
  )
})

test("every pool entry needs a current read before detailing is ready", () => {
  const claude = planningRound(opus, 1, "2026-11-08T10:00:00Z")
  const codex = planningRound(sol, 2, "2026-11-08T11:00:00Z")
  assert.deepEqual(
    decideSeries(evidence([claude, codex]), current(codex), pool),
    {
      answer: "ready",
      reason:
        "Rule 2: every pool entry has a current read; the detailing plan is ready.",
    },
  )

  const ready = commit({
    committed: "2026-11-08T09:00:00Z",
    subject: "example/ready: declare the plan ready",
    role: "ready",
    files: [],
  })
  assert.deepEqual(
    decideSeries(evidence([claude, codex], [ready]), current(codex), pool),
    {
      answer: "stop",
      reason: "Rule 2: every pool entry has a current read; the series stops.",
    },
  )
})

test("widening ends from its retained settling line", () => {
  const claude = planningRound(opus, 1, "2026-11-08T10:00:00Z", {
    phase: "widening",
    settling: "settle. No concrete shape question remains.",
  })
  const settle = planningRound(sol, 2, "2026-11-08T11:00:00Z", {
    phase: "widening",
    settling: "settle. No concrete shape question remains.",
  })
  assert.equal(
    decideSeries(evidence([claude, settle]), current(settle), pool).answer,
    "settle",
  )

  const keepOpen = {
    ...settle,
    settling: "keep open. Decision 3 still needs implementation evidence.",
  }
  assert.deepEqual(
    decideSeries(evidence([claude, keepOpen]), current(keepOpen), pool),
    {
      answer: "stop",
      reason:
        "Rule 2: every pool entry has a current read; keep open. Decision 3 still needs implementation evidence.",
    },
  )
})

test("implementation stops after both assistants have current reads", () => {
  const claude = implementationRound(opus, 1, "2026-11-08T10:00:00Z")
  const codex = implementationRound(sol, 2, "2026-11-08T11:00:00Z")
  assert.equal(
    decideSeries(evidence([claude, codex]), current(codex), pool).answer,
    "stop",
  )
})

test("a hand-run A audit in the commit list invalidates older reads", () => {
  const claude = planningRound(opus, 1, "2026-11-08T09:00:00Z")
  const codex = planningRound(sol, 2, "2026-11-08T11:00:00Z")
  const handRun = commit({
    committed: "2026-11-08T10:00:00Z",
    sha: "b".repeat(40),
    acceptedTiers: ["A"],
  })
  assert.deepEqual(
    decideSeries(evidence([claude, codex], [handRun]), current(codex), pool),
    {
      answer: opus,
      reason:
        "Rule 3: claude claude-opus-5-5 xhigh has no current read and did not audit this round.",
    },
  )
})

test("a bare init makes a hand-run B audit invalidate older reads", () => {
  const claude = planningRound(opus, 1, "2026-11-08T09:30:00Z")
  const codex = planningRound(sol, 2, "2026-11-08T11:00:00Z")
  const init = commit({
    committed: "2026-11-08T09:00:00Z",
    role: "init",
    files: ["example.md"],
    acceptedTiers: [],
  })
  const handRun = commit({
    committed: "2026-11-08T10:00:00Z",
    sha: "b".repeat(40),
    acceptedTiers: ["B"],
  })
  assert.deepEqual(
    decideSeries(
      evidence([claude, codex], [init, handRun]),
      current(codex),
      pool,
    ),
    {
      answer: opus,
      reason:
        "Rule 3: claude claude-opus-5-5 xhigh has no current read and did not audit this round.",
    },
  )
})

test("real bugs on every retained target invalidate older reads", () => {
  const claude = implementationRound(opus, 1, "2026-11-08T09:00:00Z")
  const codex = implementationRound(sol, 2, "2026-11-08T11:00:00Z")
  const planningBug = planningRound(sol, 3, "2026-11-08T10:00:00Z", {
    tier: "B",
  })
  const otherScopeBug = {
    ...implementationRound(sol, 3, "2026-11-08T10:00:00Z", "B"),
    target: "example-impl-audit-03..03",
    scope: "3",
  }

  for (const bug of [planningBug, otherScopeBug])
    assert.deepEqual(
      decideSeries(evidence([claude, bug, codex]), current(codex), pool),
      {
        answer: opus,
        reason:
          "Rule 3: claude claude-opus-5-5 xhigh has no current read and did not audit this round.",
      },
    )
})

test("a real bug becomes an event when its latest record lands", () => {
  const bug = implementationRound(opus, 1, "2026-11-08T10:00:00Z", "B")
  const overlapping = implementationRound(sol, 2, "2026-11-08T10:15:00Z")
  const latest = implementationRound(opus, 3, "2026-11-08T11:00:00Z")
  const commitTimes = new Map([
    [`plan@${"1".repeat(40)}`, Date.parse("2026-11-08T10:30:00Z")],
    [`plan@${"2".repeat(40)}`, Date.parse("2026-11-08T10:45:00Z")],
    [`plan@${"3".repeat(40)}`, Date.parse("2026-11-08T11:15:00Z")],
  ])

  assert.deepEqual(
    decideSeries(
      evidence([bug, overlapping, latest], [], commitTimes),
      current(latest),
      pool,
    ),
    {
      answer: sol,
      reason:
        "Rule 3: codex gpt-5.6-sol xhigh has no current read and did not audit this round.",
    },
  )
})

test("only the current stem's steps and audits invalidate its reads", () => {
  const claude = planningRound(opus, 1, "2026-11-08T10:00:00Z")
  const codex = planningRound(sol, 2, "2026-11-08T11:00:00Z")
  const foreignStep = commit({
    committed: "2026-11-08T10:30:00Z",
    role: "impl-2",
    ownStem: false,
    changesPlan: false,
  })
  const sharedDocument = commit({
    committed: "2026-11-08T10:45:00Z",
    role: null,
    ownStem: false,
    changesPlan: false,
  })
  assert.equal(
    decideSeries(
      evidence([claude, codex], [foreignStep, sharedDocument]),
      current(codex),
      pool,
    ).answer,
    "ready",
  )

  const outsidePlanEdit = {
    ...sharedDocument,
    changesPlan: true,
  }
  assert.deepEqual(
    decideSeries(
      evidence([claude, codex], [outsidePlanEdit]),
      current(codex),
      pool,
    ).answer,
    opus,
  )
})

test("a one-assistant pool ends after that assistant's current read", () => {
  const codex = implementationRound(sol, 1, "2026-11-08T10:00:00Z")
  assert.equal(
    decideSeries(evidence([codex]), current(codex), [sol]).answer,
    "stop",
  )
})

test("each listed model of one assistant needs its own current read", () => {
  const first = planningRound(fable, 1, "2026-11-08T10:00:00Z", {
    tier: "C",
  })
  assert.deepEqual(
    decideSeries(evidence([first]), current(first), [fable, opus]).answer,
    opus,
  )

  const second = planningRound(opus, 2, "2026-11-08T11:00:00Z", {
    tier: "C",
  })
  assert.equal(
    decideSeries(evidence([first, second]), current(second), [fable, opus])
      .answer,
    "ready",
  )
})

test("two models of one assistant choose the least recently read entry", () => {
  const recent = planningRound(fable, 1, "2026-11-08T10:00:00Z", {
    tier: "B",
  })
  assert.deepEqual(
    decideSeries(evidence([recent]), current(recent), [fable, opus]).answer,
    opus,
  )

  const neither = planningRound(sol, 2, "2026-11-08T11:00:00Z", {
    tier: "B",
  })
  assert.deepEqual(
    decideSeries(evidence([neither]), current(neither), [fable, opus]).answer,
    fable,
  )
})

test("a series opens on the pool entry without a current read when another has one", () => {
  const claude = implementationRound(opus, 1, "2026-11-08T10:00:00Z", "C")
  const failed: RoundData = {
    ...implementationRound(sol, 2, "2026-11-08T11:00:00Z", "C"),
    status: "failed",
    findings: [{ ...finding("C"), vetVerdict: null, outcome: null }],
  }
  const target = claude.target
  assert.deepEqual(openingAuditor(evidence([claude, failed]), target, pool), {
    answer: sol,
    reason: "Rule 3: codex gpt-5.6-sol xhigh has no current read.",
  })

  // No settled read, or one for every assistant, leaves the opener to the settings.
  assert.equal(openingAuditor(evidence([]), target, pool), null)
  assert.equal(openingAuditor(evidence([failed]), target, pool), null)
  const codex = implementationRound(sol, 3, "2026-11-08T12:00:00Z")
  assert.equal(openingAuditor(evidence([claude, codex]), target, pool), null)

  // A later step makes the one read stale, so no assistant has one.
  const step = commit({
    committed: "2026-11-08T10:30:00Z",
    repository: "repo-edu",
    sha: "c".repeat(40),
    subject: "example/impl-2 oth feat(audit-round): step",
    role: "impl-2",
    files: [],
    changesPlan: false,
  })
  assert.equal(openingAuditor(evidence([claude], [step]), target, pool), null)

  // Another scope's read is not a read of this target.
  const otherScope: RoundData = {
    ...implementationRound(opus, 1, "2026-11-08T10:00:00Z"),
    target: "example-impl-audit-03..03",
  }
  assert.equal(openingAuditor(evidence([otherScope]), target, pool), null)
})

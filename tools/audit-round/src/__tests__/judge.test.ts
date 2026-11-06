import assert from "node:assert/strict"
import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import { test } from "node:test"
import { execa } from "execa"
import {
  type JudgeEvidence,
  judgeOptions,
  readJudgeAnswer,
  readJudgeEvidence,
} from "../judge.js"
import type {
  CommitRoundData,
  JudgeDecision,
  PlanningRoundData,
  RoundData,
} from "../round-data.js"
import { writeRoundData } from "../round-data.js"
import type { Auditor } from "../settings.js"
import { fixture } from "./helpers.js"
import { commitFixture } from "./round-fixture.js"
import { roundGrammarExamples } from "./round-grammar.js"

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
/** A series pool with two Claude models and one Codex model. */
const pool: readonly Auditor[] = [fable, opus, sol]
/** What the runner offered in each refused grammar example. */
const exampleOptions: Readonly<Record<string, readonly JudgeDecision[]>> = {
  "judge/stop-unavailable": [sol],
  "judge/settle-unavailable": ["stop", sol],
  "judge/ready-unavailable": ["stop", sol],
  "judge/continue-unoffered": [
    { assistant: "claude", model: "opus", effort: "high" },
  ],
}

function round(
  assistant: "claude" | "codex",
  started: string,
  options: {
    readonly round?: number
    readonly status?: RoundData["status"]
    readonly tier?: "A" | "B" | "C" | "D"
    readonly phase?: "widening" | "detailing"
    readonly landed?: boolean
    readonly outcome?: "kept" | "unmatched"
  } = {},
): PlanningRoundData {
  const tier = options.tier
  const outcome = options.outcome ?? "kept"
  return {
    target: "example-plan",
    round: options.round ?? 1,
    tag: assistant === "claude" ? "abl" : "obl",
    started,
    status: options.status ?? "finished",
    settings: {
      vet: { claude: selection, codex: selection },
      fix: { assistant: "codex", ...selection },
    },
    auditor: {
      assistant,
      chosenBy: "settings",
      ...selection,
    },
    phases: [],
    commits:
      options.landed === false
        ? []
        : [{ repository: "plan", sha: "f".repeat(40) }],
    findings:
      tier === undefined
        ? []
        : [
            {
              number: outcome === "unmatched" ? null : 1,
              title: `${assistant} ${tier} finding`,
              tier,
              reach: "developer",
              complexity: "none",
              growthPattern: "none",
              location: {
                kind: "planning",
                field: "missing",
                section: "decisions",
              },
              vetVerdict: outcome === "unmatched" ? null : "accept",
              rebuttalAnswer: null,
              outcome,
              finalTier: null,
              finalReach: null,
            },
          ],
    judge: null,
    phase: options.phase ?? "detailing",
    settling: "",
  }
}

function commitRound(
  assistant: "claude" | "codex",
  started: string,
  group: CommitRoundData["originalGroups"][number],
  options: Parameters<typeof round>[2] = {},
): CommitRoundData {
  const {
    phase: _phase,
    settling: _settling,
    ...common
  } = round(assistant, started, options)
  return {
    ...common,
    target: "commit-abcdef",
    originalGroups: [group],
    groups: [group],
    judgedRepos: [group.repository],
  }
}

function evidence(
  rounds: readonly RoundData[],
  commits: JudgeEvidence["commits"] = [
    {
      repository: "plan",
      sha: "0".repeat(40),
      committed: "2026-10-11T08:00:00Z",
      subject: "example/init obl: initialise the plan",
      role: "init",
    },
  ],
): JudgeEvidence {
  return {
    roundData: { file: "example-plan-rounds.json", rounds },
    commits,
    latestWatch: null,
  }
}

function identity(entry: RoundData): Pick<RoundData, "target" | "round"> {
  return { target: entry.target, round: entry.round }
}

function offers(
  decision: JudgeDecision,
  rounds: readonly RoundData[],
  current: RoundData,
  commits?: JudgeEvidence["commits"],
  offered: readonly Auditor[] = pool,
): boolean {
  return judgeOptions(
    evidence(rounds, commits),
    identity(current),
    offered,
  ).includes(decision)
}

test("the round grammar's judge examples are parser fixtures", () => {
  for (const example of roundGrammarExamples("judge/")) {
    const options: readonly JudgeDecision[] = exampleOptions[example.id] ?? [
      "settle",
      "ready",
      "stop",
      ...pool,
    ]
    if (example.outcome === "parsed") {
      assert.doesNotThrow(
        () => readJudgeAnswer(example.source, options),
        example.id,
      )
    } else {
      assert.throws(
        () => readJudgeAnswer(example.source, options),
        (error: unknown) =>
          error instanceof Error && error.message === example.refusal,
        example.id,
      )
    }
  }
})

test("the current in-progress settled B removes stop from the judge", () => {
  const current = round("codex", "2026-10-11T10:00:00Z", {
    status: "in-progress",
    tier: "B",
  })
  assert.equal(offers("stop", [current], current), false)
  assert.throws(
    () => readJudgeAnswer("Judge: stop. The round has converged.", pool),
    /offered only claude claude-fable-5-1 high, claude claude-opus-5-5 xhigh or codex gpt-5\.6-sol xhigh$/,
  )
  assert.deepEqual(
    readJudgeAnswer(
      "Judge: continue with claude claude-opus-5-5 xhigh. Cross-check the accepted finding.",
      pool,
    ),
    { answer: opus, reason: "Cross-check the accepted finding." },
  )
})

test("an unmatched landed B removes stop from the judge", () => {
  const current = round("codex", "2026-10-11T10:00:00Z", {
    tier: "B",
    outcome: "unmatched",
  })

  assert.equal(offers("stop", [current], current), false)
})

test("an earlier assistant's unconfirmed A blocks stop", () => {
  const claude = round("claude", "2026-10-11T10:00:00Z", { tier: "A" })
  const codex = round("codex", "2026-10-11T11:00:00Z", { round: 2 })
  assert.equal(offers("stop", [claude, codex], codex), false)

  const confirmed = round("claude", "2026-10-11T12:00:00Z", { round: 3 })
  assert.equal(offers("stop", [claude, codex, confirmed], confirmed), true)
})

test("a clean current commit read clears the same assistant's earlier gate without landing a record", () => {
  const group = {
    repository: "repo-edu" as const,
    commits: ["a".repeat(40)],
    startingHead: "b".repeat(40),
  }
  const gated = commitRound("codex", "2026-10-11T10:00:00Z", group, {
    tier: "B",
  })
  const clean = commitRound("codex", "2026-10-11T11:00:00Z", group, {
    round: 2,
    status: "in-progress",
    landed: false,
  })

  assert.deepEqual(
    judgeOptions(evidence([gated, clean]), identity(clean), pool),
    ["stop", ...pool],
  )
})

test("failed and interrupted empty commit reads do not clear an earlier gate", () => {
  const group = {
    repository: "repo-edu" as const,
    commits: ["a".repeat(40)],
    startingHead: "b".repeat(40),
  }
  for (const status of ["failed", "interrupted"] as const) {
    const gated = commitRound("codex", "2026-10-11T10:00:00Z", group, {
      tier: "B",
    })
    const empty = commitRound("codex", "2026-10-11T11:00:00Z", group, {
      round: 2,
      status,
      landed: false,
    })
    const current = commitRound("claude", "2026-10-11T12:00:00Z", group, {
      round: 3,
      status: "in-progress",
      landed: false,
    })

    assert.equal(
      offers("stop", [gated, empty, current], current),
      false,
      status,
    )
  }
})

test("a failed round with a landed B still removes stop", () => {
  const failed = round("claude", "2026-10-11T10:00:00Z", {
    status: "failed",
    tier: "B",
  })
  assert.equal(offers("stop", [failed], failed), false)

  const failedBeforeRecord = round("claude", "2026-10-11T10:00:00Z", {
    status: "failed",
    tier: "B",
    landed: false,
  })
  assert.equal(offers("stop", [failedBeforeRecord], failedBeforeRecord), true)

  const interrupted = round("claude", "2026-10-11T10:00:00Z", {
    status: "interrupted",
    tier: "B",
  })
  assert.equal(offers("stop", [interrupted], interrupted), false)
})

test("a stale in-progress entry does not block a later stop", () => {
  const stale = round("claude", "2026-10-11T10:00:00Z", {
    status: "in-progress",
    tier: "B",
  })
  const currentRound = round("codex", "2026-10-11T11:00:00Z", { round: 2 })

  assert.equal(offers("stop", [stale, currentRound], currentRound), true)
})

test("round order survives a clock moving backwards between rounds", () => {
  const earlierRound = round("claude", "2026-10-11T11:00:00Z", {
    tier: "B",
  })
  const current = round("claude", "2026-10-11T10:00:00Z", {
    round: 2,
    phase: "widening",
  })

  assert.deepEqual(
    judgeOptions(evidence([earlierRound, current]), identity(current), pool),
    ["settle", "stop", ...pool],
  )
})

test("detailing without an init or settle uses the full history", () => {
  const claude = round("claude", "2026-10-11T10:00:00Z", { tier: "B" })
  const codex = round("codex", "2026-10-11T11:00:00Z", { round: 2 })
  assert.equal(offers("stop", [claude, codex], codex, []), false)
})

test("a widening A before the settle cutoff does not block detailing stop", () => {
  const widening = round("claude", "2026-10-11T09:00:00Z", {
    tier: "A",
    phase: "widening",
  })
  const detailing = round("codex", "2026-10-11T11:00:00Z", { round: 2 })
  const commits: JudgeEvidence["commits"] = [
    {
      repository: "plan",
      sha: "1".repeat(40),
      committed: "2026-10-11T08:00:00Z",
      subject: "example/init obl: initialise the plan",
      role: "init",
    },
    {
      repository: "plan",
      sha: "2".repeat(40),
      committed: "2026-10-11T10:00:00Z",
      subject: "example/settle: settle",
      role: "settle",
    },
  ]
  assert.equal(offers("stop", [widening, detailing], detailing, commits), true)
})

test("a widening B leaves settle offered", () => {
  const claude = round("claude", "2026-10-11T09:00:00Z", {
    tier: "B",
    phase: "widening",
  })
  assert.deepEqual(judgeOptions(evidence([claude]), identity(claude), pool), [
    "settle",
    "stop",
    ...pool,
  ])
})

test("widening withholds settle after an A across all settled reads but always offers stop", () => {
  const claude = round("claude", "2026-10-11T09:00:00Z", {
    tier: "A",
    phase: "widening",
  })
  const codex = round("codex", "2026-10-11T10:00:00Z", {
    round: 2,
    phase: "widening",
  })
  assert.deepEqual(
    judgeOptions(evidence([claude, codex]), identity(codex), pool),
    ["stop", ...pool],
  )

  const confirmed = round("claude", "2026-10-11T11:00:00Z", {
    round: 3,
    phase: "widening",
  })
  assert.deepEqual(
    judgeOptions(
      evidence([claude, codex, confirmed]),
      identity(confirmed),
      pool,
    ),
    ["settle", "stop", ...pool],
  )
})

test("judge answers are one plain line with one admitted decision", () => {
  assert.deepEqual(
    readJudgeAnswer(
      "Judge: continue with codex gpt-5.6-sol xhigh. The other vendor should inspect the evidence.",
      ["stop", ...pool],
    ),
    { answer: sol, reason: "The other vendor should inspect the evidence." },
  )
  for (const source of [
    "Judge: stop.",
    "Judge: continue. More work remains.",
    "Judge: continue with Codex. The old form names no entry.",
    "Judge: continue with codex gpt-5.6-sol. The entry needs its effort.",
    "Preface.\nJudge: stop. Enough evidence.",
    "Judge: stop. Enough evidence.\nMore text.",
  ])
    assert.throws(
      () => readJudgeAnswer(source, ["stop", ...pool]),
      /exactly one/,
    )
})

test("the judge offers every pool entry and gates only the vendors the pool can run", () => {
  const codexB = round("codex", "2026-10-11T09:00:00Z", { tier: "B" })
  const claude = round("claude", "2026-10-11T10:00:00Z", { round: 2 })

  // Two models of one vendor are separate options, in the pool's order.
  assert.deepEqual(
    judgeOptions(evidence([claude]), identity(claude), [fable, opus]),
    ["ready", "stop", fable, opus],
  )
  // A Codex read with a B holds stop while the pool can send Codex in again.
  assert.equal(offers("stop", [codexB, claude], claude), false)
  // A Claude-only pool cannot unlock a Codex read, so that read imposes nothing.
  assert.equal(
    offers("stop", [codexB, claude], claude, undefined, [fable, opus]),
    true,
  )
})

test("detailing offers ready beside stop until the plan's ready marker", () => {
  const current = round("claude", "2026-10-11T10:00:00Z")
  assert.deepEqual(judgeOptions(evidence([current]), identity(current), pool), [
    "ready",
    "stop",
    ...pool,
  ])
  assert.deepEqual(
    readJudgeAnswer(
      "Judge: ready. Both reads found the brief complete.",
      judgeOptions(evidence([current]), identity(current), pool),
    ),
    { answer: "ready", reason: "Both reads found the brief complete." },
  )

  // The real-bug gate that withholds stop withholds ready too.
  const blocked = round("claude", "2026-10-11T10:00:00Z", { tier: "B" })
  assert.deepEqual(
    judgeOptions(evidence([blocked]), identity(blocked), pool),
    pool,
  )

  // After the ready marker the planning round keeps stop alone.
  const marked: JudgeEvidence["commits"] = [
    ...evidence([]).commits,
    {
      repository: "plan",
      sha: "3".repeat(40),
      committed: "2026-10-11T09:00:00Z",
      subject: "example/ready: declare the plan ready for implementation",
      role: "ready",
    },
  ]
  assert.deepEqual(
    judgeOptions(evidence([current], marked), identity(current), pool),
    ["stop", ...pool],
  )

  // Widening and implementation never offer ready.
  const widening = round("claude", "2026-10-11T10:00:00Z", {
    phase: "widening",
  })
  assert.equal(offers("ready", [widening], widening), false)
  const { phase: _phase, settling: _settling, ...common } = current
  const implementation: RoundData = {
    ...common,
    target: "example-impl-01..02",
    scope: "1-2",
    judgedRepos: ["repo-edu"],
  }
  assert.deepEqual(
    judgeOptions(evidence([implementation]), identity(implementation), pool),
    ["stop", ...pool],
  )
})

test("commit judge evidence merges retained original groups and landed fixes without a watch", async (t) => {
  const f = await fixture(t)
  const original = await commitFixture(
    f.runtime.repoEduRoot,
    "Original audited commit",
    "2026-10-11T08:00:00Z",
  )
  await commitFixture(
    f.runtime.repoEduRoot,
    "Unnamed gap commit",
    "2026-10-11T09:00:00Z",
  )
  const laterOriginal = await commitFixture(
    f.runtime.repoEduRoot,
    "Later audited commit",
    "2026-10-11T10:00:00Z",
  )
  const fix = await commitFixture(
    f.runtime.repoEduRoot,
    "series/fix obh growth-none c1 fix(audit-round): landed correction",
    "2026-10-11T11:00:00Z",
  )
  const full = async (revision: string) =>
    (
      await execa("git", ["rev-parse", revision], {
        cwd: f.runtime.repoEduRoot,
      })
    ).stdout
  const originalSha = await full(original)
  const laterOriginalSha = await full(laterOriginal)
  const fixSha = await full(fix)
  const label = `commit-${original}`
  const group = {
    repository: "repo-edu" as const,
    commits: [originalSha],
    startingHead: originalSha,
  }
  const first: CommitRoundData = {
    ...commitRound("codex", "2026-10-11T11:00:00Z", group),
    target: label,
    commits: [{ repository: "repo-edu", sha: fixSha }],
  }
  writeRoundData(join(f.runtime.activeRoot, `${label}-rounds.json`), first)
  writeRoundData(join(f.runtime.activeRoot, `${label}-rounds.json`), {
    ...commitRound(
      "claude",
      "2026-10-11T12:00:00Z",
      { ...group, startingHead: laterOriginalSha },
      { round: 2 },
    ),
    target: label,
    commits: [],
  })
  writeRoundData(join(f.runtime.activeRoot, `${label}-rounds.json`), {
    ...commitRound(
      "codex",
      "2026-10-11T13:00:00Z",
      {
        ...group,
        commits: [originalSha, laterOriginalSha],
        startingHead: laterOriginalSha,
      },
      { round: 3 },
    ),
    target: label,
    commits: [],
  })
  await writeFile(
    join(f.runtime.activeRoot, `${label}-01-9-watch.obh.md`),
    "# Must not reach a commit judge\n",
  )

  const result = await readJudgeEvidence({
    ...f.runtime,
    stem: label,
    roundKind: "implementation",
    seriesKind: "commit",
  })

  assert.equal(result.roundData.file, `${label}-rounds.json`)
  assert.equal(result.roundData.rounds.length, 3)
  assert.deepEqual(
    result.commits.map(({ sha, subject, role }) => ({ sha, subject, role })),
    [
      { sha: originalSha, subject: "Original audited commit", role: null },
      {
        sha: laterOriginalSha,
        subject: "Later audited commit",
        role: null,
      },
      {
        sha: fixSha,
        subject:
          "series/fix obh growth-none c1 fix(audit-round): landed correction",
        role: "fix",
      },
    ],
  )
  assert.equal(result.latestWatch, null)
})

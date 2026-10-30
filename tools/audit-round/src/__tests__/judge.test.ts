import assert from "node:assert/strict"
import { test } from "node:test"
import {
  formatJudgeAnswer,
  type JudgeEvidence,
  judgeOptions,
  readJudgeAnswer,
} from "../judge.js"
import type { JudgeDecision, RoundData } from "../round-data.js"
import { roundGrammarExamples } from "./round-grammar.js"

const selection = { model: "fixture-model", effort: "low" }

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
): RoundData {
  const tier = options.tier
  const outcome = options.outcome ?? "kept"
  return {
    target: "example-plan",
    round: options.round ?? 1,
    tag: assistant === "claude" ? "abl" : "obl",
    started,
    status: options.status ?? "finished",
    settings: {
      audit: { claude: selection, codex: selection },
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
    opening: "",
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
): boolean {
  return judgeOptions(evidence(rounds, commits), identity(current)).includes(
    decision,
  )
}

test("the round grammar's judge examples are parser fixtures", () => {
  for (const example of roundGrammarExamples("judge/")) {
    const options: readonly JudgeDecision[] =
      example.id === "judge/stop-unavailable"
        ? ["claude", "codex"]
        : example.id === "judge/settle-unavailable"
          ? ["stop", "claude", "codex"]
          : ["settle", "stop", "claude", "codex"]
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
    () =>
      readJudgeAnswer("Judge: stop. The round has converged.", [
        "claude",
        "codex",
      ]),
    /offered only Claude or Codex/,
  )
  assert.deepEqual(
    readJudgeAnswer(
      "Judge: continue with Claude. Cross-check the accepted finding.",
      ["claude", "codex"],
    ),
    {
      answer: "claude",
      reason: "Cross-check the accepted finding.",
    },
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

test("widening withholds settle across all settled reads but always offers stop", () => {
  const claude = round("claude", "2026-10-11T09:00:00Z", {
    tier: "B",
    phase: "widening",
  })
  const codex = round("codex", "2026-10-11T10:00:00Z", {
    round: 2,
    phase: "widening",
  })
  assert.deepEqual(judgeOptions(evidence([claude, codex]), identity(codex)), [
    "stop",
    "claude",
    "codex",
  ])

  const confirmed = round("claude", "2026-10-11T11:00:00Z", {
    round: 3,
    phase: "widening",
  })
  assert.deepEqual(
    judgeOptions(evidence([claude, codex, confirmed]), identity(confirmed)),
    ["settle", "stop", "claude", "codex"],
  )
})

test("judge answers are one plain line with one admitted decision", () => {
  const answer = {
    answer: "codex",
    reason: "The other setting should inspect the evidence.",
  } as const
  assert.equal(
    formatJudgeAnswer(answer),
    "Judge: continue with Codex. The other setting should inspect the evidence.",
  )
  assert.deepEqual(
    readJudgeAnswer(formatJudgeAnswer(answer), ["stop", "claude", "codex"]),
    answer,
  )
  for (const source of [
    "Judge: stop.",
    "Judge: continue. More work remains.",
    "Preface.\nJudge: stop. Enough evidence.",
    "Judge: stop. Enough evidence.\nMore text.",
  ])
    assert.throws(
      () => readJudgeAnswer(source, ["stop", "claude", "codex"]),
      /exactly one/,
    )
})

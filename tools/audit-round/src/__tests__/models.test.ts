import assert from "node:assert/strict"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { test } from "node:test"
import { execa } from "execa"
import {
  clearlyPreferred,
  coderReliabilityDisadvantages,
  speedWords,
  yieldWords,
} from "../model-comparison.js"
import { modelKey, readModelEvidence } from "../model-evidence.js"
import type { RoundData, RoundFinding } from "../round-data.js"
import { writeRoundData } from "../round-data.js"
import { runCommand, testSettings } from "./configured-runner.js"
import { fixture } from "./helpers.js"
import { commitFixture } from "./round-fixture.js"

const modelSamples = (
  yields: readonly number[],
  minutes = 10,
): { readonly yield: number; readonly minutes: number }[] =>
  yields.map((yieldValue) => ({ yield: yieldValue, minutes }))

const selection = (model: string, effort: string | null = "low") => ({
  model,
  effort,
})

const settings = (claude: string, codex: string): RoundData["settings"] => ({
  audit: { claude: selection(claude), codex: selection(codex) },
  vet: {
    claude: selection("claude-vet"),
    codex: selection("codex-vet"),
  },
  fix: { assistant: "codex", ...selection("coder-beta") },
})

const phase = (
  phaseName: RoundData["phases"][number]["phase"],
  assistant: "claude" | "codex",
  model: string,
  milliseconds: number,
): RoundData["phases"][number] => ({
  phase: phaseName,
  assistant,
  model,
  effort: "low",
  milliseconds,
  tokens: [{ model, input: 1000, cached: 500, output: 100 }],
  peakContext: null,
  compactions: 0,
})

const finding = (
  title: string,
  outcome: "kept" | "unmatched" = "kept",
): RoundFinding => ({
  number: outcome === "kept" ? 1 : null,
  title,
  tier: "B",
  reach: "developer",
  complexity: "none",
  growthPattern: "none",
  location: { kind: "repo-edu", area: "tool-audit-round", covers: [] },
  vetVerdict: outcome === "kept" ? "accept" : null,
  rebuttalAnswer: null,
  outcome,
  finalTier: null,
  finalReach: null,
})

const round = (
  target: string,
  roundNumber: number,
  started: string,
  auditor: RoundData["auditor"],
  roundSettings: RoundData["settings"],
  phases: RoundData["phases"],
  commits: RoundData["commits"],
  findings: RoundFinding[] = [finding(`${auditor.model} yield`)],
) => ({
  target,
  round: roundNumber,
  tag: auditor.assistant === "claude" ? "aul" : "oul",
  started,
  status: "finished" as const,
  settings: roundSettings,
  auditor,
  phases,
  commits,
  findings,
  judge: null,
})

async function commit(
  cwd: string,
  subject: string,
  body: string,
  committedAt?: string,
): Promise<string> {
  await execa(
    "git",
    ["commit", "--allow-empty", "-q", "-m", subject, "-m", body],
    {
      cwd,
      env:
        committedAt === undefined
          ? undefined
          : {
              GIT_AUTHOR_DATE: committedAt,
              GIT_COMMITTER_DATE: committedAt,
            },
    },
  )
  return (await execa("git", ["rev-parse", "HEAD"], { cwd })).stdout
}

test("graded yield and speed words cover the four bands and both directions", () => {
  assert.equal(yieldWords(1, 1.03), "the same yield")
  assert.equal(yieldWords(1.1, 1), "marginally higher yield")
  assert.equal(yieldWords(1.3, 1), "higher yield")
  assert.equal(yieldWords(1.5, 1), "much higher yield")
  assert.equal(yieldWords(0, 0.5), "much lower yield")

  assert.equal(speedWords(10, 10.4), "the same speed")
  assert.equal(speedWords(10, 11), "marginally faster")
  assert.equal(speedWords(10, 15), "faster")
  assert.equal(speedWords(10, 20), "much faster")
  assert.equal(speedWords(20, 10), "much slower")
})

test("constant rows can lead while overlapping ranges and yield-against-time trades cannot", () => {
  assert.equal(
    clearlyPreferred(modelSamples([1, 1, 1]), modelSamples([0, 0, 0]), true),
    true,
  )
  assert.equal(
    clearlyPreferred(modelSamples([1, 1, 1]), modelSamples([0, 0, 1]), true),
    false,
  )
  assert.equal(
    clearlyPreferred(
      modelSamples([1, 1, 1], 20),
      modelSamples([0, 0, 0], 5),
      true,
    ),
    false,
  )
})

test("a recommendation must separate every ranked row in both auditor groups", () => {
  const candidate = {
    planning: modelSamples([1, 1, 1, 1, 1]),
    implementation: modelSamples([1, 1, 1, 1, 1]),
  }
  const others = [
    {
      planning: modelSamples([0, 0, 0, 0, 0]),
      implementation: modelSamples([0, 0, 0, 0, 0]),
    },
    {
      planning: modelSamples([0.2, 0.2, 0.2, 0.2, 0.2]),
      implementation: modelSamples([0.1, 0.1, 0.1, 0.1, 0.1]),
    },
  ]
  assert.equal(
    others.every((other) =>
      (["planning", "implementation"] as const).every((group) =>
        clearlyPreferred(candidate[group], other[group], true),
      ),
    ),
    true,
  )
  const overlapping = {
    ...others[1],
    implementation: modelSamples([0, 0, 0, 0, 1]),
  }
  assert.equal(
    ([others[0], overlapping] as const).every((other) =>
      (["planning", "implementation"] as const).every((group) =>
        clearlyPreferred(candidate[group], other[group], true),
      ),
    ),
    false,
  )
})

test("coder spread and worst-plan reliability block independently", () => {
  assert.deepEqual(
    coderReliabilityDisadvantages(
      modelSamples([0, 0.4, 0.4]),
      modelSamples([0.3, 0.3, 0.5]),
    ),
    { spread: true, worst: false },
  )
  assert.deepEqual(
    coderReliabilityDisadvantages(
      modelSamples([0.4, 0.4, 0.4]),
      modelSamples([0, 0.3, 0.3]),
    ),
    { spread: false, worst: true },
  )
})

test("models groups every recorded model, counts rebuttal cost, admits settings openings and excludes mixed and planning-fix coder evidence", async (t) => {
  const f = await fixture(t)
  await writeFile(join(f.root, "pnpm-workspace.yaml"), "packages: []\n")
  await commitFixture(f.root)
  const planRoot = join(f.root, "../plan")
  await commitFixture(planRoot)

  await commit(
    planRoot,
    "mixed/ready: declare the plan ready for implementation",
    "Coder: codex coder-alpha low",
    "2026-09-30T10:00:00Z",
  )
  await commit(
    f.root,
    "mixed/impl-1 obl feat(audit-round): fixture step",
    "coder-alpha low\nImplementation took 10 min.",
    "2026-10-01T09:00:00Z",
  )
  const audit = await commit(
    f.root,
    "mixed/impl-audit-1 obl clean: record the whole-plan audit",
    "coder-alpha low",
    "2026-10-01T10:00:00Z",
  )
  await commit(
    planRoot,
    "mixed/closed obl: close the fixture plan",
    "coder-alpha low",
    "2026-10-01T11:00:00Z",
  )

  const commits = [{ repository: "repo-edu" as const, sha: audit }]

  writeRoundData(join(planRoot, "mixed-impl-rounds.json"), {
    ...round(
      "mixed-impl-01..01",
      1,
      "2026-10-01T10:00:00.000Z",
      {
        assistant: "codex",
        ...selection("audit-alpha"),
        chosenBy: "settings",
      },
      settings("audit-claude", "audit-alpha"),
      [
        phase("audit", "codex", "audit-alpha", 60_000),
        phase("rebut", "codex", "audit-alpha", 120_000),
        phase("fix", "codex", "coder-beta", 60_000),
      ],
      commits,
    ),
    scope: "1",
    judgedRepos: ["repo-edu"],
  })
  writeRoundData(join(planRoot, "mixed-plan-rounds.json"), {
    ...round(
      "mixed-plan",
      1,
      "2026-10-02T10:00:00.000Z",
      {
        assistant: "claude",
        ...selection("audit-claude"),
        chosenBy: "settings",
      },
      settings("audit-claude", "audit-alpha"),
      [
        phase("audit", "claude", "audit-claude", 60_000),
        phase("fix", "codex", "planning-fixer", 60_000),
      ],
      commits,
    ),
    phase: "detailing",
    settling: "",
  })
  writeRoundData(join(planRoot, "mixed-plan-rounds.json"), {
    ...round(
      "mixed-plan",
      2,
      "2026-10-03T10:00:00.000Z",
      {
        assistant: "codex",
        ...selection("audit-third"),
        chosenBy: "settings",
      },
      settings("audit-claude", "audit-third"),
      [phase("audit", "codex", "audit-third", 60_000)],
      commits,
      [finding("kept yield"), finding("unmatched work", "unmatched")],
    ),
    phase: "detailing",
    settling: "",
  })

  const visible: { readonly text: string; readonly format?: "markdown" }[] = []
  const errors: string[] = []
  const code = await runCommand(["models"], f.runtime, {
    repoEduRoot: f.root,
    settings: {
      ...testSettings,
      coders: [
        { assistant: "codex", model: "coder-alpha", effort: "low" },
        { assistant: "codex", model: "coder-beta", effort: "low" },
      ],
    },
    terminal: {
      write: (text, format) => visible.push({ text, format }),
      status: () => {},
      clear: () => {},
    },
    emergency: (text) => errors.push(text),
  })
  assert.equal(code, 0, errors.join("\n"))
  assert.equal(visible.length, 1)
  assert.equal(visible[0].format, "markdown")
  const output = visible[0].text
  assert.match(output, /## Auditors/)
  assert.match(output, /codex audit-alpha low/)
  assert.match(output, /claude audit-claude low/)
  assert.match(output, /codex audit-third low/)
  assert.match(
    output,
    /codex audit-alpha low.+first 1, yield 1\.0, dropped 0\.0, 3\.0 min/,
  )
  assert.match(output, /needs 4 more examples/)
  assert.match(
    output,
    /codex audit-third low.+first none; later 1, yield 1\.0, dropped 0\.0, 1\.0 min; manual 0.+none/,
  )
  assert.match(output, /## Coders/)
  assert.match(output, /codex coder-alpha low.+mixed: mixed model records/)
  assert.match(output, /codex coder-beta low.+mixed: mixed model records/)
  assert.doesNotMatch(output, /planning-fixer/)
  assert.match(output, /the current records do not separate one coder clearly/)
  await assert.rejects(readFile(join(f.root, "calls.jsonl")), {
    code: "ENOENT",
  })
})

test("coder admission needs a current whole-plan audit, counts only kept findings and accepts a plan-repo close", async (t) => {
  const f = await fixture(t)
  await writeFile(join(f.root, "pnpm-workspace.yaml"), "packages: []\n")
  await commitFixture(f.root, undefined, "2026-09-29T10:00:00Z")
  const planRoot = join(f.root, "../plan")
  await commitFixture(planRoot, undefined, "2026-09-29T10:00:00Z")

  const coder = {
    assistant: "codex" as const,
    model: "coder-alpha",
    effort: "low",
  }
  const addReady = (stem: string, at: string) =>
    commit(
      planRoot,
      `${stem}/ready: declare the plan ready for implementation`,
      "Coder: codex coder-alpha low",
      at,
    )
  const addStep = (stem: string, stepNumber: number, at: string) =>
    commit(
      planRoot,
      `${stem}/impl-${stepNumber} obl docs(audit-round): fixture step`,
      "coder-alpha low\nImplementation took 10 min.",
      at,
    )
  const addAudit = (stem: string, scope: string, at: string) =>
    commit(
      planRoot,
      `${stem}/impl-audit-${scope} obl clean: record the audit`,
      "coder-alpha low",
      at,
    )
  const addClose = (stem: string, at: string) =>
    commit(
      planRoot,
      `${stem}/closed obl: close the fixture plan`,
      "coder-alpha low",
      at,
    )
  const writeImplementationRound = (
    stem: string,
    scope: string,
    audit: string,
    started: string,
    findings: RoundFinding[] = [finding(`${stem} yield`)],
  ) =>
    writeRoundData(join(planRoot, `${stem}-impl-rounds.json`), {
      ...round(
        `${stem}-impl-${scope.replace("-", "..")}`,
        1,
        started,
        {
          assistant: "codex",
          ...selection("audit-alpha"),
          chosenBy: "settings",
        },
        settings("audit-claude", "audit-alpha"),
        [phase("audit", "codex", "audit-alpha", 60_000)],
        [{ repository: "plan", sha: audit }],
        findings,
      ),
      scope,
      judgedRepos: ["plan"],
    })

  await addReady("plan-only", "2026-10-01T08:00:00Z")
  await addStep("plan-only", 1, "2026-10-01T09:00:00Z")
  const planOnlyAudit = await addAudit("plan-only", "1", "2026-10-01T09:00:00Z")
  await addClose("plan-only", "2026-10-01T11:00:00Z")
  writeImplementationRound(
    "plan-only",
    "1",
    planOnlyAudit,
    "2026-10-01T10:00:00.000Z",
    [finding("accepted defect"), finding("unmatched work", "unmatched")],
  )

  await addReady("partial", "2026-10-02T08:00:00Z")
  await addStep("partial", 1, "2026-10-02T09:00:00Z")
  await addStep("partial", 2, "2026-10-02T10:00:00Z")
  const partialAudit = await addAudit("partial", "1", "2026-10-02T11:00:00Z")
  await addClose("partial", "2026-10-02T12:00:00Z")
  writeImplementationRound(
    "partial",
    "1",
    partialAudit,
    "2026-10-02T11:00:00.000Z",
  )

  await addReady("stale", "2026-10-03T08:00:00Z")
  await addStep("stale", 1, "2026-10-03T09:00:00Z")
  await addStep("stale", 2, "2026-10-03T10:00:00Z")
  const staleAudit = await addAudit("stale", "1-2", "2026-10-03T11:00:00Z")
  await addStep("stale", 2, "2026-10-03T12:00:00Z")
  await addClose("stale", "2026-10-03T13:00:00Z")
  writeImplementationRound(
    "stale",
    "1-2",
    staleAudit,
    "2026-10-03T11:00:00.000Z",
  )

  const evidence = await readModelEvidence({ repoEduRoot: f.root, planRoot })
  const row = evidence.coders.get(modelKey(coder))
  assert.ok(row)
  assert.deepEqual(
    row.samples.map((sample) => ({ stem: sample.stem, yield: sample.yield })),
    [{ stem: "plan-only", yield: 1 }],
  )
  assert.equal(
    row.excluded.get("partial"),
    "no complete whole-plan audit after the final step",
  )
  assert.equal(
    row.excluded.get("stale"),
    "no complete whole-plan audit after the final step",
  )
})

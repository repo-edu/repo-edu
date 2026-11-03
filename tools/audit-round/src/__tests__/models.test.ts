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

  const commit = async (cwd: string, subject: string, body: string) => {
    await execa(
      "git",
      ["commit", "--allow-empty", "-q", "-m", subject, "-m", body],
      { cwd },
    )
    return (await execa("git", ["rev-parse", "HEAD"], { cwd })).stdout
  }
  await commit(
    planRoot,
    "mixed/ready: declare the plan ready for implementation",
    "Coder: codex coder-alpha low",
  )
  const step = await commit(
    f.root,
    "mixed/impl-1 obl feat(audit-round): fixture step",
    "coder-alpha low\nImplementation took 10 min.",
  )
  await commit(
    f.root,
    "mixed/closed obl: close the fixture plan",
    "coder-alpha low",
  )

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
  const finding = (title: string): RoundFinding => ({
    number: 1,
    title,
    tier: "B",
    reach: "developer",
    complexity: "none",
    growthPattern: "none",
    location: { kind: "repo-edu", area: "tool-audit-round", covers: [] },
    vetVerdict: "accept",
    rebuttalAnswer: null,
    outcome: "kept",
    finalTier: null,
    finalReach: null,
  })
  const common = (
    target: string,
    round: number,
    started: string,
    auditor: RoundData["auditor"],
    roundSettings: RoundData["settings"],
    phases: RoundData["phases"],
  ) => ({
    target,
    round,
    tag: auditor.assistant === "claude" ? "aul" : "oul",
    started,
    status: "finished" as const,
    settings: roundSettings,
    auditor,
    phases,
    commits: [{ repository: "repo-edu" as const, sha: step }],
    findings: [finding(`${auditor.model} yield`)],
    judge: null,
  })

  writeRoundData(join(planRoot, "mixed-impl-rounds.json"), {
    ...common(
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
    ),
    scope: "1",
    judgedRepos: ["repo-edu"],
  })
  writeRoundData(join(planRoot, "mixed-plan-rounds.json"), {
    ...common(
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
    ),
    phase: "detailing",
    settling: "",
  })
  writeRoundData(join(planRoot, "mixed-plan-rounds.json"), {
    ...common(
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
  assert.match(output, /## Coders/)
  assert.match(output, /codex coder-alpha low.+mixed: mixed model records/)
  assert.match(output, /codex coder-beta low.+mixed: mixed model records/)
  assert.doesNotMatch(output, /planning-fixer/)
  assert.match(output, /the current records do not separate one coder clearly/)
  await assert.rejects(readFile(join(f.root, "calls.jsonl")), {
    code: "ENOENT",
  })
})

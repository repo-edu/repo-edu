import assert from "node:assert/strict"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { test } from "node:test"
import { execa } from "execa"
import type { RoundData, RoundFinding } from "../round-data.js"
import { writeRoundData } from "../round-data.js"
import { runCommand } from "./configured-runner.js"
import { fixture } from "./helpers.js"
import { commitFixture } from "./round-fixture.js"

const sha40 = "0123456789abcdef0123456789abcdef01234567"
const selection = (model: string, effort: string | null) => ({ model, effort })

test("trial reads the newest settings run, cross-checks completed rounds, counts their drops and averages incomplete work", async (t) => {
  const f = await fixture(t)
  await writeFile(join(f.root, "pnpm-workspace.yaml"), "packages: []\n")
  await commitFixture(f.root)
  const planRoot = join(f.root, "../plan")
  await commitFixture(planRoot)
  const record = async (
    repository: "repo-edu" | "plan",
    tag: string,
    title: string | null,
    reach = "developer",
  ) => {
    const subject =
      title === null
        ? `trial/impl-audit-1 ${tag} clean: clean fixture`
        : `trial/impl-audit-1 ${tag} growth-none ${reach === "developer" ? "b1" : "B1"} fix(audit-round): fixture finding`
    const body = [
      "gpt-6.1-sol xhigh",
      "",
      ...(title === null
        ? []
        : [
            repository === "repo-edu"
              ? `- [B] [area:tool-audit-round] [growth-pattern:none] [reach:${reach}] [complexity:none] ${title}: Fixture explanation.`
              : `- B [section:decisions] [growth-pattern:none] [reach:${reach}] [complexity:none] ${title}: Fixture explanation.`,
            "",
          ]),
      `Round yield: ${reach === "ordinary" && title !== null ? 1 : 0} ordinary; ${reach === "rare" && title !== null ? 1 : 0} rare; ${reach === "developer" && title !== null ? 1 : 0} developer.`,
      "Structure: 0 removing, 0 adding, 0 flat.",
    ].join("\n")
    await execa(
      "git",
      ["commit", "--allow-empty", "-q", "-m", subject, "-m", body],
      {
        cwd: repository === "repo-edu" ? f.root : planRoot,
      },
    )
    const sha = (
      await execa("git", ["rev-parse", "HEAD"], {
        cwd: repository === "repo-edu" ? f.root : planRoot,
      })
    ).stdout
    return sha
  }
  const earlier = await record("repo-edu", "otx", "Earlier yield", "rare")
  const other = await record("repo-edu", "atx", "Other assistant yield")
  const later = await record("repo-edu", "obx", "Later yield", "ordinary")
  const laterPlan = await record("plan", "obx", "Later yield", "ordinary")
  const clean = await record("repo-edu", "otx", null)
  const sameSetting = await record("repo-edu", "obx", "Same-setting yield")

  const settings: RoundData["settings"] = {
    audit: {
      claude: selection("claude-opus-5", "xhigh"),
      codex: [selection("gpt-top", "xhigh"), selection("gpt-base", "xhigh")],
    },
    vet: {
      claude: selection("claude-vet", "high"),
      codex: selection("codex-vet", "high"),
    },
    fix: {
      assistant: "codex",
      ...selection("codex-fix", "high"),
    },
  }
  const oldSettings: RoundData["settings"] = {
    ...settings,
    fix: { ...settings.fix, model: "old-fixer" },
  }
  const phase = (
    assistant: "claude" | "codex",
    model: string,
    milliseconds: number,
  ): RoundData["phases"][number] => ({
    phase: "audit",
    assistant,
    model,
    effort: "xhigh",
    milliseconds,
    tokens: [{ model, input: 1000, cached: 500, output: 100 }],
    peakContext: { tokens: 10_000, window: 100_000 },
    compactions: 0,
  })
  const finding = (
    title: string,
    fields: Partial<RoundFinding> = {},
  ): RoundFinding => ({
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
    ...fields,
  })
  const drop = (
    title: string,
    tier: RoundFinding["tier"],
    reach: RoundFinding["reach"],
  ): RoundFinding =>
    finding(title, {
      number: 2,
      tier,
      reach,
      vetVerdict: "drop",
      rebuttalAnswer: "agree",
      outcome: "dropped",
    })
  const findings = new Map<string, readonly RoundFinding[]>([
    [
      "target-impl-01..01#2",
      [
        finding("Earlier yield", { reach: "rare" }),
        drop("Earlier drop", "C", "ordinary"),
      ],
    ],
    ["target-impl-01..01#4", [finding("Other assistant yield")]],
    ["target-impl-01..01#5", [finding("Later yield", { reach: "ordinary" })]],
    ["target-impl-01..01#7", [finding("Same-setting yield")]],
    [
      "target-impl-01..01#8",
      [finding("In-progress yield"), drop("In-progress drop", "A", "rare")],
    ],
    ["target-impl-01..01#9", [finding("Awaiting ruling yield")]],
    ["target-impl-01..01#10", [finding("Unsettled yield", { outcome: null })]],
    ["archived-impl-01..01#1", [finding("Interrupted yield")]],
  ])
  const data = (
    target: string,
    round: number,
    started: string,
    auditor: RoundData["auditor"],
    roundSettings: RoundData["settings"],
    commits: RoundData["commits"] = [],
    status: RoundData["status"] = "finished",
  ): RoundData => ({
    target,
    round,
    tag:
      auditor.assistant === "claude"
        ? "atx"
        : auditor.model === "gpt-base"
          ? "obx"
          : auditor.model === "gpt-top"
            ? "otx"
            : "oux",
    started,
    status,
    settings: roundSettings,
    auditor,
    phases: [
      phase(auditor.assistant, auditor.model, round * 1000),
      ...(round === 5 || auditor.chosenBy === "--first"
        ? [{ ...phase("codex", "gpt-judge", 1000), phase: "judge" as const }]
        : []),
    ],
    commits,
    findings: [...(findings.get(`${target}#${round}`) ?? [])],
    judge: null,
    scope: "1",
    judgedRepos: ["repo-edu"],
  })
  const rounds: readonly [string, RoundData][] = [
    [
      "old-impl-01..01-01-1-round.otx.json",
      data(
        "old-impl-01..01",
        1,
        "2026-10-01T10:00:00.000Z",
        {
          assistant: "codex",
          ...selection("old-auditor", "xhigh"),
          chosenBy: "settings",
        },
        oldSettings,
        [{ repository: "repo-edu", sha: sha40 }],
      ),
    ],
    [
      "target-impl-01..01-02-1-round.otx.json",
      data(
        "target-impl-01..01",
        2,
        "2026-10-02T10:00:00.000Z",
        {
          assistant: "codex",
          ...selection("gpt-top", "xhigh"),
          chosenBy: "settings",
        },
        settings,
        [{ repository: "repo-edu", sha: earlier }],
      ),
    ],
    [
      "manual-impl-01..01-03-1-round.oux.json",
      data(
        "manual-impl-01..01",
        3,
        "2026-10-03T10:00:00.000Z",
        {
          assistant: "codex",
          ...selection("manual-model", "xhigh"),
          chosenBy: "--auditor",
        },
        settings,
        [{ repository: "repo-edu", sha: sha40 }],
      ),
    ],
    [
      "first-impl-01..01-03-3-round.otx.json",
      data(
        "first-impl-01..01",
        1,
        "2026-10-03T14:00:00.000Z",
        {
          assistant: "codex",
          ...selection("gpt-top", "xhigh"),
          chosenBy: "--first",
        },
        settings,
        [{ repository: "repo-edu", sha: clean }],
      ),
    ],
    [
      "target-impl-01..01-04-1-round.atx.json",
      data(
        "target-impl-01..01",
        4,
        "2026-10-04T10:00:00.000Z",
        {
          assistant: "claude",
          ...selection("claude-opus-5", "xhigh"),
          chosenBy: "settings",
        },
        settings,
        [{ repository: "repo-edu", sha: other }],
      ),
    ],
    [
      "target-impl-01..01-05-1-round.obx.json",
      data(
        "target-impl-01..01",
        5,
        "2026-10-05T10:00:00.000Z",
        {
          assistant: "codex",
          ...selection("gpt-base", "xhigh"),
          chosenBy: "settings",
        },
        settings,
        [
          { repository: "repo-edu", sha: later },
          { repository: "plan", sha: laterPlan },
        ],
      ),
    ],
    [
      "no-commit-impl-01..01-06-2-round.obx.json",
      data(
        "no-commit-impl-01..01",
        1,
        "2026-10-06T11:00:00.000Z",
        {
          assistant: "codex",
          ...selection("gpt-base", "xhigh"),
          chosenBy: "settings",
        },
        settings,
        [],
        "failed",
      ),
    ],
    [
      "other-impl-01..01-06-1-round.otx.json",
      data(
        "other-impl-01..01",
        6,
        "2026-10-06T10:00:00.000Z",
        {
          assistant: "codex",
          ...selection("gpt-top", "xhigh"),
          chosenBy: "settings",
        },
        settings,
        [{ repository: "repo-edu", sha: clean }],
        "failed",
      ),
    ],
    [
      "target-impl-01..01-07-1-round.obx.json",
      data(
        "target-impl-01..01",
        7,
        "2026-10-07T10:00:00.000Z",
        {
          assistant: "codex",
          ...selection("gpt-base", "xhigh"),
          chosenBy: "settings",
        },
        settings,
        [{ repository: "repo-edu", sha: sameSetting }],
      ),
    ],
    [
      "target-impl-01..01-08-1-round.otx.json",
      data(
        "target-impl-01..01",
        8,
        "2026-10-08T10:00:00.000Z",
        {
          assistant: "codex",
          ...selection("gpt-top", "xhigh"),
          chosenBy: "settings",
        },
        settings,
        [{ repository: "repo-edu", sha: clean }],
        "in-progress",
      ),
    ],
    [
      "target-impl-01..01-09-1-round.obx.json",
      data(
        "target-impl-01..01",
        9,
        "2026-10-09T10:00:00.000Z",
        {
          assistant: "codex",
          ...selection("gpt-base", "xhigh"),
          chosenBy: "settings",
        },
        settings,
        [{ repository: "repo-edu", sha: clean }],
        "awaiting-ruling",
      ),
    ],
    [
      "target-impl-01..01-10-1-round.otx.json",
      data(
        "target-impl-01..01",
        10,
        "2026-10-10T10:00:00.000Z",
        {
          assistant: "codex",
          ...selection("gpt-top", "xhigh"),
          chosenBy: "settings",
        },
        settings,
        [{ repository: "repo-edu", sha: clean }],
        "failed",
      ),
    ],
  ]
  for (const [, round] of rounds)
    writeRoundData(join(planRoot, "trial-impl-rounds.json"), round)
  const archivedData = join(
    planRoot,
    "archive/archived/archived-impl-rounds.json",
  )
  await mkdir(join(planRoot, "archive/archived"), { recursive: true })
  writeRoundData(
    archivedData,
    data(
      "archived-impl-01..01",
      1,
      "2026-10-06T12:00:00.000Z",
      {
        assistant: "codex",
        ...selection("gpt-base", "xhigh"),
        chosenBy: "settings",
      },
      settings,
      [{ repository: "repo-edu", sha: clean }],
      "interrupted",
    ),
  )

  const visible: { readonly text: string; readonly format?: "markdown" }[] = []
  const errors: string[] = []
  const code = await runCommand(["trial"], f.runtime, {
    repoEduRoot: f.root,
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
  assert.match(output, /Newest unchanged-settings run: 11 rounds/)
  assert.match(output, /codex: gpt-top xhigh versus gpt-base xhigh/)
  assert.doesNotMatch(output, /old-impl-01..01|old-auditor/)
  assert.doesNotMatch(output, /manual-impl-01..01|manual-model/)
  assert.match(output, /first-impl-01..01 #1 \| otx \| codex gpt-top xhigh/)
  assert.match(
    output,
    /target-impl-01..01 #5 \| obx \| codex gpt-base xhigh \| otx: B rare — Earlier yield \|/,
  )
  assert.match(output, /target-impl-01..01 #2 .*\| B rare — Earlier yield \|/)
  assert.doesNotMatch(output, /Earlier drop|In-progress drop/)
  assert.match(
    output,
    /target-impl-01..01 #7 \| obx \| codex gpt-base xhigh \| not paired: same setting/,
  )
  assert.match(
    output,
    /target-impl-01..01 #8 .*not paired: incomplete.*incomplete/,
  )
  assert.match(
    output,
    /target-impl-01..01 #9 .*not paired: incomplete.*incomplete/,
  )
  assert.match(
    output,
    /target-impl-01..01 #10 .*not paired: incomplete.*incomplete/,
  )
  assert.match(
    output,
    /no-commit-impl-01..01 #1 .*not paired: incomplete.*incomplete/,
  )
  assert.match(
    output,
    /archived-impl-01..01 #1 .*B developer — Interrupted yield/,
  )
  assert.doesNotMatch(output, /other-impl-01..01 #6 [^\n]*incomplete/)
  assert.doesNotMatch(
    output,
    /In-progress yield|Awaiting ruling yield|Unsettled yield/,
  )
  assert.match(output, /total 00:06; audit 00:05; judge 00:01/)
  assert.match(
    output,
    /codex gpt-base xhigh \| all \| 5 \| 3 \| 00:04 \| audit 00:04; judge 00:00 \| B ordinary 0\.3; B developer 0\.7 \| none \| gpt-base: input 1\.0k, cached 0\.5k, output 0\.1k; gpt-judge: input 0\.2k/,
  )
  assert.match(
    output,
    /codex gpt-base xhigh \| first \| 2 \| 1 \| 00:01 \| audit 00:01 \| B developer 1\.0 \| none \| gpt-base: input 1\.0k, cached 0\.5k, output 0\.1k \|/,
  )
  assert.match(
    output,
    /codex gpt-base xhigh \| later \| 3 \| 2 \| 00:07 \| audit 00:07; judge 00:00 \| B ordinary 0\.5; B developer 0\.5 \| none \| gpt-base: input 1\.0k, cached 0\.5k, output 0\.1k; gpt-judge: input 0\.3k/,
  )
  assert.match(output, /archived-impl-01..01 #1/)
  assert.match(
    output,
    /codex gpt-top xhigh \| all \| 5 \| 3 \| 00:05 \| audit 00:05; judge 00:00 \| B rare 0\.3 \| C ordinary 0\.3 \| gpt-top: input 1\.0k, cached 0\.5k, output 0\.1k; gpt-judge: input 0\.2k/,
  )
  assert.match(
    output,
    /codex gpt-top xhigh \| first \| 1 \| 1 \| 00:02 \| audit 00:01; judge 00:01 \| none \| none \|/,
  )
  assert.match(
    output,
    /codex gpt-top xhigh \| later \| 4 \| 2 \| 00:06 \| audit 00:06 \| B rare 0\.5 \| C ordinary 0\.5 \| gpt-top: input 1\.0k, cached 0\.5k, output 0\.1k \|/,
  )
  assert.match(
    output,
    /claude claude-opus-5 xhigh \| all \| 1 \| 1 \| 00:04 \| audit 00:04 \| B developer 1\.0 \| none \|/,
  )
  await assert.rejects(readFile(join(f.root, "calls.jsonl")), {
    code: "ENOENT",
  })
})

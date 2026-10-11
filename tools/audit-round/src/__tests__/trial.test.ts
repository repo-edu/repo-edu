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

test("trial reads the newest settings run, cross-checks completed rounds and totals incomplete work", async (t) => {
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
        ? `trial/impl-audit-all ${tag} clean: clean fixture`
        : `trial/impl-audit-all ${tag} growth-none ${reach === "developer" ? "b1" : "B1"} fix(audit-round): fixture finding`
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
    reach: RoundFinding["reach"] = "developer",
    outcome: RoundFinding["outcome"] = "kept",
  ): RoundFinding => ({
    number: 1,
    title,
    tier: "B",
    reach,
    complexity: "none",
    growthPattern: "none",
    location: { kind: "repo-edu", area: "tool-audit-round", covers: [] },
    vetVerdict: "accept",
    rebuttalAnswer: null,
    outcome,
    finalTier: null,
    finalReach: null,
  })
  const findings = new Map<string, readonly RoundFinding[]>([
    ["target-impl-all#2", [finding("Earlier yield", "rare")]],
    ["target-impl-all#4", [finding("Other assistant yield")]],
    ["target-impl-all#5", [finding("Later yield", "ordinary")]],
    ["target-impl-all#7", [finding("Same-setting yield")]],
    ["target-impl-all#8", [finding("In-progress yield")]],
    ["target-impl-all#9", [finding("Awaiting ruling yield")]],
    ["target-impl-all#10", [finding("Unsettled yield", "developer", null)]],
    ["archived-impl-all#1", [finding("Interrupted yield")]],
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
      auditor.chosenBy === "command-line"
        ? "oux"
        : auditor.assistant === "claude"
          ? "atx"
          : auditor.model === "gpt-base"
            ? "obx"
            : "otx",
    started,
    status,
    settings: roundSettings,
    auditor,
    phases: [
      phase(auditor.assistant, auditor.model, round * 1000),
      ...(round === 5
        ? [{ ...phase("codex", "gpt-judge", 1000), phase: "judge" as const }]
        : []),
    ],
    commits,
    findings: [...(findings.get(`${target}#${round}`) ?? [])],
    judge: null,
    scope: "all",
    judgedRepos: ["repo-edu"],
  })
  const rounds: readonly [string, RoundData][] = [
    [
      "old-impl-all-01-1-round.otx.json",
      data(
        "old-impl-all",
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
      "target-impl-all-02-1-round.otx.json",
      data(
        "target-impl-all",
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
      "manual-impl-all-03-1-round.oux.json",
      data(
        "manual-impl-all",
        3,
        "2026-10-03T10:00:00.000Z",
        {
          assistant: "codex",
          ...selection("manual-model", "xhigh"),
          chosenBy: "command-line",
        },
        oldSettings,
        [{ repository: "repo-edu", sha: sha40 }],
      ),
    ],
    [
      "target-impl-all-04-1-round.atx.json",
      data(
        "target-impl-all",
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
      "target-impl-all-05-1-round.obx.json",
      data(
        "target-impl-all",
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
      "other-impl-all-06-1-round.otx.json",
      data(
        "other-impl-all",
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
      "target-impl-all-07-1-round.obx.json",
      data(
        "target-impl-all",
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
      "target-impl-all-08-1-round.otx.json",
      data(
        "target-impl-all",
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
      "target-impl-all-09-1-round.obx.json",
      data(
        "target-impl-all",
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
      "target-impl-all-10-1-round.otx.json",
      data(
        "target-impl-all",
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
      "archived-impl-all",
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
  assert.match(output, /Newest unchanged-settings run: 9 rounds/)
  assert.match(output, /codex: gpt-top xhigh versus gpt-base xhigh/)
  assert.doesNotMatch(
    output,
    /old-impl-all|old-auditor|manual-impl-all|manual-model/,
  )
  assert.match(
    output,
    /target-impl-all #5 \| obx \| codex gpt-base xhigh \| otx: B rare — Earlier yield/,
  )
  assert.match(
    output,
    /target-impl-all #7 \| obx \| codex gpt-base xhigh \| not paired: same setting/,
  )
  assert.match(
    output,
    /target-impl-all #8 .*not paired: incomplete.*incomplete/,
  )
  assert.match(
    output,
    /target-impl-all #9 .*not paired: incomplete.*incomplete/,
  )
  assert.match(
    output,
    /target-impl-all #10 .*not paired: incomplete.*incomplete/,
  )
  assert.match(output, /archived-impl-all #1 .*B developer — Interrupted yield/)
  assert.doesNotMatch(output, /other-impl-all #6 [^\n]*incomplete/)
  assert.doesNotMatch(
    output,
    /In-progress yield|Awaiting ruling yield|Unsettled yield/,
  )
  assert.match(output, /total 00:06; audit 00:05; judge 00:01/)
  assert.match(
    output,
    /codex gpt-base xhigh \| 4 \| 00:23 \| audit 00:22; judge 00:01/,
  )
  assert.match(output, /archived-impl-all #1/)
  assert.match(output, /codex gpt-top xhigh \| 4 \|/)
  assert.match(output, /B ordinary 1/)
  assert.match(output, /gpt-top: input 4\.0k, cached 2\.0k, output 0\.4k/)
  await assert.rejects(readFile(join(f.root, "calls.jsonl")), {
    code: "ENOENT",
  })
})

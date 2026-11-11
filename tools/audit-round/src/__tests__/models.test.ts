import assert from "node:assert/strict"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { type TestContext, test } from "node:test"
import { execa } from "execa"
import {
  type AuditorPlanComparison,
  type AuditorPlanSample,
  auditorTimeGroup,
  auditorYieldGroups,
  clearlyPreferred,
  clearlyPreferredMeasures,
  compareAuditorPlans,
  hasUnevenOpeners,
} from "../model-comparison.js"
import { modelKey, readModelEvidence } from "../model-evidence.js"
import { modelsReport } from "../models.js"
import type { RoundData, RoundFinding } from "../round-data.js"
import { writeDisprovedFinding, writeRoundData } from "../round-data.js"
import { runCommand, testSettings } from "./configured-runner.js"
import { fixture } from "./helpers.js"
import { commitFixture } from "./round-fixture.js"

const modelSamples = (
  yields: readonly number[],
  minutes = 10,
): { readonly yield: number; readonly minutes: number }[] =>
  yields.map((yieldValue) => ({ yield: yieldValue, minutes }))

const planSample = (
  plan: string,
  yieldValue: number,
  options: { readonly first?: boolean; readonly minutes?: number } = {},
): AuditorPlanSample => ({
  plan,
  yield: yieldValue,
  first: options.first ?? false,
  minutes: options.minutes ?? 10,
})

const selection = (model: string, effort: string | null = "low") => ({
  model,
  effort,
})

const settings: RoundData["settings"] = {
  vet: {
    claude: selection("claude-vet"),
    codex: selection("codex-vet"),
  },
  fix: { assistant: "codex", ...selection("coder-beta") },
}

const phase = (
  phaseName: RoundData["phases"][number]["phase"],
  assistant: "claude" | "codex",
  model: string,
  milliseconds: number,
  effort = "low",
): RoundData["phases"][number] => ({
  phase: phaseName,
  assistant,
  model,
  effort,
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

async function modelFixture(t: TestContext) {
  const f = await fixture(t)
  await writeFile(join(f.root, "pnpm-workspace.yaml"), "packages: []\n")
  await commitFixture(f.root)
  const planRoot = join(f.root, "../plan")
  const activeRoot = join(planRoot, "active")
  await commitFixture(planRoot)
  return { ...f, planRoot, activeRoot }
}

test("the model read-out ignores commit round data", async (t) => {
  const f = await modelFixture(t)
  await writeFile(
    join(f.activeRoot, "commit-abc123-rounds.json"),
    "not plan round data\n",
  )

  const evidence = await readModelEvidence({
    repoEduRoot: f.root,
    planRoot: f.planRoot,
    activeRoot: f.activeRoot,
  })
  assert.equal(evidence.auditors.size, 0)
  assert.deepEqual(evidence.disproved, [])
})

type StepHost = "repo-edu" | "plan" | "both"

function archivedPlanSource(hosts: readonly StepHost[]): string {
  const sentence = (host: StepHost) =>
    host === "repo-edu"
      ? "Hosted in Repo Edu."
      : host === "plan"
        ? "Hosted in the plan repo."
        : "Hosted in both repos."
  return `# Fixture plan

## Implementation plan

${hosts
  .map(
    (host, index) =>
      `${index + 1}. **Fixture step ${index + 1}.** ${sentence(host)}`,
  )
  .join("\n")}
`
}

async function archivePlan(
  planRoot: string,
  stem: string,
  hosts: readonly StepHost[],
  splitPeer = false,
): Promise<string> {
  const directory = join(planRoot, "archive", stem)
  await mkdir(directory, { recursive: true })
  await writeFile(
    join(directory, splitPeer ? `${stem}.md` : "plan.md"),
    archivedPlanSource(hosts),
  )
  return directory
}

function findings(count: number, label: string): RoundFinding[] {
  return Array.from({ length: count }, (_, index) => ({
    ...finding(`${label} ${index + 1}`),
    number: index + 1,
  }))
}

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
  assert.equal(
    clearlyPreferredMeasures(
      modelSamples([0, 0, 0]),
      modelSamples([1, 1, 1]),
      [],
      [],
      false,
    ),
    false,
  )
})

test("auditor tables compare the same plans and sort by the average gap", async (t) => {
  const f = await modelFixture(t)
  const audit = await commit(
    f.root,
    "evidence/impl-audit-1 obl clean: fixture audit",
    "coder-alpha low",
  )
  const commits = [{ repository: "repo-edu" as const, sha: audit }]
  const path = join(f.activeRoot, "ranking-plan-rounds.json")
  const auditors = [
    ["claude", "audit-strong", 2, 120_000, "10"],
    ["codex", "audit-middle", 1, 60_000, "11"],
    ["codex", "audit-weak", 0, 180_000, "12"],
  ] as const
  for (const [assistant, model, accepted, duration, hour] of auditors)
    for (let index = 1; index <= 5; index += 1)
      writeRoundData(path, {
        ...round(
          `${model}-plan-audit`,
          index,
          `2026-10-${String(index).padStart(2, "0")}T${hour}:00:00.000Z`,
          { assistant, ...selection(model), chosenBy: "settings" },
          settings,
          [phase("audit", assistant, model, duration)],
          commits,
          findings(accepted, `${model} claim`),
        ),
        phase: "detailing",
        settling: "",
      })

  const report = await modelsReport(
    { repoEduRoot: f.root, planRoot: f.planRoot, activeRoot: f.activeRoot },
    testSettings,
  )
  const planning = report
    .split("## Planning auditors\n\n")[1]
    .split("\n\n## Implementation auditors")[0]
  assert.equal(
    planning,
    [
      "- No auditor has five shared plans for the yield comparison.",
      "- No auditor has five shared plans for the time comparison.",
      "- `audit-strong low` needs 4 more shared plans before it is compared.",
      "- `audit-middle low` needs 4 more shared plans before it is compared.",
      "- `audit-weak low` needs 4 more shared plans before it is compared.",
      "",
      "| Model | Plans | Own findings in rounds | Own average by plan | Others on same plans | Others average by plan | Minutes per round | Wrong claims |",
      "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
      "| audit-strong low | 1 | 10 in 5 | 2.00 | 5 in 10 | 0.50 | 2.0 | 0% |",
      "| audit-middle low | 1 | 5 in 5 | 1.00 | 10 in 10 | 1.00 | 1.0 | 0% |",
      "| audit-weak low | 1 | 0 in 5 | 0.00 | 15 in 10 | 1.50 | 3.0 | 0% |",
    ].join("\n"),
  )
  const implementation = report
    .split("## Implementation auditors\n\n")[1]
    .split("\n\nAuditor rows sort by")[0]
  assert.equal(
    implementation,
    [
      "No implementation auditor records are available.",
      "",
      "| Model | Plans | Own findings in rounds | Own average by plan | Others on same plans | Others average by plan | Minutes per round | Wrong claims |",
      "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ].join("\n"),
  )
})

test("same-plan gap sorting does not reward a model for auditing harder plans", async (t) => {
  const f = await modelFixture(t)
  const audit = await commit(
    f.root,
    "evidence/impl-audit-1 obl clean: fixture audit",
    "coder-alpha low",
  )
  const commits = [{ repository: "repo-edu" as const, sha: audit }]
  for (let plan = 1; plan <= 5; plan += 1) {
    const hardPath = join(f.activeRoot, `hard-${plan}-plan-rounds.json`)
    for (const [model, kept, hour] of [
      ["hard-model", 2, "10"],
      ["hard-peer", 3, "11"],
    ] as const)
      writeRoundData(hardPath, {
        ...round(
          `${model}-planning`,
          1,
          `2026-10-${String(plan).padStart(2, "0")}T${hour}:00:00.000Z`,
          {
            assistant: model === "hard-model" ? "claude" : "codex",
            ...selection(model),
            chosenBy: "settings",
          },
          settings,
          [
            phase(
              "audit",
              model === "hard-model" ? "claude" : "codex",
              model,
              60_000,
            ),
          ],
          commits,
          findings(kept, `${model} claim`),
        ),
        phase: "detailing",
        settling: "",
      })

    const easyPath = join(f.activeRoot, `easy-${plan}-plan-rounds.json`)
    for (let roundNumber = 1; roundNumber <= 5; roundNumber += 1)
      writeRoundData(easyPath, {
        ...round(
          "easy-model-planning",
          roundNumber,
          `2026-10-${String(plan).padStart(2, "0")}T12:0${roundNumber}:00.000Z`,
          {
            assistant: "claude",
            ...selection("easy-model"),
            chosenBy: "settings",
          },
          settings,
          [phase("audit", "claude", "easy-model", 60_000)],
          commits,
          roundNumber === 1 ? findings(1, "easy claim") : [],
        ),
        phase: "detailing",
        settling: "",
      })
    writeRoundData(easyPath, {
      ...round(
        "easy-peer-planning",
        1,
        `2026-10-${String(plan).padStart(2, "0")}T13:00:00.000Z`,
        {
          assistant: "codex",
          ...selection("easy-peer"),
          chosenBy: "settings",
        },
        settings,
        [phase("audit", "codex", "easy-peer", 60_000)],
        commits,
        [],
      ),
      phase: "detailing",
      settling: "",
    })
  }

  const report = await modelsReport(
    { repoEduRoot: f.root, planRoot: f.planRoot, activeRoot: f.activeRoot },
    testSettings,
  )
  const planning = report
    .split("## Planning auditors\n\n")[1]
    .split("\n\n## Implementation auditors")[0]
  assert.ok(
    planning.indexOf("| easy-model low |") <
      planning.indexOf("| hard-model low |"),
  )
  assert.match(
    planning,
    /\| easy-model low \| 5 \| 5 in 25 \| 0\.20 \| 0 in 5 \| 0\.00/,
  )
  assert.match(
    planning,
    /\| hard-model low \| 5 \| 10 in 5 \| 2\.00 \| 15 in 5 \| 3\.00/,
  )
})

test("same-plan comparison gives each plan equal weight and pools every other auditor within it", () => {
  const comparison = compareAuditorPlans(
    [
      planSample("alpha", 2, { first: true }),
      planSample("alpha", 0),
      planSample("beta", 0),
      planSample("solo", 9, { first: true }),
    ],
    [
      [planSample("alpha", 1), planSample("beta", 2, { first: true })],
      [planSample("beta", 0), planSample("beta", 1)],
    ],
  )

  assert.deepEqual(comparison, {
    plans: 2,
    ownFindings: 2,
    ownRounds: 3,
    ownAverage: 0.5,
    otherFindings: 4,
    otherRounds: 4,
    otherAverage: 1,
    openedPlans: 1,
    evenOpenedPlans: 1 / 3 + 1 / 2,
  })
})

test("auditor groupings cover yield factors, zeroes, time bounds and thin-row exclusion", () => {
  const row = (
    name: string,
    ownAverage: number,
    otherAverage: number,
    minutes: number,
    plans = 5,
  ) => ({
    name,
    minutes,
    comparison: {
      plans,
      ownFindings: 0,
      ownRounds: 0,
      ownAverage,
      otherFindings: 0,
      otherRounds: 0,
      otherAverage,
      openedPlans: 0,
      evenOpenedPlans: 0,
    },
  })
  const ahead = row("ahead", 1.25, 1, 4)
  const behind = row("behind", 0, 1, 9)
  const evenZero = row("zero", 0, 0, 3)
  const thin = row("thin", 9, 0, 1, 4)
  const eligible = [ahead, behind, evenZero, thin].filter(
    (candidate) => candidate.comparison.plans >= 5,
  )
  const groups = auditorYieldGroups(
    eligible,
    (candidate) => candidate.comparison,
  )
  assert.deepEqual(
    groups.more.map((candidate) => candidate.name),
    ["ahead"],
  )
  assert.deepEqual(
    groups.fewer.map((candidate) => candidate.name),
    ["behind"],
  )
  assert.deepEqual(
    auditorTimeGroup(eligible, (candidate) => candidate.minutes),
    { fastest: evenZero, slower: [behind] },
  )
  assert.deepEqual(
    auditorTimeGroup(
      [row("fast", 1, 1, 5), row("twice", 1, 1, 10)],
      (candidate) => candidate.minutes,
    ).slower,
    [],
  )
})

test("opener bounds require both a tenth of the shared plans and two opened plans", () => {
  const comparison = (
    plans: number,
    openedPlans: number,
    evenOpenedPlans: number,
  ): AuditorPlanComparison => ({
    plans,
    ownFindings: 0,
    ownRounds: 0,
    ownAverage: 0,
    otherFindings: 0,
    otherRounds: 0,
    otherAverage: 0,
    openedPlans,
    evenOpenedPlans,
  })
  assert.equal(hasUnevenOpeners(comparison(8, 2, 4.5)), true)
  assert.equal(hasUnevenOpeners(comparison(8, 3, 4.5)), false)
  assert.equal(hasUnevenOpeners(comparison(22, 9, 11)), false)
  assert.equal(hasUnevenOpeners(comparison(12, 6, 4)), true)
})

test("planning opener notes separate current and unlisted auditors and stay out of implementation", async (t) => {
  const f = await modelFixture(t)
  const audit = await commit(
    f.root,
    "evidence/impl-audit-1 obl clean: fixture audit",
    "coder-alpha low",
  )
  const commits = [{ repository: "repo-edu" as const, sha: audit }]
  const auditors = [
    ["claude", "listed", 2, "10"],
    ["codex", "old-one", 1, "11"],
    ["claude", "old-two", 0, "12"],
  ] as const
  for (let plan = 1; plan <= 6; plan += 1)
    for (const workClass of ["planning", "implementation"] as const)
      for (const [assistant, model, kept, hour] of auditors)
        writeRoundData(
          join(
            f.activeRoot,
            `opener-${plan}-${workClass === "planning" ? "plan" : "impl"}-rounds.json`,
          ),
          {
            ...round(
              `${model}-${workClass}`,
              1,
              `2026-10-${String(plan).padStart(2, "0")}T${hour}:00:00.000Z`,
              { assistant, ...selection(model), chosenBy: "settings" },
              settings,
              [phase("audit", assistant, model, 60_000)],
              commits,
              findings(kept, `${model} claim`),
            ),
            ...(workClass === "planning"
              ? { phase: "detailing" as const, settling: "" }
              : { scope: "1", judgedRepos: ["repo-edu" as const] }),
          },
        )

  const report = await modelsReport(
    { repoEduRoot: f.root, planRoot: f.planRoot, activeRoot: f.activeRoot },
    {
      ...testSettings,
      auditors: [{ assistant: "claude", model: "listed", effort: "low" }],
    },
  )
  const planning = report
    .split("## Planning auditors\n\n")[1]
    .split("\n\n## Implementation auditors")[0]
  assert.match(planning, /- `listed low` opened 6 of 6 plans\./)
  assert.match(
    planning,
    /Not in the current auditors list, opened an uneven share: `old-one low` 0 of 6; `old-two low` 0 of 6\./,
  )
  const implementation = report
    .split("## Implementation auditors\n\n")[1]
    .split("\n\nAuditor rows sort by")[0]
  assert.doesNotMatch(implementation, /opened|uneven share/)
})

test("all complete rounds count, thin rows do not block and disproved claims stay visible", async (t) => {
  const f = await modelFixture(t)
  const audit = await commit(
    f.root,
    "evidence/impl-audit-1 obl clean: fixture audit",
    "coder-alpha low",
  )
  const path = join(f.activeRoot, "evidence-1-plan-rounds.json")
  const commits = [{ repository: "repo-edu" as const, sha: audit }]
  const special = [
    { ...finding("kept claim"), number: 1 },
    {
      ...finding("dropped claim"),
      number: 2,
      vetVerdict: "drop" as const,
      outcome: "dropped" as const,
    },
    { ...finding("downgraded claim"), number: 3, finalTier: "C" as const },
    { ...finding("later disproved claim"), number: 4 },
  ]
  for (const [assistant, model] of [
    ["claude", "audit-strong"],
    ["codex", "audit-weak"],
  ] as const)
    for (let index = 1; index <= 5; index += 1)
      writeRoundData(join(f.activeRoot, `evidence-${index}-plan-rounds.json`), {
        ...round(
          `${model}-plan-audit`,
          index,
          `2026-10-${String(index).padStart(2, "0")}T${assistant === "claude" ? "10" : "11"}:00:00.000Z`,
          { assistant, ...selection(model), chosenBy: "settings" },
          settings,
          [
            phase("audit", assistant, model, 60_000),
            phase(
              "vet",
              assistant === "claude" ? "codex" : "claude",
              "vet-model",
              60_000,
            ),
          ],
          commits,
          model === "audit-strong"
            ? index === 1
              ? special
              : findings(1, `later claim ${index}`)
            : [],
        ),
        phase: "detailing",
        settling: "",
      })
  const implementationPath = join(f.activeRoot, "evidence-impl-rounds.json")
  for (const [assistant, model] of [
    ["claude", "audit-strong"],
    ["codex", "audit-weak"],
  ] as const)
    for (let index = 1; index <= 5; index += 1)
      writeRoundData(implementationPath, {
        ...round(
          `${model}-implementation`,
          index,
          `2026-10-${String(index).padStart(2, "0")}T${assistant === "claude" ? "13" : "14"}:00:00.000Z`,
          { assistant, ...selection(model), chosenBy: "settings" },
          settings,
          [phase("audit", assistant, model, 60_000)],
          commits,
          model === "audit-strong"
            ? findings(1, `implementation claim ${index}`)
            : [],
        ),
        scope: "1",
        judgedRepos: ["repo-edu"],
      })
  writeRoundData(join(f.activeRoot, "audit-thin-plan-rounds.json"), {
    ...round(
      "audit-thin-plan",
      1,
      "2026-10-06T12:00:00.000Z",
      {
        assistant: "codex",
        ...selection("audit-thin"),
        chosenBy: "command-line",
      },
      settings,
      [phase("audit", "codex", "audit-thin", 60_000)],
      commits,
      findings(10, "thin claim"),
    ),
    phase: "detailing",
    settling: "",
  })
  writeDisprovedFinding(path, {
    date: "2026-11-01",
    reason: "The retained claim did not hold.",
    target: "audit-strong-plan-audit",
    round: 1,
    finding: 4,
  })
  writeDisprovedFinding(path, {
    date: "2026-11-02",
    reason: "No retained round held this finding.",
    auditor: { model: "audit-strong", effort: "low" },
  })

  const report = await modelsReport(
    { repoEduRoot: f.root, planRoot: f.planRoot, activeRoot: f.activeRoot },
    testSettings,
  )
  assert.match(
    report,
    /\| audit-strong low \| 5 \| 5 in 5 \| 1\.00 \| 0 in 5 \| 0\.00 \| 1\.0 \| 44% \|/,
  )
  assert.match(report, /audit-thin low` needs 5 more shared plans/)
  assert.match(report, /`audit-strong low` finds more than the other auditors/)
  assert.match(report, /`audit-weak low` finds fewer than the other auditors/)
  assert.match(report, /## Disproved after the round/)
  assert.match(report, /#4 later disproved claim/)
  assert.match(report, /vet-model low; accept/)
  assert.match(report, /The retained claim did not hold\./)
  assert.match(report, /no retained round data holds this finding/)
  assert.match(report, /No retained round held this finding\./)
})

test("disproved rulings table each reason's first sentence and list the full reasons numbered across auditors", async (t) => {
  const f = await modelFixture(t)
  const audit = await commit(
    f.root,
    "evidence/impl-audit-1 obl clean: fixture audit",
    "coder-alpha low",
  )
  const path = join(f.activeRoot, "evidence-plan-rounds.json")
  const commits = [{ repository: "repo-edu" as const, sha: audit }]
  for (const [assistant, model] of [
    ["claude", "audit-alpha"],
    ["codex", "audit-beta"],
  ] as const)
    writeRoundData(path, {
      ...round(
        `${model}-plan-audit`,
        1,
        `2026-10-01T${assistant === "claude" ? "10" : "11"}:00:00.000Z`,
        { assistant, ...selection(model), chosenBy: "settings" },
        settings,
        [
          phase("audit", assistant, model, 60_000),
          phase(
            "vet",
            assistant === "claude" ? "codex" : "claude",
            "vet-model",
            60_000,
          ),
        ],
        commits,
        findings(2, `${model} claim`),
      ),
      phase: "detailing",
      settling: "",
    })
  writeDisprovedFinding(path, {
    date: "2026-11-01",
    reason:
      "The claim misread the guard. The guard runs before the write, so no race exists.",
    target: "audit-alpha-plan-audit",
    round: 1,
    finding: 1,
  })
  writeDisprovedFinding(path, {
    date: "2026-11-02",
    reason: "The vet accepted a stale reading",
    target: "audit-alpha-plan-audit",
    round: 1,
    finding: 2,
  })
  writeDisprovedFinding(path, {
    date: "2026-11-03",
    reason: "It predates the data! No retained round holds it.",
    auditor: { model: "audit-alpha", effort: "low" },
  })
  writeDisprovedFinding(path, {
    date: "2026-11-04",
    reason: "Version 1.2 | the guard? It already handles this.",
    target: "audit-beta-plan-audit",
    round: 1,
    finding: 2,
  })

  const report = await modelsReport(
    { repoEduRoot: f.root, planRoot: f.planRoot, activeRoot: f.activeRoot },
    testSettings,
  )
  assert.equal(
    report.split("## Disproved after the round\n\n")[1],
    [
      "### audit-alpha low",
      "",
      "| # | Date | Plan and round | Finding | Tier | Vet | Reason |",
      "| ---: | --- | --- | --- | --- | --- | --- |",
      "| 1 | 2026-11-03 | evidence; no retained round data holds this finding | — | — | — | It predates the data! |",
      "| 2 | 2026-11-02 | evidence; audit-alpha-plan-audit round 1 | #2 audit-alpha claim 2 | B | vet-model low; accept | The vet accepted a stale reading |",
      "| 3 | 2026-11-01 | evidence; audit-alpha-plan-audit round 1 | #1 audit-alpha claim 1 | B | vet-model low; accept | The claim misread the guard. |",
      "",
      "1. It predates the data! No retained round holds it.",
      "2. The vet accepted a stale reading",
      "3. The claim misread the guard. The guard runs before the write, so no race exists.",
      "",
      "### audit-beta low",
      "",
      "| # | Date | Plan and round | Finding | Tier | Vet | Reason |",
      "| ---: | --- | --- | --- | --- | --- | --- |",
      "| 4 | 2026-11-04 | evidence; audit-beta-plan-audit round 1 | #2 audit-beta claim 2 | B | vet-model low; accept | Version 1.2 \\| the guard? |",
      "",
      "4. Version 1.2 | the guard? It already handles this.",
      "",
    ].join("\n"),
  )
})

test("a closed plan whose archive holds no plan file names the missing plan", async (t) => {
  const f = await modelFixture(t)
  const stem = "lost-plan"
  const audit = await commit(
    f.root,
    `${stem}/impl-audit-1 obl clean: record the whole-plan audit`,
    "coder-alpha low",
  )
  await commit(
    f.planRoot,
    `${stem}/closed obl: close the fixture plan`,
    "coder-alpha low",
  )
  const archive = join(f.planRoot, "archive", stem)
  await mkdir(archive, { recursive: true })
  writeRoundData(join(archive, `${stem}-impl-rounds.json`), {
    ...round(
      `${stem}-impl-audit-01..01`,
      1,
      "2026-10-01T10:00:00.000Z",
      {
        assistant: "codex",
        ...selection("audit-alpha"),
        chosenBy: "settings",
      },
      settings,
      [phase("fix", "codex", "coder-alpha", 60_000)],
      [{ repository: "repo-edu", sha: audit }],
    ),
    scope: "1",
    judgedRepos: ["repo-edu"],
  })

  const evidence = await readModelEvidence({
    repoEduRoot: f.root,
    planRoot: f.planRoot,
    activeRoot: f.activeRoot,
  })
  const row = evidence.coders.get(
    modelKey({ assistant: "codex", model: "coder-alpha", effort: "low" }),
  )
  assert.ok(row)
  assert.equal(row.excluded.get(stem), "archived plan unavailable")
})

test("an archived plan written before the step grammar is unreadable, not missing", async (t) => {
  const f = await modelFixture(t)
  const stem = "old-plan"
  const audit = await commit(
    f.root,
    `${stem}/impl-audit-1 obl clean: record the whole-plan audit`,
    "coder-alpha low",
  )
  await commit(
    f.planRoot,
    `${stem}/closed obl: close the fixture plan`,
    "coder-alpha low",
  )
  const archive = join(f.planRoot, "archive", stem)
  await mkdir(archive, { recursive: true })
  await writeFile(
    join(archive, "plan.md"),
    "# Old plan\n\n## Implementation plan\n\n1. **Old step.** Repo Edu and plan repo.\n",
  )
  writeRoundData(join(archive, `${stem}-impl-rounds.json`), {
    ...round(
      `${stem}-impl-audit-01..01`,
      1,
      "2026-10-01T10:00:00.000Z",
      {
        assistant: "codex",
        ...selection("audit-alpha"),
        chosenBy: "settings",
      },
      settings,
      [phase("fix", "codex", "coder-alpha", 60_000)],
      [{ repository: "repo-edu", sha: audit }],
    ),
    scope: "1",
    judgedRepos: ["repo-edu"],
  })

  const evidence = await readModelEvidence({
    repoEduRoot: f.root,
    planRoot: f.planRoot,
    activeRoot: f.activeRoot,
  })
  const row = evidence.coders.get(
    modelKey({ assistant: "codex", model: "coder-alpha", effort: "low" }),
  )
  assert.ok(row)
  assert.equal(row.excluded.get(stem), "archived step list unreadable")
})

test("a closed plan without implementation round data names the missing evidence", async (t) => {
  const f = await modelFixture(t)
  const stem = "no-round-data"
  await commit(
    f.root,
    `${stem}/impl-1 obl feat(audit-round): fixture step`,
    "coder-alpha low\nImplementation took 5 min.",
  )
  await commit(
    f.planRoot,
    `${stem}/closed obl: close the fixture plan`,
    "coder-alpha low",
  )
  await archivePlan(f.planRoot, stem, ["repo-edu"])

  const evidence = await readModelEvidence({
    repoEduRoot: f.root,
    planRoot: f.planRoot,
    activeRoot: f.activeRoot,
  })
  const row = evidence.coders.get(
    modelKey({ assistant: "codex", model: "coder-alpha", effort: "low" }),
  )
  assert.ok(row)
  assert.equal(row.excluded.get(stem), "no implementation round data")
})

test("coder yield accepts agreeing unassigned records without step time", async (t) => {
  const f = await modelFixture(t)
  const stem = "yield-only"
  await commit(
    f.root,
    `${stem}/impl-1 obl feat(audit-round): fixture step`,
    "coder-alpha low",
  )
  const audit = await commit(
    f.root,
    `${stem}/impl-audit-1 obl clean: record the whole-plan audit`,
    "coder-alpha low",
  )
  await commit(
    f.planRoot,
    `${stem}/closed obl: close the fixture plan`,
    "coder-alpha low",
  )
  const archive = await archivePlan(f.planRoot, stem, ["repo-edu"])
  writeRoundData(join(archive, `${stem}-impl-rounds.json`), {
    ...round(
      `${stem}-impl-audit-01..01`,
      1,
      "2026-10-01T10:00:00.000Z",
      {
        assistant: "codex",
        ...selection("audit-alpha"),
        chosenBy: "settings",
      },
      settings,
      [phase("audit", "codex", "audit-alpha", 60_000)],
      [{ repository: "repo-edu", sha: audit }],
    ),
    scope: "1",
    judgedRepos: ["repo-edu"],
  })

  const evidence = await readModelEvidence({
    repoEduRoot: f.root,
    planRoot: f.planRoot,
    activeRoot: f.activeRoot,
  })
  const row = evidence.coders.get(
    modelKey({ assistant: "codex", model: "coder-alpha", effort: "low" }),
  )
  assert.ok(row)
  assert.deepEqual(
    row.yieldSamples.map((sample) => sample.stem),
    [stem],
  )
  assert.deepEqual(row.timeSamples, [])
  assert.equal(row.excluded.has(stem), false)
})

test("coder admission matches the ready assignment on assistant and effort, not on the release name", async (t) => {
  const f = await modelFixture(t)
  const addPlan = async (
    stem: string,
    assignment: string,
    record: string,
    tag: string,
    at: string,
  ) => {
    await commit(
      f.planRoot,
      `${stem}/ready: declare the plan ready for implementation`,
      `Coder: ${assignment}`,
      `${at}T08:00:00Z`,
    )
    await commit(
      f.root,
      `${stem}/impl-1 ${tag} feat(audit-round): fixture step`,
      `${record}\nImplementation took 10 min.`,
      `${at}T09:00:00Z`,
    )
    const audit = await commit(
      f.root,
      `${stem}/impl-audit-1 ${tag} clean: record the whole-plan audit`,
      record,
      `${at}T10:00:00Z`,
    )
    await commit(
      f.planRoot,
      `${stem}/closed ${tag}: close the fixture plan`,
      record,
      `${at}T11:00:00Z`,
    )
    const archive = await archivePlan(f.planRoot, stem, ["repo-edu"])
    writeRoundData(join(archive, `${stem}-impl-rounds.json`), {
      ...round(
        `${stem}-impl-audit-01..01`,
        1,
        `${at}T10:00:00.000Z`,
        {
          assistant: "codex",
          ...selection("audit-alpha"),
          chosenBy: "settings",
        },
        settings,
        [phase("audit", "codex", "audit-alpha", 60_000)],
        [{ repository: "repo-edu", sha: audit }],
      ),
      scope: "1",
      judgedRepos: ["repo-edu"],
    })
  }
  await addPlan(
    "alias",
    "claude opus xhigh",
    "claude-opus-5-5 xhigh",
    "abx",
    "2026-10-01",
  )
  await addPlan(
    "other-effort",
    "codex coder-alpha low",
    "coder-alpha high",
    "obh",
    "2026-10-02",
  )

  const evidence = await readModelEvidence({
    repoEduRoot: f.root,
    planRoot: f.planRoot,
    activeRoot: f.activeRoot,
  })
  const alias = evidence.coders.get(
    modelKey({
      assistant: "claude",
      model: "claude-opus-5-5",
      effort: "xhigh",
    }),
  )
  assert.ok(alias)
  assert.deepEqual(
    alias.yieldSamples.map((sample) => sample.stem),
    ["alias"],
  )
  assert.equal(alias.excluded.has("alias"), false)
  const otherEffort = evidence.coders.get(
    modelKey({ assistant: "codex", model: "coder-alpha", effort: "high" }),
  )
  assert.ok(otherEffort)
  assert.deepEqual(otherEffort.yieldSamples, [])
  assert.equal(
    otherEffort.excluded.get("other-effort"),
    "coder differs from the ready assignment",
  )
})

test("coder evidence removes disproved findings and falls back to one commit span per step", async (t) => {
  const f = await modelFixture(t)
  const stem = "commit-span"
  await commit(
    f.planRoot,
    `${stem}/ready: declare the plan ready for implementation`,
    "Coder: codex coder-alpha low",
    "2026-10-01T10:00:00Z",
  )
  await commit(
    f.root,
    `${stem}/impl-1 obl feat(audit-round): fixture Repo Edu share`,
    "coder-alpha low",
    "2026-10-01T10:10:00Z",
  )
  await commit(
    f.planRoot,
    `${stem}/impl-1 obl docs(audit-round): fixture plan share`,
    "coder-alpha low",
    "2026-10-01T10:20:00Z",
  )
  await commit(
    f.root,
    `${stem}/impl-2 obl feat(audit-round): fixture second step`,
    "coder-alpha low",
    "2026-10-01T10:50:00Z",
  )
  const audit = await commit(
    f.root,
    `${stem}/impl-audit-1-2 obl clean: record the whole-plan audit`,
    "coder-alpha low",
    "2026-10-01T11:00:00Z",
  )
  await commit(
    f.planRoot,
    `${stem}/closed obl: close the fixture plan`,
    "coder-alpha low",
    "2026-10-01T11:10:00Z",
  )
  const archive = await archivePlan(f.planRoot, stem, ["both", "repo-edu"])
  const path = join(archive, `${stem}-impl-rounds.json`)
  writeRoundData(path, {
    ...round(
      `${stem}-impl-audit-01..02`,
      1,
      "2026-10-01T11:00:00.000Z",
      {
        assistant: "claude",
        ...selection("audit-alpha"),
        chosenBy: "settings",
      },
      settings,
      [
        phase("audit", "claude", "audit-alpha", 60_000),
        phase("fix", "codex", "coder-alpha", 600_000),
      ],
      [{ repository: "repo-edu", sha: audit }],
      [finding("disproved implementation claim")],
    ),
    scope: "1-2",
    judgedRepos: ["repo-edu", "plan"],
  })
  writeDisprovedFinding(path, {
    date: "2026-11-01",
    reason: "The implementation claim was wrong.",
    target: `${stem}-impl-audit-01..02`,
    round: 1,
    finding: 1,
  })

  const evidence = await readModelEvidence({
    repoEduRoot: f.root,
    planRoot: f.planRoot,
    activeRoot: f.activeRoot,
  })
  const row = evidence.coders.get(
    modelKey({ assistant: "codex", model: "coder-alpha", effort: "low" }),
  )
  assert.ok(row)
  assert.deepEqual(row.yieldSamples, [{ stem, steps: 2, kept: 0, yield: 0 }])
  assert.deepEqual(row.timeSamples, [{ stem, steps: 2, minutes: 30 }])

  const report = await modelsReport(
    { repoEduRoot: f.root, planRoot: f.planRoot, activeRoot: f.activeRoot },
    testSettings,
  )
  assert.match(
    report,
    /\| coder-alpha low \| 1 \| 1 \| 2 \| 0 \| 0\.00 \| 30\.0 \|/,
  )
  assert.match(report, /The implementation claim was wrong\./)
})

test("an active plan remains excluded without a step count", async (t) => {
  const f = await modelFixture(t)
  const audit = await commit(
    f.root,
    "active/impl-audit-1 obl clean: record the current audit",
    "coder-alpha low",
  )
  writeRoundData(join(f.activeRoot, "active-impl-rounds.json"), {
    ...round(
      "active-impl-audit-01..01",
      1,
      "2026-10-01T10:00:00.000Z",
      {
        assistant: "codex",
        ...selection("audit-alpha"),
        chosenBy: "settings",
      },
      settings,
      [phase("fix", "codex", "coder-alpha", 60_000)],
      [{ repository: "repo-edu", sha: audit }],
    ),
    scope: "1",
    judgedRepos: ["repo-edu"],
  })

  const evidence = await readModelEvidence({
    repoEduRoot: f.root,
    planRoot: f.planRoot,
    activeRoot: f.activeRoot,
  })
  const row = evidence.coders.get(
    modelKey({ assistant: "codex", model: "coder-alpha", effort: "low" }),
  )
  assert.ok(row)
  assert.equal(row.excluded.get("active"), "not closed")
})

test("models groups every recorded model, counts rebuttal cost, admits settings openings and excludes mixed and planning-fix coder evidence", async (t) => {
  const f = await fixture(t)
  await writeFile(join(f.root, "pnpm-workspace.yaml"), "packages: []\n")
  await commitFixture(f.root)
  const planRoot = join(f.root, "../plan")
  const activeRoot = join(planRoot, "active")
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

  const mixedArchive = await archivePlan(planRoot, "mixed", ["repo-edu"])
  writeRoundData(join(mixedArchive, "mixed-impl-rounds.json"), {
    ...round(
      "mixed-impl-audit-01..01",
      1,
      "2026-10-01T10:00:00.000Z",
      {
        assistant: "codex",
        ...selection("audit-alpha"),
        chosenBy: "settings",
      },
      settings,
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
  writeRoundData(join(activeRoot, "mixed-plan-rounds.json"), {
    ...round(
      "mixed-plan-audit",
      1,
      "2026-10-02T10:00:00.000Z",
      {
        assistant: "claude",
        ...selection("audit-claude"),
        chosenBy: "settings",
      },
      settings,
      [
        phase("audit", "claude", "audit-claude", 60_000),
        phase("fix", "codex", "planning-fixer", 60_000),
      ],
      commits,
    ),
    phase: "detailing",
    settling: "",
  })

  await commit(
    planRoot,
    "no-assignment/ready: declare the plan ready for implementation",
    "Legacy ready marker",
    "2026-10-04T08:00:00Z",
  )
  await commit(
    f.root,
    "no-assignment/impl-1 obl feat(audit-round): fixture step",
    "coder-alpha low\nImplementation took 10 min.",
    "2026-10-04T09:00:00Z",
  )
  const noAssignmentAudit = await commit(
    f.root,
    "no-assignment/impl-audit-1 obl clean: record the whole-plan audit",
    "coder-alpha low",
    "2026-10-04T10:00:00Z",
  )
  await commit(
    planRoot,
    "no-assignment/closed obl: close the fixture plan",
    "coder-alpha low",
    "2026-10-04T11:00:00Z",
  )
  const noAssignmentArchive = await archivePlan(planRoot, "no-assignment", [
    "repo-edu",
  ])
  writeRoundData(join(noAssignmentArchive, "no-assignment-impl-rounds.json"), {
    ...round(
      "no-assignment-impl-audit-01..01",
      1,
      "2026-10-04T10:00:00.000Z",
      {
        assistant: "codex",
        ...selection("audit-admission"),
        chosenBy: "settings",
      },
      settings,
      [phase("audit", "codex", "audit-admission", 60_000)],
      [{ repository: "repo-edu", sha: noAssignmentAudit }],
    ),
    scope: "1",
    judgedRepos: ["repo-edu"],
  })

  await commit(
    planRoot,
    "effort-mixed/ready: declare the plan ready for implementation",
    "Coder: codex coder-alpha low",
    "2026-10-05T08:00:00Z",
  )
  await commit(
    f.root,
    "effort-mixed/impl-1 obl feat(audit-round): fixture step",
    "coder-alpha low\nImplementation took 10 min.",
    "2026-10-05T09:00:00Z",
  )
  const effortMixedAudit = await commit(
    f.root,
    "effort-mixed/impl-audit-1 obl clean: record the whole-plan audit",
    "coder-alpha low",
    "2026-10-05T10:00:00Z",
  )
  await commit(
    planRoot,
    "effort-mixed/closed obl: close the fixture plan",
    "coder-alpha low",
    "2026-10-05T11:00:00Z",
  )
  const effortMixedArchive = await archivePlan(planRoot, "effort-mixed", [
    "repo-edu",
  ])
  writeRoundData(join(effortMixedArchive, "effort-mixed-impl-rounds.json"), {
    ...round(
      "effort-mixed-impl-audit-01..01",
      1,
      "2026-10-05T10:00:00.000Z",
      {
        assistant: "codex",
        ...selection("audit-admission"),
        chosenBy: "settings",
      },
      settings,
      [
        phase("audit", "codex", "audit-admission", 60_000),
        phase("fix", "codex", "coder-alpha", 60_000, "high"),
      ],
      [{ repository: "repo-edu", sha: effortMixedAudit }],
    ),
    scope: "1",
    judgedRepos: ["repo-edu"],
  })
  writeRoundData(join(activeRoot, "mixed-plan-rounds.json"), {
    ...round(
      "mixed-plan-audit",
      2,
      "2026-10-03T10:00:00.000Z",
      {
        assistant: "codex",
        ...selection("audit-third"),
        chosenBy: "settings",
      },
      settings,
      [phase("audit", "codex", "audit-third", 60_000)],
      commits,
      [finding("kept yield"), finding("unmatched work", "unmatched")],
    ),
    phase: "detailing",
    settling: "",
  })

  const visible: { readonly text: string; readonly format?: "markdown" }[] = []
  const errors: string[] = []
  const commandOptions = {
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
  } satisfies Parameters<typeof runCommand>[2]
  const code = await runCommand(["models", "--all"], f.runtime, commandOptions)
  assert.equal(code, 0, errors.join("\n"))
  assert.equal(visible.length, 1)
  assert.equal(visible[0].format, "markdown")
  const output = visible[0].text
  assert.match(output, /## Planning auditors/)
  assert.match(output, /## Implementation auditors/)
  assert.match(output, /audit-alpha low/)
  assert.match(output, /audit-claude low/)
  assert.match(output, /audit-third low/)
  const auditorReading = output
    .split("## Implementation auditors\n\n")[1]
    .split("\n\n| Model |")[0]
  assert.match(
    output,
    /\| audit-alpha low \| 0 \| 0 in 0 \| — \| 0 in 0 \| — \| 3\.0 \| 0% \|/,
  )
  assert.match(auditorReading, /audit-admission low` needs 5 more shared plans/)
  assert.equal(
    auditorReading.match(/audit-admission low` needs 5 more shared plans/g)
      ?.length,
    1,
  )
  assert.match(auditorReading, /audit-alpha low` needs 5 more shared plans/)
  assert.doesNotMatch(auditorReading, /needs 0 more shared plans/)
  assert.match(
    output,
    /\| audit-third low \| 1 \| 1 in 1 \| 1\.00 \| 1 in 1 \| 1\.00 \| 1\.0 \| 0% \|/,
  )
  assert.match(output, /## Coders/)
  assert.match(
    output,
    /\| coder-alpha low \| 1 \| 1 \| 1 \| 1 \| 1\.00 \| 10\.0 \|/,
  )
  assert.match(output, /## Excluded plans/)
  assert.match(output, /mixed: coder-alpha low, coder-beta low/)
  assert.match(output, /effort-mixed: coder-alpha high, coder-alpha low/)
  assert.doesNotMatch(output, /no-assignment:/)
  const coders = output.split("## Coders\n\n")[1].split("\n\nRows sort by")[0]
  assert.equal(coders.match(/coder-alpha low needs/g)?.length, 2)
  assert.doesNotMatch(coders, /coder-beta low/)
  assert.doesNotMatch(coders, /coder-alpha high/)
  assert.doesNotMatch(coders, /needs 0 more/)
  assert.doesNotMatch(output, /planning-fixer/)
  assert.match(output, /The records do not separate one coder clearly\./)
  assert.doesNotMatch(output, /codex-vet low/)
  await assert.rejects(readFile(join(f.root, "calls.jsonl")), {
    code: "ENOENT",
  })
  visible.length = 0
  assert.equal(await runCommand(["models"], f.runtime, commandOptions), 0)
  assert.equal(visible.length, 1)
  assert.doesNotMatch(visible[0].text, /## Excluded plans/)
  assert.doesNotMatch(visible[0].text, /mixed:/)
  assert.match(visible[0].text, /## Disproved after the round/)
  assert.ok(visible[0].text.endsWith("\n"))
  assert.ok(!visible[0].text.endsWith("\n\n"))
})

test("coder spread and worst plan do not block an otherwise clear lead", async (t) => {
  const f = await modelFixture(t)
  let planIndex = 0
  const addPlan = async (
    stem: string,
    model: string,
    stepCount: number,
    acceptedFindings: number,
    minutesPerStep: number,
  ) => {
    planIndex += 1
    await commit(
      f.planRoot,
      `${stem}/ready: declare the plan ready for implementation`,
      `Coder: codex ${model} low`,
    )
    for (let step = 1; step <= stepCount; step += 1)
      await commit(
        f.root,
        `${stem}/impl-${step} obl feat(audit-round): fixture step`,
        `${model} low\nImplementation took ${minutesPerStep} min.`,
      )
    const scope = stepCount === 1 ? "1" : `1-${stepCount}`
    const audit = await commit(
      f.root,
      `${stem}/impl-audit-${scope} obl clean: record the whole-plan audit`,
      `${model} low`,
    )
    await commit(
      f.planRoot,
      `${stem}/closed obl: close the fixture plan`,
      `${model} low`,
    )
    const archive = await archivePlan(
      f.planRoot,
      stem,
      Array.from({ length: stepCount }, () => "repo-edu" as const),
    )
    writeRoundData(join(archive, `${stem}-impl-rounds.json`), {
      ...round(
        `${stem}-impl-audit-${scope.replace("-", "..")}`,
        1,
        `2026-10-${String(planIndex).padStart(2, "0")}T10:00:00.000Z`,
        {
          assistant: "codex",
          ...selection("audit-alpha"),
          chosenBy: "settings",
        },
        settings,
        [phase("audit", "codex", "audit-alpha", 60_000)],
        [{ repository: "repo-edu", sha: audit }],
        findings(acceptedFindings, `${stem} defect`),
      ),
      scope,
      judgedRepos: ["repo-edu"],
    })
  }

  await addPlan("alpha-low-1", "coder-alpha", 1, 0, 1)
  await addPlan("alpha-low-2", "coder-alpha", 1, 0, 1)
  await addPlan("alpha-variable", "coder-alpha", 2, 1, 4)
  await addPlan("beta-steady-1", "coder-beta", 6, 1, 10)
  await addPlan("beta-steady-2", "coder-beta", 6, 1, 10)
  await addPlan("beta-steady-3", "coder-beta", 6, 1, 10)

  const report = await modelsReport(
    { repoEduRoot: f.root, planRoot: f.planRoot, activeRoot: f.activeRoot },
    {
      ...testSettings,
      coders: [
        { assistant: "codex", model: "coder-alpha", effort: "low" },
        { assistant: "codex", model: "coder-beta", effort: "low" },
      ],
    },
  )
  assert.doesNotMatch(report, /spread|worst plan|reliability blocks/)
  assert.match(
    report,
    /\| coder-alpha low \| 3 \| 3 \| 4 \| 1 \| 0\.17 \| 2\.5 \|/,
  )
  assert.match(report, /records clearly support running coder-alpha low/)
})

test("coder admission needs every archived plan share and a current whole-plan audit", async (t) => {
  const f = await fixture(t)
  await writeFile(join(f.root, "pnpm-workspace.yaml"), "packages: []\n")
  await commitFixture(f.root, undefined, "2026-09-29T10:00:00Z")
  const planRoot = join(f.root, "../plan")
  const activeRoot = join(planRoot, "active")
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
  const writeImplementationRound = async (
    stem: string,
    scope: string,
    audit: string,
    started: string,
    findings: RoundFinding[] = [finding(`${stem} yield`)],
    hosts: readonly StepHost[] = ["plan"],
    splitPeer = false,
  ) => {
    const archive = await archivePlan(planRoot, stem, hosts, splitPeer)
    writeRoundData(join(archive, `${stem}-impl-rounds.json`), {
      ...round(
        `${stem}-impl-audit-${scope.replace("-", "..")}`,
        1,
        started,
        {
          assistant: "codex",
          ...selection("audit-alpha"),
          chosenBy: "settings",
        },
        settings,
        [phase("audit", "codex", "audit-alpha", 60_000)],
        [{ repository: "plan", sha: audit }],
        findings,
      ),
      scope,
      judgedRepos: ["plan"],
    })
  }

  await addReady("plan-only", "2026-10-01T08:00:00Z")
  await addStep("plan-only", 1, "2026-10-01T09:00:00Z")
  const planOnlyAudit = await addAudit("plan-only", "1", "2026-10-01T09:00:00Z")
  await addClose("plan-only", "2026-10-01T11:00:00Z")
  await writeImplementationRound(
    "plan-only",
    "1",
    planOnlyAudit,
    "2026-10-01T10:00:00.000Z",
    [finding("accepted defect"), finding("unmatched work", "unmatched")],
    ["plan"],
    true,
  )

  await addReady("partial", "2026-10-02T08:00:00Z")
  await addStep("partial", 1, "2026-10-02T09:00:00Z")
  await addStep("partial", 2, "2026-10-02T10:00:00Z")
  const partialAudit = await addAudit("partial", "1-2", "2026-10-02T11:00:00Z")
  await addClose("partial", "2026-10-02T12:00:00Z")
  await writeImplementationRound(
    "partial",
    "1-2",
    partialAudit,
    "2026-10-02T11:00:00.000Z",
    undefined,
    ["plan", "plan", "plan"],
  )

  await addReady("missing-share", "2026-10-02T13:00:00Z")
  await addStep("missing-share", 1, "2026-10-02T14:00:00Z")
  const missingShareAudit = await addAudit(
    "missing-share",
    "1",
    "2026-10-02T15:00:00Z",
  )
  await addClose("missing-share", "2026-10-02T16:00:00Z")
  await writeImplementationRound(
    "missing-share",
    "1",
    missingShareAudit,
    "2026-10-02T15:00:00.000Z",
    undefined,
    ["both"],
  )

  await addReady("unreadable-share", "2026-10-02T16:30:00Z")
  await addStep("unreadable-share", 1, "2026-10-02T17:00:00Z")
  await commit(
    f.root,
    "unreadable-share/impl-1 obl feat(audit-round): fixture step",
    "Unreadable model record",
    "2026-10-02T17:30:00Z",
  )
  const unreadableShareAudit = await addAudit(
    "unreadable-share",
    "1",
    "2026-10-02T18:00:00Z",
  )
  await addClose("unreadable-share", "2026-10-02T19:00:00Z")
  await writeImplementationRound(
    "unreadable-share",
    "1",
    unreadableShareAudit,
    "2026-10-02T18:00:00.000Z",
    undefined,
    ["both"],
  )

  await addReady("stale", "2026-10-03T08:00:00Z")
  await addStep("stale", 1, "2026-10-03T09:00:00Z")
  await addStep("stale", 2, "2026-10-03T10:00:00Z")
  const staleAudit = await addAudit("stale", "1-2", "2026-10-03T11:00:00Z")
  await addStep("stale", 2, "2026-10-03T12:00:00Z")
  await addClose("stale", "2026-10-03T13:00:00Z")
  await writeImplementationRound(
    "stale",
    "1-2",
    staleAudit,
    "2026-10-03T11:00:00.000Z",
  )

  const evidence = await readModelEvidence({
    repoEduRoot: f.root,
    planRoot,
    activeRoot,
  })
  const row = evidence.coders.get(modelKey(coder))
  assert.ok(row)
  assert.deepEqual(
    row.yieldSamples.map((sample) => ({
      stem: sample.stem,
      yield: sample.yield,
    })),
    [{ stem: "plan-only", yield: 1 }],
  )
  assert.deepEqual(
    row.timeSamples.map((sample) => sample.stem),
    ["plan-only"],
  )
  assert.equal(row.excluded.get("partial"), "implementation shares missing")
  assert.equal(
    row.excluded.get("missing-share"),
    "implementation shares missing",
  )
  assert.equal(
    row.excluded.get("unreadable-share"),
    "step model record unreadable",
  )
  assert.equal(
    row.excluded.get("stale"),
    "no complete whole-plan audit after the final step",
  )
})

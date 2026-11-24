import assert from "node:assert/strict"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { type TestContext, test } from "node:test"
import { execa } from "execa"
import {
  type AuditorPlanComparison,
  type AuditorPlanSample,
  clearlyPreferred,
  compareAuditorPlans,
  hasUnevenOpeners,
} from "../model-comparison.js"
import { modelKey, readModelEvidence } from "../model-evidence.js"
import { modelsReport } from "../models.js"
import type { RoundData, RoundFinding, TierRange } from "../round-data.js"
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
  vetters: [{ assistant: "claude", ...selection("claude-vet") }],
  fix: { assistant: "codex", ...selection("coder-beta") },
}

/** Every fixture round has one vetter, so one tag names it; the panel test names two. */
const fixtureVetTag = "aul"

const phase = (
  phaseName: RoundData["phases"][number]["phase"],
  assistant: "claude" | "codex",
  model: string,
  milliseconds: number,
  effort = "low",
  tag = fixtureVetTag,
): RoundData["phases"][number] => ({
  ...(phaseName === "vet" ? { phase: phaseName, tag } : { phase: phaseName }),
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
  rarity: "ordinary",
  complexity: "none",
  growthPattern: "none",
  location: { kind: "repo-edu", area: "tool-audit-round", covers: [] },
  reviews:
    outcome === "kept"
      ? [{ vet: fixtureVetTag, verdict: "accept", answer: null }]
      : [],
  outcome,
  finalTier: null,
  finalReach: null,
  finalRarity: null,
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
  await commitFixture(planRoot)
  return { ...f, planRoot, roundRoot: f.runtime.roundRoot }
}

test("the model read-out ignores commit round data", async (t) => {
  const f = await modelFixture(t)
  await writeFile(
    join(f.roundRoot, "commit-abc123-rounds.json"),
    "not plan round data\n",
  )

  const evidence = await readModelEvidence(f.runtime)
  assert.equal(evidence.auditors.size, 0)
  assert.deepEqual(evidence.disproved, [])
})

test("--from counts back to local midnight and follows the round start for later rulings", async (t) => {
  const f = await modelFixture(t)
  const file = join(f.roundRoot, "example-plan-rounds.json")
  const midnight = new Date(2025, 11, 20).getTime()
  const instants = [midnight - 1, midnight, new Date(2026, 10, 24).getTime()]
  for (const [i, instant] of instants.entries()) {
    const model = ["before-midnight", "at-midnight", "today"][i]
    writeRoundData(file, {
      ...round(
        "example-plan-audit",
        i + 1,
        new Date(instant).toISOString(),
        { assistant: "codex", ...selection(model), chosenBy: "settings" },
        settings,
        [phase("vet", "claude", `vet-${model}`, 60_000)],
        [{ repository: "plan", sha: "a".repeat(40) }],
      ),
      phase: "detailing",
      settling: "",
    })
    writeDisprovedFinding(file, {
      date: "2026-11-24",
      target: "example-plan-audit",
      round: i + 1,
      finding: 1,
      reason: `Ruling on ${model}.`,
    })
  }
  writeDisprovedFinding(file, {
    date: "2026-11-24",
    auditor: { model: "undated", effort: "low" },
    reason: "Detached ruling.",
  })
  const visible: string[] = []
  const errors: string[] = []
  const options = {
    repoEduRoot: f.root,
    now: () => new Date(2026, 10, 24, 12).getTime(),
    terminal: {
      write: (text) => visible.push(text),
      status: () => {},
      clear: () => {},
    },
    emergency: (text) => errors.push(text),
  } satisfies Parameters<typeof runCommand>[2]
  const filtered = async (date: string) => {
    assert.equal(
      await runCommand(["models", "--all", "--from", date], f.runtime, options),
      0,
      errors.join("\n"),
    )
    return visible.pop() ?? ""
  }
  const december = await filtered("20-12")
  assert.match(december, /20-12-2025/)
  assert.match(december, /Ruling on at-midnight/)
  assert.match(december, /vet-at-midnight/)
  assert.match(december, /Ruling on today/)
  assert.doesNotMatch(december, /before-midnight|undated|Detached ruling/)
  const today = await filtered("24-11")
  assert.match(today, /24-11-2026/)
  assert.match(today, /Ruling on today/)
  assert.doesNotMatch(today, /at-midnight|before-midnight/)
  assert.match(await filtered("29-02"), /29-02-2024/)
  for (const invalid of ["31-04", "2-12", "20-12-2025", "12-20"]) {
    assert.equal(
      await runCommand(["models", "--from", invalid], f.runtime, options),
      2,
    )
    assert.match(errors.at(-1) ?? "", /DD-MM/)
  }

  const evidence = await readModelEvidence(f.runtime, new Date(midnight))
  const samples = [...evidence.auditors.values()].flatMap((row) => row.samples)
  assert.equal(samples.length, 2)
  assert.ok(samples.every((sample) => !sample.first))
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

/** The body of one planning auditor section, named by its tier range. */
const planningAuditors = (report: string, range: TierRange) =>
  report
    .split(`## Planning auditors, ${range} findings\n\n`)[1]
    .split(
      range === "A/B"
        ? "\n\n## Planning auditors, C findings"
        : "\n\n## Implementation auditors",
    )[0]

/** The body of one implementation auditor section, named by its tier range. */
const implementationAuditors = (report: string, range: TierRange) =>
  report
    .split(`## Implementation auditors, ${range} findings\n\n`)[1]
    .split(
      range === "A/B"
        ? "\n\n## Implementation auditors, C findings"
        : "\n\nAuditor rows sort by",
    )[0]

/** The body of one coder section, named by its tier range. */
const coderSection = (report: string, range: TierRange) =>
  report
    .split(`## Coders, ${range} findings\n\n`)[1]
    .split(
      range === "A/B" ? "\n\n## Coders, C findings" : "\n\nRows sort by",
    )[0]

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
  assert.equal(clearlyPreferred(modelSamples([0, 0, 0]), [], false), false)
})

test("auditor tables compare the same plans and sort by the per-round gap", async (t) => {
  const f = await modelFixture(t)
  const audit = await commit(
    f.root,
    "evidence/impl-audit-1 obl clean: fixture audit",
    "coder-alpha low",
  )
  const commits = [{ repository: "repo-edu" as const, sha: audit }]
  const path = join(f.roundRoot, "ranking-plan-rounds.json")
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

  const report = await modelsReport(f.runtime, testSettings)
  const planning = planningAuditors(report, "A/B")
  assert.equal(
    planning,
    [
      "Fewer than 5 shared plans:",
      "",
      "| Model | Plans | Own findings in rounds | Own per round | Others on same plans | Others per round | Minutes per round | Wrong claims |",
      "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
      "| audit-strong low | 1 | 10 in 5 | 2.00 | 5 in 10 | 0.50 | 2.0 | 0% |",
      "| audit-middle low | 1 | 5 in 5 | 1.00 | 10 in 10 | 1.00 | 1.0 | 0% |",
      "| audit-weak low | 1 | 0 in 5 | 0.00 | 15 in 10 | 1.50 | 3.0 | 0% |",
    ].join("\n"),
  )
  const implementation = implementationAuditors(report, "A/B")
  assert.equal(
    implementation,
    [
      "No implementation auditor records are available.",
      "",
      "| Model | Plans | Own findings in rounds | Own per round | Others on same plans | Others per round | Minutes per round | Wrong claims |",
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
    const hardPath = join(f.roundRoot, `hard-${plan}-plan-rounds.json`)
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

    const easyPath = join(f.roundRoot, `easy-${plan}-plan-rounds.json`)
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

  const report = await modelsReport(f.runtime, testSettings)
  const planning = planningAuditors(report, "A/B")
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

test("auditor classes print no evaluation and move models below the floor to a second table", async (t) => {
  const f = await modelFixture(t)
  const audit = await commit(
    f.root,
    "evidence/impl-audit-1 obl clean: fixture audit",
    "coder-alpha low",
  )
  const commits = [{ repository: "repo-edu" as const, sha: audit }]

  for (const [assistant, model, kept, hour, plans] of [
    ["claude", "main-strong", 2, "10", 5],
    ["codex", "main-weak", 0, "11", 5],
    ["claude", "thin-top", 9, "12", 4],
  ] as const)
    for (let plan = 1; plan <= plans; plan += 1)
      writeRoundData(join(f.roundRoot, `split-${plan}-plan-rounds.json`), {
        ...round(
          `${model}-planning`,
          1,
          `2026-10-${String(plan).padStart(2, "0")}T${hour}:00:00.000Z`,
          { assistant, ...selection(model), chosenBy: "settings" },
          settings,
          [phase("audit", assistant, model, 60_000)],
          commits,
          findings(kept, `${model} claim`),
        ),
        phase: "detailing",
        settling: "",
      })
  writeRoundData(join(f.roundRoot, "split-solo-plan-rounds.json"), {
    ...round(
      "solo-planning",
      1,
      "2026-10-06T10:00:00.000Z",
      { assistant: "codex", ...selection("solo"), chosenBy: "settings" },
      settings,
      [phase("audit", "codex", "solo", 60_000)],
      commits,
      findings(1, "solo claim"),
    ),
    phase: "detailing",
    settling: "",
  })
  for (const [assistant, model, kept, hour] of [
    ["claude", "impl-strong", 1, "13"],
    ["codex", "impl-weak", 0, "14"],
  ] as const)
    for (let plan = 1; plan <= 5; plan += 1)
      writeRoundData(join(f.roundRoot, `split-${plan}-impl-rounds.json`), {
        ...round(
          `${model}-implementation`,
          1,
          `2026-10-${String(plan).padStart(2, "0")}T${hour}:00:00.000Z`,
          { assistant, ...selection(model), chosenBy: "settings" },
          settings,
          [phase("audit", assistant, model, 60_000)],
          commits,
          findings(kept, `${model} claim`),
        ),
        scope: "1",
        judgedRepos: ["repo-edu"],
      })

  const report = await modelsReport(f.runtime, testSettings)
  const header = [
    "| Model | Plans | Own findings in rounds | Own per round | Others on same plans | Others per round | Minutes per round | Wrong claims |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  ]
  const planning = planningAuditors(report, "A/B")
  assert.equal(
    planning,
    [
      ...header,
      "| main-strong low | 5 | 10 in 5 | 2.00 | 36 in 9 | 4.00 | 1.0 | 0% |",
      "| main-weak low | 5 | 0 in 5 | 0.00 | 46 in 9 | 5.11 | 1.0 | 0% |",
      "",
      "Fewer than 5 shared plans:",
      "",
      ...header,
      "| thin-top low | 4 | 36 in 4 | 9.00 | 8 in 8 | 1.00 | 1.0 | 0% |",
      "| solo low | 0 | 0 in 0 | — | 0 in 0 | — | 1.0 | 0% |",
      "",
      "Not in the current `planningAudit.auditors` list, opened an uneven share: `main-strong low` 5 of 5.",
    ].join("\n"),
  )
  const implementation = implementationAuditors(report, "A/B")
  assert.equal(
    implementation,
    [
      ...header,
      "| impl-strong low | 5 | 5 in 5 | 1.00 | 0 in 5 | 0.00 | 1.0 | 0% |",
      "| impl-weak low | 5 | 0 in 5 | 0.00 | 5 in 5 | 1.00 | 1.0 | 0% |",
    ].join("\n"),
  )
})

test("same-plan comparison divides each side's findings by its rounds over all shared plans", () => {
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
    ownPerRound: 2 / 3,
    otherFindings: 4,
    otherRounds: 4,
    otherPerRound: 1,
    openedPlans: 1,
    evenOpenedPlans: 1 / 3 + 1 / 2,
  })
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
    ownPerRound: 0,
    otherFindings: 0,
    otherRounds: 0,
    otherPerRound: 0,
    openedPlans,
    evenOpenedPlans,
  })
  assert.equal(hasUnevenOpeners(comparison(8, 2, 4.5)), true)
  assert.equal(hasUnevenOpeners(comparison(8, 3, 4.5)), false)
  assert.equal(hasUnevenOpeners(comparison(22, 9, 11)), false)
  assert.equal(hasUnevenOpeners(comparison(12, 6, 4)), true)
})

test("planning opener notes frame both tables, separate current and unlisted auditors and stay out of implementation", async (t) => {
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
            f.roundRoot,
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

  for (const [assistant, model, hour] of [
    ["claude", "thin-one", "10"],
    ["codex", "thin-two", "11"],
  ] as const)
    writeRoundData(join(f.roundRoot, "opener-thin-plan-rounds.json"), {
      ...round(
        `${model}-planning`,
        1,
        `2026-10-07T${hour}:00:00.000Z`,
        { assistant, ...selection(model), chosenBy: "settings" },
        settings,
        [phase("audit", assistant, model, 60_000)],
        commits,
        findings(1, `${model} claim`),
      ),
      phase: "detailing",
      settling: "",
    })

  const report = await modelsReport(f.runtime, {
    ...testSettings,
    planningAudit: {
      ...testSettings.planningAudit,
      auditors: [{ assistant: "claude", model: "listed", effort: "low" }],
    },
  })
  const planning = planningAuditors(report, "A/B")
  const unlistedLine =
    "Not in the current `planningAudit.auditors` list, opened an uneven share: `old-one low` 0 of 6; `old-two low` 0 of 6."
  const mainTable = planning.indexOf("| Model |")
  const caption = planning.indexOf("Fewer than 5 shared plans:")
  assert.ok(
    planning.startsWith("- `listed low` opened 6 of 6 plans.\n\n| Model |"),
  )
  assert.ok(mainTable < caption)
  assert.ok(caption < planning.indexOf(unlistedLine))
  assert.ok(planning.endsWith(unlistedLine))
  assert.match(
    planning,
    /Not in the current `planningAudit\.auditors` list, opened an uneven share: `old-one low` 0 of 6; `old-two low` 0 of 6\./,
  )
  // Openers count plans, not findings, so the C section prints the same lines.
  const cPlanning = planningAuditors(report, "C")
  assert.ok(
    cPlanning.startsWith("- `listed low` opened 6 of 6 plans.\n\n| Model |"),
  )
  assert.ok(cPlanning.endsWith(unlistedLine))
  const implementation = implementationAuditors(report, "A/B")
  assert.doesNotMatch(implementation, /opened|uneven share/)
})

test("all complete rounds count, a model without shared plans moves to the second table and disproved claims stay visible", async (t) => {
  const f = await modelFixture(t)
  const audit = await commit(
    f.root,
    "evidence/impl-audit-1 obl clean: fixture audit",
    "coder-alpha low",
  )
  const path = join(f.roundRoot, "evidence-1-plan-rounds.json")
  const commits = [{ repository: "repo-edu" as const, sha: audit }]
  const special = [
    { ...finding("kept claim"), number: 1 },
    {
      ...finding("dropped claim"),
      number: 2,
      reviews: [{ vet: fixtureVetTag, verdict: "drop" as const, answer: null }],
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
      writeRoundData(join(f.roundRoot, `evidence-${index}-plan-rounds.json`), {
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
  const implementationPath = join(f.roundRoot, "evidence-impl-rounds.json")
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
  writeRoundData(join(f.roundRoot, "audit-thin-plan-rounds.json"), {
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

  const report = await modelsReport(f.runtime, testSettings)
  assert.match(
    report,
    /\| audit-strong low \| 5 \| 5 in 5 \| 1\.00 \| 0 in 5 \| 0\.00 \| 1\.0 \| 44% \|/,
  )
  assert.match(
    report,
    /Fewer than 5 shared plans:\n\n\| Model [^\n]+\n\| --- [^\n]+\n\| audit-thin low \| 0 \| 0 in 0 \| — \| 0 in 0 \| — \| 1\.0 \| 0% \|/,
  )
  assert.doesNotMatch(report, /finds (more|fewer) than|more shared plan/)
  assert.match(report, /## Later rulings/)
  assert.match(report, /#4 later disproved claim/)
  assert.match(report, /vetter vet-model low \(accept\)/)
  assert.match(report, /The retained claim did not hold\./)
  assert.match(report, /no retained round data holds this finding/)
  assert.match(report, /No retained round held this finding\./)
})

test("--all prints measured rows that rebuild the per-round figures and wrong-claim totals", async (t) => {
  const f = await modelFixture(t)
  const audit = await commit(
    f.root,
    "evidence/impl-audit-1 obl clean: fixture audit",
    "coder-alpha low",
  )
  const commits = [{ repository: "repo-edu" as const, sha: audit }]
  const alphaPath = join(f.roundRoot, "alpha-plan-rounds.json")
  const alphaFindings = [
    { ...finding("kept claim"), number: 1 },
    {
      ...finding("dropped claim"),
      number: 2,
      reviews: [{ vet: fixtureVetTag, verdict: "drop" as const, answer: null }],
      outcome: "dropped" as const,
    },
    { ...finding("downgraded claim"), number: 3, finalTier: "C" as const },
    { ...finding("later disproved claim"), number: 4 },
  ]
  const addPlanningRound = (
    path: string,
    target: string,
    roundNumber: number,
    started: string,
    assistant: "claude" | "codex",
    model: string,
    milliseconds: number,
    roundFindings: RoundFinding[],
  ) =>
    writeRoundData(path, {
      ...round(
        target,
        roundNumber,
        started,
        { assistant, ...selection(model), chosenBy: "settings" },
        settings,
        [phase("audit", assistant, model, milliseconds)],
        commits,
        roundFindings,
      ),
      phase: "detailing",
      settling: "",
    })

  addPlanningRound(
    alphaPath,
    "model-a-alpha",
    1,
    "2026-10-01T10:00:00.000Z",
    "claude",
    "model-a",
    60_000,
    alphaFindings,
  )
  addPlanningRound(
    alphaPath,
    "model-a-alpha",
    2,
    "2026-10-01T11:00:00.000Z",
    "claude",
    "model-a",
    180_000,
    findings(1, "second kept claim"),
  )
  addPlanningRound(
    alphaPath,
    "model-b-alpha",
    3,
    "2026-10-01T12:00:00.000Z",
    "codex",
    "model-b",
    240_000,
    [],
  )

  const betaPath = join(f.roundRoot, "beta-plan-rounds.json")
  addPlanningRound(
    betaPath,
    "model-a-beta",
    1,
    "2026-10-02T10:00:00.000Z",
    "claude",
    "model-a",
    120_000,
    [],
  )
  for (const [roundNumber, milliseconds] of [
    [2, 120_000],
    [3, 360_000],
  ] as const)
    addPlanningRound(
      betaPath,
      "model-b-beta",
      roundNumber,
      `2026-10-02T1${roundNumber}:00:00.000Z`,
      "codex",
      "model-b",
      milliseconds,
      findings(2, `model-b beta ${roundNumber}`),
    )

  writeDisprovedFinding(alphaPath, {
    date: "2026-11-01",
    reason: "The attached claim did not hold.",
    target: "model-a-alpha",
    round: 1,
    finding: 4,
  })
  writeDisprovedFinding(join(f.roundRoot, "gamma-plan-rounds.json"), {
    date: "2026-11-02",
    reason: "The detached claim did not hold.",
    auditor: { model: "model-a", effort: "low" },
  })

  const context = f.runtime
  const report = await modelsReport(context, testSettings, { all: true })
  assert.match(
    report,
    /\| model-a low \| 2 \| 2 in 3 \| 0\.67 \| 4 in 3 \| 1\.33 \| 2\.0 \| 67% \|/,
  )
  assert.equal(
    report
      .split("## Planning rounds by plan, A/B findings\n\n")[1]
      .split("\n\n## Planning rounds by plan, C findings")[0],
    [
      "| Plan | Model | Rounds | A/B kept | Dropped | Downgraded | Disproved | Minutes per round |",
      "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |",
      "| beta | model-a low | 1 | 0 | 0 | 0 | 0 | 2.0 |",
      "|  | model-b low | 2 | 4 | 0 | 0 | 0 | 4.0 |",
      "| alpha | model-a low | 2 | 2 | 1 | 1 | 1 | 2.0 |",
      "|  | model-b low | 1 | 0 | 0 | 0 | 0 | 4.0 |",
      "| gamma | model-a low | 0 | 0 | 0 | 0 | 1 | — |",
    ].join("\n"),
  )
  assert.match(
    planningAuditors(report, "C"),
    /\| model-a low \| 2 \| 0 in 3 \| 0\.00 \| 0 in 3 \| 0\.00 \| 2\.0 \| 0% \|/,
  )
  assert.equal(
    report
      .split("## Planning rounds by plan, C findings\n\n")[1]
      .split("\n\n## Implementation rounds by plan")[0],
    [
      "| Plan | Model | Rounds | C kept | Dropped | Downgraded | Disproved | Minutes per round |",
      "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |",
      "| beta | model-a low | 1 | 0 | 0 | 0 | 0 | 2.0 |",
      "|  | model-b low | 2 | 0 | 0 | 0 | 0 | 4.0 |",
      "| alpha | model-a low | 2 | 0 | 0 | 0 | 0 | 2.0 |",
      "|  | model-b low | 1 | 0 | 0 | 0 | 0 | 4.0 |",
    ].join("\n"),
  )
  assert.match(
    report,
    /## Implementation rounds by plan, A\/B findings\n\n\| Plan \| Model \| Rounds \| A\/B kept \|/,
  )
  assert.match(
    report,
    /## Implementation rounds by plan, C findings\n\n\| Plan \| Model \| Rounds \| C kept \|/,
  )
  assert.ok(
    report.indexOf("## Planning rounds by plan") <
      report.indexOf("## Implementation rounds by plan"),
  )
  assert.ok(
    report.indexOf("## Implementation rounds by plan") <
      report.indexOf("## Excluded plans"),
  )

  const shortReport = await modelsReport(context, testSettings)
  assert.doesNotMatch(shortReport, /rounds by plan/)
})

test("disproved rulings separate finding and vet sides with one numbering sequence", async (t) => {
  const f = await modelFixture(t)
  const audit = await commit(
    f.root,
    "evidence/impl-audit-1 obl clean: fixture audit",
    "coder-alpha low",
  )
  const path = join(f.roundRoot, "evidence-plan-rounds.json")
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
        findings(3, `${model} claim`).map((entry, index) =>
          index === 2 || (model === "audit-beta" && index === 0)
            ? {
                ...entry,
                reviews: [
                  { vet: fixtureVetTag, verdict: "drop", answer: "agree" },
                ],
                outcome: "dropped",
              }
            : entry,
        ),
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
  writeDisprovedFinding(path, {
    date: "2026-11-05",
    reason: "The dropped beta finding was right. Its defect still reproduces.",
    target: "audit-beta-plan-audit",
    round: 1,
    finding: 1,
    side: "vet",
  })
  writeDisprovedFinding(path, {
    date: "2026-11-06",
    reason: "The dropped alpha finding was right.",
    target: "audit-alpha-plan-audit",
    round: 1,
    finding: 3,
    side: "vet",
  })

  const report = await modelsReport(f.runtime, testSettings)
  assert.equal(
    report.split("## Later rulings\n\n")[1],
    [
      "### Planning auditor findings",
      "",
      "| # | Date | Plan and round | Finding | Tier | Wrong | Right | Reason |",
      "| ---: | --- | --- | --- | --- | --- | --- | --- |",
      "| 1 | 2026-11-03 | evidence; no retained round data holds this finding | — | — | auditor audit-alpha low | — | It predates the data! |",
      "| 2 | 2026-11-02 | evidence; audit-alpha-plan-audit round 1 | #2 audit-alpha claim 2 | B | auditor audit-alpha low; vetter vet-model low (accept) | — | The vet accepted a stale reading |",
      "| 3 | 2026-11-01 | evidence; audit-alpha-plan-audit round 1 | #1 audit-alpha claim 1 | B | auditor audit-alpha low; vetter vet-model low (accept) | — | The claim misread the guard. |",
      "| 4 | 2026-11-04 | evidence; audit-beta-plan-audit round 1 | #2 audit-beta claim 2 | B | auditor audit-beta low; vetter vet-model low (accept) | — | Version 1.2 \\| the guard? |",
      "",
      "1. It predates the data! No retained round holds it.",
      "2. The vet accepted a stale reading",
      "3. The claim misread the guard. The guard runs before the write, so no race exists.",
      "4. Version 1.2 | the guard? It already handles this.",
      "",
      "### Planning vetter verdicts",
      "",
      "| # | Date | Plan and round | Finding | Tier | Wrong | Right | Reason |",
      "| ---: | --- | --- | --- | --- | --- | --- | --- |",
      "| 5 | 2026-11-06 | evidence; audit-alpha-plan-audit round 1 | #3 audit-alpha claim 3 | B | vetter vet-model low (drop) | auditor audit-alpha low | The dropped alpha finding was right. |",
      "| 6 | 2026-11-05 | evidence; audit-beta-plan-audit round 1 | #1 audit-beta claim 1 | B | vetter vet-model low (drop) | auditor audit-beta low | The dropped beta finding was right. |",
      "",
      "5. The dropped alpha finding was right.",
      "6. The dropped beta finding was right. Its defect still reproduces.",
      "",
    ].join("\n"),
  )
})

test("restoring a unanimously accepted finding leaves the Wrong column empty", async (t) => {
  const f = await modelFixture(t)
  const audit = await commit(
    f.root,
    "evidence/impl-audit-1 obl clean: fixture audit",
    "coder-alpha low",
  )
  const path = join(f.roundRoot, "evidence-plan-rounds.json")
  writeRoundData(path, {
    ...round(
      "audit-alpha-plan-audit",
      1,
      "2026-10-01T10:00:00.000Z",
      {
        assistant: "claude",
        ...selection("audit-alpha"),
        chosenBy: "settings",
      },
      settings,
      [
        phase("audit", "claude", "audit-alpha", 60_000),
        phase("vet", "codex", "vet-model", 60_000),
      ],
      [{ repository: "repo-edu", sha: audit }],
      [finding("accepted claim")],
    ),
    phase: "detailing",
    settling: "",
  })
  writeDisprovedFinding(path, {
    date: "2026-11-01",
    reason: "The finding stood as written.",
    target: "audit-alpha-plan-audit",
    round: 1,
    finding: 1,
    side: "vet",
  })

  const report = await modelsReport(f.runtime, testSettings)
  assert.equal(
    report.split("## Later rulings\n\n")[1],
    [
      "### Planning vetter verdicts",
      "",
      "| # | Date | Plan and round | Finding | Tier | Wrong | Right | Reason |",
      "| ---: | --- | --- | --- | --- | --- | --- | --- |",
      "| 1 | 2026-11-01 | evidence; audit-alpha-plan-audit round 1 | #1 accepted claim | B | — | auditor audit-alpha low; vetter vet-model low (accept) | The finding stood as written. |",
      "",
      "1. The finding stood as written.",
      "",
    ].join("\n"),
  )
})

test("a disproved row names every vetter of the round on its side with its verdict", async (t) => {
  const f = await modelFixture(t)
  const audit = await commit(
    f.root,
    "evidence/impl-audit-1 obl clean: fixture audit",
    "coder-alpha low",
  )
  const path = join(f.roundRoot, "evidence-plan-rounds.json")
  writeRoundData(path, {
    ...round(
      "audit-alpha-plan-audit",
      1,
      "2026-10-01T10:00:00.000Z",
      {
        assistant: "claude",
        ...selection("audit-alpha"),
        chosenBy: "settings",
      },
      settings,
      [
        phase("audit", "claude", "audit-alpha", 60_000),
        phase("vet", "claude", "vet-alpha", 60_000, "low", "atl"),
        phase("vet", "codex", "vet-model", 60_000, "low", "obl"),
      ],
      [{ repository: "repo-edu", sha: audit }],
      [
        {
          ...finding("dropped claim"),
          reviews: [
            { vet: "atl", verdict: "drop", answer: "agree" },
            { vet: "obl", verdict: "accept", answer: null },
          ],
          outcome: "dropped",
        },
      ],
    ),
    phase: "detailing",
    settling: "",
  })
  writeDisprovedFinding(path, {
    date: "2026-11-01",
    reason: "The dropped finding was right.",
    target: "audit-alpha-plan-audit",
    round: 1,
    finding: 1,
    side: "vet",
  })

  const report = await modelsReport(f.runtime, testSettings)
  assert.match(
    report,
    /\| #1 dropped claim \| B \| vetter vet-alpha low \(drop\) \| auditor audit-alpha low; vetter vet-model low \(accept\) \| The dropped finding was right\. \|/,
  )
})

test("a ruling against a ruler's winner prints in the ruler table of its work class", async (t) => {
  const f = await modelFixture(t)
  const { alpha, beta } = panelVets
  const ruled = (
    number: number,
    verdicts: readonly [Review["verdict"], Review["verdict"]],
    winner: NonNullable<RoundFinding["ruling"]>["winner"],
  ): RoundFinding => ({
    ...ruledFinding(number, `claim ${number}`, "C", [
      review("atl", verdicts[0]),
      review("obl", verdicts[1]),
    ]),
    ruling: { winner, reason: "fixture ruling", namedBy: "ruler" },
  })
  const path = join(f.roundRoot, "ruled-impl-rounds.json")
  writeRoundData(path, {
    ...round(
      "ruled-impl-audit-01..01",
      1,
      "2026-10-02T10:00:00.000Z",
      { assistant: "codex", ...selection("audit-beta"), chosenBy: "settings" },
      panelSettings([alpha, beta]),
      [
        phase("audit", "codex", "audit-beta", 60_000),
        alpha,
        beta,
        phase("rule", "claude", "rule-model", 60_000, "xhigh"),
      ],
      [],
      [
        ruled(1, ["accept", "drop"], ["obl"]),
        ruled(2, ["accept", "drop"], "report"),
        ruled(3, ["accept", "drop"], ["obl"]),
        ruled(4, ["needs-user-ruling", "revise"], "neither"),
      ],
    ),
    scope: "1",
    judgedRepos: ["repo-edu"],
  })
  const disprove = (finding: number, side: "finding" | "vet") =>
    writeDisprovedFinding(path, {
      date: `2026-11-0${finding}`,
      reason: `Ruling ${finding}.`,
      target: "ruled-impl-audit-01..01",
      round: 1,
      finding,
      side,
    })
  disprove(1, "vet")
  disprove(2, "finding")
  disprove(3, "finding")
  disprove(4, "finding")

  const report = await modelsReport(f.runtime, testSettings)
  assert.equal(
    report.split("## Later rulings\n\n")[1],
    [
      "### Implementation auditor findings",
      "",
      "| # | Date | Plan and round | Finding | Tier | Wrong | Right | Reason |",
      "| ---: | --- | --- | --- | --- | --- | --- | --- |",
      "| 1 | 2026-11-04 | ruled; ruled-impl-audit-01..01 round 1 | #4 claim 4 | C | auditor audit-beta low; vetter vet-beta low (revise) | ruler rule-model xhigh (named neither) | Ruling 4. |",
      "| 2 | 2026-11-03 | ruled; ruled-impl-audit-01..01 round 1 | #3 claim 3 | C | auditor audit-beta low; vetter vet-alpha low (accept) | vetter vet-beta low (drop); ruler rule-model xhigh (named vet-beta low) | Ruling 3. |",
      "",
      "1. Ruling 4.",
      "2. Ruling 3.",
      "",
      "### Implementation ruler winners",
      "",
      "| # | Date | Plan and round | Finding | Tier | Wrong | Right | Reason |",
      "| ---: | --- | --- | --- | --- | --- | --- | --- |",
      "| 3 | 2026-11-02 | ruled; ruled-impl-audit-01..01 round 1 | #2 claim 2 | C | auditor audit-beta low; vetter vet-alpha low (accept); ruler rule-model xhigh (named report) | vetter vet-beta low (drop) | Ruling 2. |",
      "| 4 | 2026-11-01 | ruled; ruled-impl-audit-01..01 round 1 | #1 claim 1 | C | vetter vet-beta low (drop); ruler rule-model xhigh (named vet-beta low) | auditor audit-beta low; vetter vet-alpha low (accept) | Ruling 1. |",
      "",
      "3. Ruling 2.",
      "4. Ruling 1.",
      "",
    ].join("\n"),
  )
})

type Review = RoundFinding["reviews"][number]

/** A vetter's review, with the rebuttal's agreement on any verdict it answers. */
const review = (
  vet: string,
  verdict: Review["verdict"],
  extra: Partial<Review> = {},
): Review => ({
  vet,
  verdict,
  answer:
    verdict === "accept"
      ? null
      : verdict === "needs-user-ruling"
        ? "for-user-ruling"
        : "agree",
  ...extra,
})

const panelVets = {
  alpha: phase("vet", "claude", "vet-alpha", 60_000, "low", "atl"),
  beta: phase("vet", "codex", "vet-beta", 60_000, "low", "obl"),
  gamma: phase("vet", "claude", "vet-gamma", 60_000, "medium", "abm"),
}

const panelSettings = (
  vets: readonly RoundData["phases"][number][],
): RoundData["settings"] => ({
  ...settings,
  vetters: vets.map((vet) => ({
    assistant: vet.assistant,
    model: vet.model,
    effort: vet.effort,
  })),
})

const ruledFinding = (
  number: number,
  title: string,
  tier: RoundFinding["tier"],
  reviews: readonly Review[],
  ruling?: Omit<NonNullable<RoundFinding["ruling"]>, "namedBy">,
): RoundFinding => ({
  ...finding(title),
  number,
  tier,
  reviews: [...reviews],
  ...(ruling === undefined ? {} : { ruling: { ...ruling, namedBy: "user" } }),
})

test("vetter-pair tables count each class's shared findings per tier range, ruled splits and their endings", async (t) => {
  const f = await modelFixture(t)
  const { alpha, beta, gamma } = panelVets
  const auditor = {
    assistant: "claude" as const,
    ...selection("audit-alpha"),
    chosenBy: "settings" as const,
  }
  const reason = "fixture ruling"
  const trio = (
    number: number,
    tier: RoundFinding["tier"],
    verdicts: readonly [
      Review["verdict"],
      Review["verdict"],
      Review["verdict"],
    ],
    winner?: NonNullable<RoundFinding["ruling"]>["winner"],
  ) =>
    ruledFinding(
      number,
      `claim ${number}`,
      tier,
      [
        review("atl", verdicts[0]),
        review("obl", verdicts[1]),
        review("abm", verdicts[2]),
      ],
      winner === undefined ? undefined : { winner, reason },
    )
  const planPath = join(f.roundRoot, "panel-plan-rounds.json")
  writeRoundData(planPath, {
    ...round(
      "panel-plan-audit",
      1,
      "2026-10-01T10:00:00.000Z",
      auditor,
      panelSettings([alpha, beta, gamma]),
      [phase("audit", "claude", "audit-alpha", 60_000), alpha, beta, gamma],
      [],
      [
        trio(1, "B", ["accept", "accept", "accept"]),
        trio(2, "B", ["drop", "accept", "accept"], ["atl"]),
        trio(3, "B", ["revise", "revise", "accept"], ["atl", "obl"]),
        {
          ...trio(4, "C", ["drop", "accept", "accept"]),
          ruling: {
            winner: ["obl", "abm"],
            reason: "The ruler read the cited rule.",
            namedBy: "ruler",
          },
        },
        ruledFinding(5, "claim 5", "C", [
          review("atl", "accept"),
          review("obl", "revise", { revisedTier: "B" }),
          review("abm", "accept"),
        ]),
        trio(6, "B", ["drop", "needs-user-ruling", "drop"], "neither"),
        trio(7, "A", ["accept", "drop", "revise"], "report"),
        trio(8, "B", ["revise", "accept", "drop"], ["atl", "abm"]),
        trio(9, "B", ["accept", "drop", "accept"], "report"),
        trio(10, "B", ["accept", "drop", "drop"]),
      ],
    ),
    phase: "detailing",
    settling: "",
  })
  writeDisprovedFinding(planPath, {
    date: "2026-11-01",
    reason: "The claim did not hold.",
    target: "panel-plan-audit",
    round: 1,
    finding: 9,
  })
  writeDisprovedFinding(planPath, {
    date: "2026-11-02",
    reason: "The dropped claim was right.",
    target: "panel-plan-audit",
    round: 1,
    finding: 10,
    side: "vet",
  })
  const implementationPath = join(f.roundRoot, "panel-impl-rounds.json")
  writeRoundData(implementationPath, {
    ...round(
      "panel-impl-audit-01..01",
      1,
      "2026-10-02T10:00:00.000Z",
      auditor,
      panelSettings([alpha, beta]),
      [phase("audit", "claude", "audit-alpha", 60_000), alpha, beta],
      [],
      [
        ruledFinding(
          1,
          "contested revision",
          "B",
          [
            review("atl", "accept"),
            review("obl", "revise", { answer: "contest" }),
          ],
          { winner: ["obl"], reason },
        ),
        ruledFinding(
          2,
          "ruled C split",
          "C",
          [review("atl", "accept"), review("obl", "drop")],
          { winner: ["atl"], reason },
        ),
        ruledFinding(3, "agreed C claim", "C", [
          review("atl", "accept"),
          review("obl", "accept"),
        ]),
        ruledFinding(4, "D split", "D", [
          review("atl", "accept"),
          review("obl", "drop"),
        ]),
        ruledFinding(5, "C split without a ruling", "C", [
          review("atl", "revise"),
          review("obl", "accept"),
        ]),
      ],
    ),
    scope: "1",
    judgedRepos: ["repo-edu"],
  })
  writeRoundData(implementationPath, {
    ...round(
      "panel-impl-audit-01..01",
      2,
      "2026-10-03T10:00:00.000Z",
      auditor,
      panelSettings([gamma]),
      [phase("audit", "claude", "audit-alpha", 60_000), gamma],
      [],
      [ruledFinding(1, "lone claim", "B", [review("abm", "drop")])],
    ),
    scope: "1",
    judgedRepos: ["repo-edu"],
  })

  const report = await modelsReport(f.runtime, testSettings)
  assert.equal(
    report
      .split("## Planning vetter pairs, A/B findings\n\n")[1]
      .split("\n\nA vetter is")[0],
    [
      "| Vetter 1 | Vetter 2 | Shared A/B findings | Ruled splits | Split: vetter 1 right | Split: vetter 2 right | Split: both right | Split: neither right |",
      "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |",
      "| vet-alpha low | vet-beta low | 9 | 6 | 4 | 1 | 0 | 1 |",
      "| vet-alpha low | vet-gamma medium | 9 | 5 | 4 | 0 | 1 | 0 |",
      "| vet-beta low | vet-gamma medium | 9 | 5 | 2 | 1 | 0 | 2 |",
      "",
      "## Planning vetter pairs, C findings",
      "",
      "| Vetter 1 | Vetter 2 | Shared C findings | Ruled splits | Split: vetter 1 right | Split: vetter 2 right | Split: both right | Split: neither right |",
      "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |",
      "| vet-alpha low | vet-beta low | 1 | 1 | 0 | 1 | 0 | 0 |",
      "| vet-alpha low | vet-gamma medium | 1 | 1 | 0 | 1 | 0 | 0 |",
      "| vet-beta low | vet-gamma medium | 1 | 0 | 0 | 0 | 0 | 0 |",
      "",
      "## Implementation vetter pairs, A/B findings",
      "",
      "| Vetter 1 | Vetter 2 | Shared A/B findings | Ruled splits | Split: vetter 1 right | Split: vetter 2 right | Split: both right | Split: neither right |",
      "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |",
      "| vet-alpha low | vet-beta low | 1 | 1 | 0 | 1 | 0 | 0 |",
      "",
      "## Implementation vetter pairs, C findings",
      "",
      "| Vetter 1 | Vetter 2 | Shared C findings | Ruled splits | Split: vetter 1 right | Split: vetter 2 right | Split: both right | Split: neither right |",
      "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |",
      "| vet-alpha low | vet-beta low | 3 | 1 | 1 | 0 | 0 | 0 |",
    ].join("\n"),
  )
})

test("a read-out without a panel of two vetters prints no vetter pairs", async (t) => {
  const f = await modelFixture(t)
  writeRoundData(join(f.roundRoot, "lone-plan-rounds.json"), {
    ...round(
      "lone-plan-audit",
      1,
      "2026-10-01T10:00:00.000Z",
      {
        assistant: "claude",
        ...selection("audit-alpha"),
        chosenBy: "settings",
      },
      panelSettings([panelVets.alpha]),
      [phase("audit", "claude", "audit-alpha", 60_000), panelVets.alpha],
      [],
      [ruledFinding(1, "lone claim", "A", [review("atl", "drop")])],
    ),
    phase: "detailing",
    settling: "",
  })

  const report = await modelsReport(f.runtime, testSettings)
  assert.match(report, /No implementation vetter times are recorded\./)
  assert.match(
    report,
    /## Planning vetter pairs, A\/B findings\n\nNo two planning vetters have judged the same A or B finding\.\n\n## Planning vetter pairs, C findings\n\nNo two planning vetters have judged the same C finding\.\n\n## Implementation vetter pairs, A\/B findings\n\nNo two implementation vetters have judged the same A or B finding\.\n\n## Implementation vetter pairs, C findings\n\nNo two implementation vetters have judged the same C finding\.\n/,
  )
})

test("vetters by auditor compare the vetter on the auditor's exact model with each other vetter, per class and range", async (t) => {
  const f = await modelFixture(t)
  const { alpha, beta, gamma } = panelVets
  const auditedBy = (
    vet: RoundData["phases"][number],
    effort = vet.effort,
  ): RoundData["auditor"] => ({
    assistant: vet.assistant,
    model: vet.model,
    effort,
    chosenBy: "settings",
  })
  const audit = (vet: RoundData["phases"][number]) =>
    phase("audit", vet.assistant, vet.model, 60_000, vet.effort ?? "low")
  const reason = "fixture ruling"
  const byRuler = (
    entry: RoundFinding,
    winner: NonNullable<RoundFinding["ruling"]>["winner"],
  ): RoundFinding => ({
    ...entry,
    ruling: { winner, reason, namedBy: "ruler" },
  })
  const planPath = join(f.roundRoot, "byauditor-plan-rounds.json")
  const planRound = (
    roundNumber: number,
    auditor: RoundData["auditor"],
    phases: RoundData["phases"],
    findings: RoundFinding[],
  ) =>
    writeRoundData(planPath, {
      ...round(
        "byauditor-plan-audit",
        roundNumber,
        `2026-10-0${roundNumber}T10:00:00.000Z`,
        auditor,
        panelSettings(phases.filter((entry) => entry.phase === "vet")),
        phases,
        [],
        findings,
      ),
      phase: "detailing",
      settling: "",
    })
  planRound(
    1,
    auditedBy(alpha),
    [
      audit(alpha),
      alpha,
      beta,
      gamma,
      phase("rule", "claude", "rule-model", 60_000, "xhigh"),
    ],
    [
      ruledFinding(
        1,
        "user-ruled B split",
        "B",
        [
          review("atl", "accept"),
          review("obl", "drop"),
          review("abm", "accept"),
        ],
        { winner: ["atl", "abm"], reason },
      ),
      ruledFinding(2, "open B split", "B", [
        review("atl", "revise"),
        review("obl", "revise"),
        review("abm", "accept"),
      ]),
      byRuler(
        ruledFinding(3, "ruler-ruled C split", "C", [
          review("atl", "accept"),
          review("obl", "drop"),
          review("abm", "drop"),
        ]),
        ["obl", "abm"],
      ),
      byRuler(
        ruledFinding(4, "later-disproved C split", "C", [
          review("atl", "drop"),
          review("obl", "accept"),
          review("abm", "accept"),
        ]),
        "report",
      ),
    ],
  )
  planRound(
    2,
    auditedBy(beta),
    [audit(beta), alpha, beta],
    [
      byRuler(
        ruledFinding(1, "C split without a recorded ruler", "C", [
          review("atl", "accept"),
          review("obl", "drop"),
        ]),
        ["obl"],
      ),
      ruledFinding(
        2,
        "B split nobody won",
        "B",
        [review("atl", "drop"), review("obl", "accept")],
        { winner: "neither", reason },
      ),
    ],
  )
  planRound(
    3,
    auditedBy(gamma, "low"),
    [audit(gamma), alpha, gamma],
    [
      ruledFinding(
        1,
        "other effort",
        "B",
        [review("atl", "accept"), review("abm", "drop")],
        { winner: ["abm"], reason },
      ),
    ],
  )
  writeDisprovedFinding(planPath, {
    date: "2026-11-01",
    reason: "The claim did not hold.",
    target: "byauditor-plan-audit",
    round: 1,
    finding: 4,
  })
  writeRoundData(join(f.roundRoot, "byauditor-impl-rounds.json"), {
    ...round(
      "byauditor-impl-audit-01..01",
      1,
      "2026-10-04T10:00:00.000Z",
      auditedBy(alpha),
      panelSettings([alpha, beta]),
      [audit(alpha), alpha, beta],
      [],
      [
        ruledFinding(
          1,
          "implementation B split",
          "B",
          [review("atl", "drop"), review("obl", "accept")],
          { winner: ["atl"], reason },
        ),
      ],
    ),
    scope: "1",
    judgedRepos: ["repo-edu"],
  })

  const pairHead = (range: TierRange) => [
    `| Vetter 1 | Vetter 2 | Shared ${range} findings | Ruled splits | Split: vetter 1 right | Split: vetter 2 right | Split: both right | Split: neither right |`,
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |",
  ]
  const byAuditorHead = [
    "| Auditor as vetter | Other vetter | Shared findings | Challenges by auditor as vetter | Challenges by other vetter | Ruled splits | Auditor as vetter only right | Other only right | Both right | Neither right |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  ]
  const byJudgeHead = [
    "| Auditor as vetter | Other vetter | Judge | Ruled splits | Auditor as vetter only right | Other only right | Both right | Neither right |",
    "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |",
  ]
  const pairs = [
    "## Planning vetter pairs, A/B findings",
    "",
    ...pairHead("A/B"),
    "| vet-alpha low | vet-beta low | 3 | 2 | 1 | 0 | 0 | 1 |",
    "| vet-alpha low | vet-gamma medium | 3 | 1 | 0 | 1 | 0 | 0 |",
    "| vet-beta low | vet-gamma medium | 2 | 1 | 0 | 1 | 0 | 0 |",
    "",
    "## Planning vetter pairs, C findings",
    "",
    ...pairHead("C"),
    "| vet-alpha low | vet-beta low | 3 | 3 | 1 | 2 | 0 | 0 |",
    "| vet-alpha low | vet-gamma medium | 2 | 2 | 1 | 1 | 0 | 0 |",
    "| vet-beta low | vet-gamma medium | 2 | 0 | 0 | 0 | 0 | 0 |",
    "",
    "## Implementation vetter pairs, A/B findings",
    "",
    ...pairHead("A/B"),
    "| vet-alpha low | vet-beta low | 1 | 1 | 1 | 0 | 0 | 0 |",
    "",
    "## Implementation vetter pairs, C findings",
    "",
    "No two implementation vetters have judged the same C finding.",
  ]
  const byAuditor = [
    "## Planning vetters by auditor, A/B findings",
    "",
    ...byAuditorHead,
    "| vet-alpha low | vet-beta low | 2 | 1 | 2 | 1 | 1 | 0 | 0 | 0 |",
    "| vet-alpha low | vet-gamma medium | 2 | 1 | 0 | 0 | 0 | 0 | 0 | 0 |",
    "| vet-beta low | vet-alpha low | 1 | 0 | 1 | 1 | 0 | 0 | 0 | 1 |",
    "",
    "## Planning vetters by auditor, C findings",
    "",
    ...byAuditorHead,
    "| vet-alpha low | vet-beta low | 2 | 1 | 1 | 2 | 1 | 1 | 0 | 0 |",
    "| vet-alpha low | vet-gamma medium | 2 | 1 | 1 | 2 | 1 | 1 | 0 | 0 |",
    "| vet-beta low | vet-alpha low | 1 | 1 | 0 | 1 | 1 | 0 | 0 | 0 |",
    "",
    "## Implementation vetters by auditor, A/B findings",
    "",
    ...byAuditorHead,
    "| vet-alpha low | vet-beta low | 1 | 1 | 0 | 1 | 1 | 0 | 0 | 0 |",
    "",
    "## Implementation vetters by auditor, C findings",
    "",
    "No implementation C finding was judged by a vetter on its auditor's model and effort beside another vetter.",
  ]
  const byJudge = [
    "## Planning vetters by auditor and judge, C findings",
    "",
    ...byJudgeHead,
    "| vet-alpha low | vet-beta low | ruler rule-model xhigh | 1 | 0 | 1 | 0 | 0 |",
    "| vet-alpha low | vet-beta low | user | 1 | 1 | 0 | 0 | 0 |",
    "| vet-alpha low | vet-gamma medium | ruler rule-model xhigh | 1 | 0 | 1 | 0 | 0 |",
    "| vet-alpha low | vet-gamma medium | user | 1 | 1 | 0 | 0 | 0 |",
    "| vet-beta low | vet-alpha low | ruler not recorded | 1 | 1 | 0 | 0 | 0 |",
    "",
    "## Implementation vetters by auditor and judge, C findings",
    "",
    "No implementation C finding judged by a vetter on its auditor's model and effort beside another vetter holds a ruled split.",
  ]
  const section = (report: string) =>
    report
      .split("\n\nAuditor rows sort by")[1]
      .split("\n\nAuditor as vetter ran on")[0]
      .split(/\n\nA vetter is a model and an effort\.[^\n]*\n\n/)

  const [defaultPairs, defaultByAuditor] = section(
    await modelsReport(f.runtime, testSettings),
  )
  assert.equal(defaultPairs.split(/^[^\n]*\n\n/)[1], pairs.join("\n"))
  assert.equal(defaultByAuditor, byAuditor.join("\n"))

  const [allPairs, allByAuditor] = section(
    await modelsReport(f.runtime, testSettings, { all: true }),
  )
  assert.equal(allPairs, defaultPairs)
  assert.equal(allByAuditor, [...byAuditor, "", ...byJudge].join("\n"))
})

test("vetter times count actual participants and pool runs only in each vetter's rounds and class", async (t) => {
  const f = await modelFixture(t)
  const { alpha, beta, gamma } = panelVets
  const audit = phase("audit", "claude", "auditor", 6_000_000)
  const timedRound = (
    target: string,
    number: number,
    vets: RoundData["phases"],
  ) =>
    round(
      target,
      number,
      "2026-10-01T10:00:00.000Z",
      { assistant: "claude", ...selection("auditor"), chosenBy: "settings" },
      panelSettings([alpha, beta, gamma]),
      [audit, ...vets],
      [],
      [],
    )
  const planningPanels = [
    [alpha, { ...beta, milliseconds: 180_000 }],
    [
      { ...alpha, milliseconds: 420_000 },
      { ...beta, milliseconds: 360_000 },
      { ...gamma, milliseconds: 480_000 },
    ],
    [{ ...gamma, milliseconds: 120_000 }],
    [],
  ]
  for (const [index, panel] of planningPanels.entries())
    writeRoundData(join(f.roundRoot, "times-plan-rounds.json"), {
      ...timedRound("times-plan-audit", index + 1, panel),
      status: index === 2 ? "interrupted" : "finished",
      phase: "detailing",
      settling: "",
    })
  writeRoundData(join(f.roundRoot, "times-impl-rounds.json"), {
    ...timedRound("times-impl-audit-01..01", 1, [
      alpha,
      {
        ...gamma,
        model: alpha.model,
        effort: alpha.effort,
        milliseconds: 420_000,
      },
      { ...beta, milliseconds: 0 },
    ]),
    scope: "1",
    judgedRepos: ["repo-edu"],
  })

  const report = await modelsReport(f.runtime, testSettings)
  const table = (title: string) =>
    report.split(`## ${title} vetter times\n\n`)[1].split("\n\n")[0].split("\n")
  const header = [
    "| Vetter | Rounds | Average number of vetters in those rounds | Own average (min) | All vetters in those rounds (min) |",
    "| --- | ---: | ---: | ---: | ---: |",
  ]
  assert.deepEqual(table("Planning"), [
    ...header,
    "| vet-alpha low | 2 | 2.5 | 4.0 | 5.0 |",
    "| vet-beta low | 2 | 2.5 | 4.5 | 5.0 |",
    "| vet-gamma medium | 2 | 2.0 | 5.0 | 5.8 |",
  ])
  assert.deepEqual(table("Implementation"), [
    ...header,
    "| vet-alpha low | 1 | 3.0 | 4.0 | 2.7 |",
    "| vet-beta low | 1 | 3.0 | 0.0 | 2.7 |",
  ])
})

test("ruling and ruler winner tables show changed winners and keep the round's reason and order", async (t) => {
  const f = await modelFixture(t)
  const { alpha, beta } = panelVets
  const planPath = join(f.roundRoot, "ruled-plan-rounds.json")
  writeRoundData(planPath, {
    ...round(
      "ruled-plan-audit",
      1,
      "2026-10-01T10:00:00.000Z",
      {
        assistant: "claude",
        ...selection("audit-alpha"),
        chosenBy: "settings",
      },
      panelSettings([beta]),
      [phase("audit", "claude", "audit-alpha", 60_000), beta],
      [],
      [
        ruledFinding(
          1,
          "old contest",
          "B",
          [review("obl", "drop", { answer: "contest" })],
          {
            winner: ["obl"],
            reason: "The vet was right. The guard already holds.",
          },
        ),
      ],
    ),
    phase: "detailing",
    settling: "",
  })
  writeRoundData(planPath, {
    ...round(
      "ruled-plan-audit",
      2,
      "2026-10-03T10:00:00.000Z",
      {
        assistant: "claude",
        ...selection("audit-alpha"),
        chosenBy: "settings",
      },
      panelSettings([alpha, beta]),
      [
        phase("audit", "claude", "audit-alpha", 60_000),
        beta,
        alpha,
        phase("rule", "codex", "plan-ruler", 60_000, "high"),
      ],
      [],
      [
        ruledFinding(
          1,
          "ruled split",
          "A",
          [review("atl", "accept"), review("obl", "drop")],
          { winner: "report", reason: "The finding stood as written." },
        ),
        ruledFinding(2, "agreed claim", "B", [
          review("atl", "accept"),
          review("obl", "accept"),
        ]),
        ruledFinding(
          3,
          "two corrections",
          "B",
          [review("atl", "revise"), review("obl", "drop")],
          { winner: ["atl", "obl"], reason: "Both corrections hold." },
        ),
        {
          ...ruledFinding(4, "plan wording", "C", [
            review("atl", "accept"),
            review("obl", "revise"),
          ]),
          ruling: {
            winner: "report",
            reason: "The plan uses both terms.",
            namedBy: "ruler",
          },
        },
      ],
    ),
    phase: "detailing",
    settling: "",
  })
  const implPath = join(f.roundRoot, "ruled-impl-rounds.json")
  writeRoundData(implPath, {
    ...round(
      "ruled-impl-audit-01..01",
      1,
      "2026-10-02T10:00:00.000Z",
      {
        assistant: "codex",
        ...selection("audit-beta"),
        chosenBy: "settings",
      },
      panelSettings([alpha, beta]),
      [
        phase("audit", "codex", "audit-beta", 60_000),
        beta,
        alpha,
        phase("rule", "claude", "rule-model", 60_000, "xhigh"),
      ],
      [],
      [
        {
          ...ruledFinding(1, "ruled C split", "C", [
            review("atl", "accept"),
            review("obl", "drop"),
          ]),
          ruling: {
            winner: ["atl"],
            reason: "The ruler opened the cited test. It covers the case.",
            namedBy: "ruler",
          },
        },
        ruledFinding(
          2,
          "ruled contest",
          "B",
          [review("atl", "drop"), review("obl", "drop", { answer: "contest" })],
          {
            winner: "neither",
            reason: "Neither side held; a third correction landed.",
          },
        ),
      ],
    ),
    scope: "1",
    judgedRepos: ["repo-edu"],
  })

  const later = { target: "ruled-plan-audit", date: "2026-11-01" }
  writeDisprovedFinding(planPath, {
    ...later,
    round: 1,
    finding: 1,
    reason: "The guard was already in place.",
  })
  writeDisprovedFinding(planPath, {
    ...later,
    round: 2,
    finding: 3,
    revision: "atl",
    reason: "Only the revision held.",
  })
  writeDisprovedFinding(planPath, {
    ...later,
    round: 2,
    finding: 4,
    reason: "The original wording was correct.",
  })
  writeDisprovedFinding(implPath, {
    target: "ruled-impl-audit-01..01",
    date: later.date,
    round: 1,
    finding: 2,
    reason: "Both vetters correctly dropped the finding.",
  })

  const report = await modelsReport(f.runtime, testSettings, { winners: true })
  assert.equal(
    report
      .split("## Planning ruling winners\n\n")[1]
      .split("\n\n## Later rulings")[0],
    [
      "| # | Plan and round | Finding | Tier | Auditor | Vetters | Winners | Reason |",
      "| ---: | --- | --- | --- | --- | --- | --- | --- |",
      "| 1 | ruled; ruled-plan-audit round 2 | #1 ruled split | A | audit-alpha low | vet-beta low: drop; vet-alpha low: accept | auditor audit-alpha low; vetter vet-alpha low | The finding stood as written. |",
      "| 2 | ruled; ruled-plan-audit round 2 | #3 two corrections | B | audit-alpha low | vet-beta low: drop; vet-alpha low: revise | **Disproved** vetter vet-alpha low; vetter vet-beta low **Winning** vetter vet-alpha low | Both corrections hold. |",
      "| 3 | ruled; ruled-plan-audit round 1 | #1 old contest | B | audit-alpha low | vet-beta low: drop | vetter vet-beta low | The vet was right. |",
      "",
      "1. The finding stood as written.",
      "2. Both corrections hold.",
      "3. The vet was right. The guard already holds.",
      "",
      "## Implementation ruling winners",
      "",
      "| # | Plan and round | Finding | Tier | Auditor | Vetters | Winners | Reason |",
      "| ---: | --- | --- | --- | --- | --- | --- | --- |",
      "| 1 | ruled; ruled-impl-audit-01..01 round 1 | #2 ruled contest | B | audit-beta low | vet-beta low: drop; vet-alpha low: drop | **Disproved** none **Winning** vetter vet-alpha low; vetter vet-beta low | Neither side held; a third correction landed. |",
      "",
      "1. Neither side held; a third correction landed.",
      "",
      "## Planning ruler winners",
      "",
      "| # | Plan and round | Finding | Tier | Auditor | Vetters | Ruler | Winners | Reason |",
      "| ---: | --- | --- | --- | --- | --- | --- | --- | --- |",
      "| 1 | ruled; ruled-plan-audit round 2 | #4 plan wording | C | audit-alpha low | vet-beta low: revise; vet-alpha low: accept | plan-ruler high | **Disproved** auditor audit-alpha low; vetter vet-alpha low **Winning** none | The plan uses both terms. |",
      "",
      "1. The plan uses both terms.",
      "",
      "## Implementation ruler winners",
      "",
      "| # | Plan and round | Finding | Tier | Auditor | Vetters | Ruler | Winners | Reason |",
      "| ---: | --- | --- | --- | --- | --- | --- | --- | --- |",
      "| 1 | ruled; ruled-impl-audit-01..01 round 1 | #1 ruled C split | C | audit-beta low | vet-beta low: drop; vet-alpha low: accept | rule-model xhigh | auditor audit-beta low; vetter vet-alpha low | The ruler opened the cited test. |",
      "",
      "1. The ruler opened the cited test. It covers the case.",
    ].join("\n"),
  )
})

test("a winner that names one vetter also proves right each vetter with the same accept, drop or referral, and the auditor when it accepted", async (t) => {
  const f = await modelFixture(t)
  const { alpha, beta, gamma } = panelVets
  const named = (
    number: number,
    title: string,
    verdicts: readonly [
      Review["verdict"],
      Review["verdict"],
      Review["verdict"],
    ],
    winner: string,
  ) =>
    ruledFinding(
      number,
      title,
      "B",
      [
        review("atl", verdicts[0]),
        review("obl", verdicts[1]),
        review("abm", verdicts[2]),
      ],
      { winner: [winner], reason: "fixture ruling" },
    )
  writeRoundData(join(f.roundRoot, "same-plan-rounds.json"), {
    ...round(
      "same-plan-audit",
      1,
      "2026-10-01T10:00:00.000Z",
      {
        assistant: "claude",
        ...selection("audit-alpha"),
        chosenBy: "settings",
      },
      panelSettings([alpha, beta, gamma]),
      [phase("audit", "claude", "audit-alpha", 60_000), alpha, beta, gamma],
      [],
      [
        named(1, "named accept", ["accept", "revise", "accept"], "atl"),
        named(2, "named drop", ["accept", "drop", "drop"], "obl"),
        named(3, "named revision", ["revise", "revise", "accept"], "obl"),
        named(
          4,
          "named referral",
          ["needs-user-ruling", "needs-user-ruling", "drop"],
          "atl",
        ),
      ],
    ),
    phase: "detailing",
    settling: "",
  })

  const report = await modelsReport(f.runtime, testSettings, { winners: true })
  assert.equal(
    report
      .split("## Planning ruling winners\n\n")[1]
      .split("\n\n## Implementation ruling winners")[0],
    [
      "| # | Plan and round | Finding | Tier | Auditor | Vetters | Winners | Reason |",
      "| ---: | --- | --- | --- | --- | --- | --- | --- |",
      "| 1 | same; same-plan-audit round 1 | #1 named accept | B | audit-alpha low | vet-alpha low: accept; vet-beta low: revise; vet-gamma medium: accept | auditor audit-alpha low; vetter vet-alpha low; vetter vet-gamma medium | fixture ruling |",
      "| 2 | same; same-plan-audit round 1 | #2 named drop | B | audit-alpha low | vet-alpha low: accept; vet-beta low: drop; vet-gamma medium: drop | vetter vet-beta low; vetter vet-gamma medium | fixture ruling |",
      "| 3 | same; same-plan-audit round 1 | #3 named revision | B | audit-alpha low | vet-alpha low: revise; vet-beta low: revise; vet-gamma medium: accept | vetter vet-beta low | fixture ruling |",
      "| 4 | same; same-plan-audit round 1 | #4 named referral | B | audit-alpha low | vet-alpha low: needs-user-ruling; vet-beta low: needs-user-ruling; vet-gamma medium: drop | vetter vet-alpha low; vetter vet-beta low | fixture ruling |",
      "",
      "1. fixture ruling",
      "2. fixture ruling",
      "3. fixture ruling",
      "4. fixture ruling",
    ].join("\n"),
  )
  assert.equal(
    report
      .split("## Planning vetter pairs, A/B findings\n\n")[1]
      .split("\n\n## Planning vetter pairs, C findings")[0],
    [
      "| Vetter 1 | Vetter 2 | Shared A/B findings | Ruled splits | Split: vetter 1 right | Split: vetter 2 right | Split: both right | Split: neither right |",
      "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |",
      "| vet-alpha low | vet-beta low | 4 | 2 | 1 | 1 | 0 | 0 |",
      "| vet-alpha low | vet-gamma medium | 4 | 3 | 1 | 1 | 0 | 1 |",
      "| vet-beta low | vet-gamma medium | 4 | 3 | 2 | 1 | 0 | 0 |",
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

  const evidence = await readModelEvidence(f.runtime)
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

  const evidence = await readModelEvidence(f.runtime)
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

  const evidence = await readModelEvidence(f.runtime)
  const row = evidence.coders.get(
    modelKey({ assistant: "codex", model: "coder-alpha", effort: "low" }),
  )
  assert.ok(row)
  assert.equal(row.excluded.get(stem), "no implementation round data")
})

test("a plan whose step time cannot be read is excluded from coder evidence", async (t) => {
  const f = await modelFixture(t)
  const stem = "untimed"
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

  const evidence = await readModelEvidence(f.runtime)
  const row = evidence.coders.get(
    modelKey({ assistant: "codex", model: "coder-alpha", effort: "low" }),
  )
  assert.ok(row)
  assert.deepEqual(row.samples, [])
  assert.equal(row.excluded.get(stem), "implementation time unreadable")
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

  const evidence = await readModelEvidence(f.runtime)
  const alias = evidence.coders.get(
    modelKey({
      assistant: "claude",
      model: "claude-opus-5-5",
      effort: "xhigh",
    }),
  )
  assert.ok(alias)
  assert.deepEqual(
    alias.samples.map((sample) => sample.stem),
    ["alias"],
  )
  assert.equal(alias.excluded.has("alias"), false)
  const otherEffort = evidence.coders.get(
    modelKey({ assistant: "codex", model: "coder-alpha", effort: "high" }),
  )
  assert.ok(otherEffort)
  assert.deepEqual(otherEffort.samples, [])
  assert.equal(
    otherEffort.excluded.get("other-effort"),
    "coder differs from the ready assignment",
  )
})

test("vet rulings restore dropped and downgraded findings for auditor and coder evidence", async (t) => {
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
      [
        {
          ...finding("dropped implementation claim"),
          number: 1,
          reviews: [{ vet: fixtureVetTag, verdict: "drop", answer: "agree" }],
          outcome: "dropped",
        },
        {
          ...finding("downgraded implementation claim"),
          number: 2,
          reviews: [
            {
              vet: fixtureVetTag,

              verdict: "revise",

              revisedTier: "C",

              answer: "agree",
            },
          ],
          finalTier: "C",
        },
        { ...finding("disproved implementation claim"), number: 3 },
        {
          ...finding("C claim raised to B"),
          number: 4,
          tier: "C",
          finalTier: "B",
        },
        {
          ...finding("C claim that ended at D"),
          number: 5,
          tier: "C",
          finalTier: "D",
        },
        {
          ...finding("dropped C claim"),
          number: 6,
          tier: "C",
          reviews: [{ vet: fixtureVetTag, verdict: "drop", answer: "agree" }],
          outcome: "dropped",
        },
        { ...finding("kept D claim"), number: 7, tier: "D" },
        { ...finding("disproved C claim"), number: 8, tier: "C" },
      ],
    ),
    scope: "1-2",
    judgedRepos: ["repo-edu", "plan"],
  })
  writeDisprovedFinding(path, {
    date: "2026-11-01",
    reason: "The C claim was wrong.",
    target: `${stem}-impl-audit-01..02`,
    round: 1,
    finding: 8,
    side: "finding",
  })
  writeDisprovedFinding(path, {
    date: "2026-11-01",
    reason: "The implementation claim was wrong.",
    target: `${stem}-impl-audit-01..02`,
    round: 1,
    finding: 3,
    side: "finding",
  })
  writeDisprovedFinding(path, {
    date: "2026-11-02",
    reason: "The dropped finding was right.",
    target: `${stem}-impl-audit-01..02`,
    round: 1,
    finding: 1,
    side: "vet",
  })
  writeDisprovedFinding(path, {
    date: "2026-11-03",
    reason: "The downgraded finding was right.",
    target: `${stem}-impl-audit-01..02`,
    round: 1,
    finding: 2,
    side: "vet",
  })

  const evidence = await readModelEvidence(f.runtime)
  const row = evidence.coders.get(
    modelKey({ assistant: "codex", model: "coder-alpha", effort: "low" }),
  )
  assert.ok(row)
  assert.deepEqual(row.samples, [
    { stem, steps: 2, kept: { "A/B": 2, C: 1 }, minutes: 30 },
  ])

  const auditor = evidence.auditors.get(JSON.stringify(["audit-alpha", "low"]))
  assert.ok(auditor)
  assert.deepEqual(auditor.samples[0]?.counts, {
    "A/B": { kept: 2, dropped: 0, downgraded: 0, disproved: 1 },
    C: { kept: 1, dropped: 1, downgraded: 1, disproved: 1 },
  })
  assert.deepEqual(
    evidence.disproved
      .filter((entry) => entry.kind === "attached")
      .map((entry) => ({ finding: entry.finding, claim: entry.claim }))
      .sort((first, second) => first.finding - second.finding),
    [
      { finding: 1, claim: "vetter" },
      { finding: 2, claim: "vetter" },
      { finding: 3, claim: "auditor" },
      { finding: 8, claim: "auditor" },
    ],
  )

  const report = await modelsReport(f.runtime, testSettings, { all: true })
  assert.match(
    coderSection(report, "A/B"),
    /\| coder-alpha low \| 1 \| 2 \| 2 \| 1\.00 \| 30\.0 \|/,
  )
  assert.match(
    coderSection(report, "C"),
    /\| coder-alpha low \| 1 \| 2 \| 1 \| 0\.50 \| 30\.0 \|/,
  )
  assert.match(
    implementationAuditors(report, "A/B"),
    /\| audit-alpha low \| 0 \| 0 in 0 \| — \| 0 in 0 \| — \| 1\.0 \| 33% \|/,
  )
  assert.match(
    implementationAuditors(report, "C"),
    /\| audit-alpha low \| 0 \| 0 in 0 \| — \| 0 in 0 \| — \| 1\.0 \| 75% \|/,
  )
  assert.match(
    report,
    /## Implementation rounds by plan, A\/B findings\n\n.*\n.*\n\| commit-span \| audit-alpha low \| 1 \| 2 \| 0 \| 0 \| 1 \| 1\.0 \|/,
  )
  assert.match(
    report,
    /## Implementation rounds by plan, C findings\n\n.*\n.*\n\| commit-span \| audit-alpha low \| 1 \| 1 \| 1 \| 1 \| 1 \| 1\.0 \|/,
  )
  assert.match(report, /The implementation claim was wrong\./)
})

test("one winning revision supplies the grade for auditor and coder counts and the winner for a vetter pair", async (t) => {
  const f = await modelFixture(t)
  const stem = "revised"
  const target = "revised-impl-audit-01..01"
  await commit(
    f.root,
    "revised/impl-1 obl feat(audit-round): fixture step",
    "coder-alpha low\nImplementation took 1 min.",
  )
  const audit = await commit(
    f.root,
    "revised/impl-audit-1 obl clean: fixture audit",
    "coder-alpha low",
  )
  await commit(
    f.planRoot,
    "revised/closed obl: close the fixture plan",
    "coder-alpha low",
  )
  const archive = await archivePlan(f.planRoot, stem, ["repo-edu"])
  const path = join(archive, "revised-impl-rounds.json")
  const { alpha, beta } = panelVets
  writeRoundData(path, {
    ...round(
      target,
      1,
      "2026-11-01T10:00:00.000Z",
      {
        assistant: "claude",
        ...selection("audit-alpha"),
        chosenBy: "settings",
      },
      panelSettings([alpha, beta]),
      [alpha, beta],
      [{ repository: "repo-edu", sha: audit }],
      [
        {
          ...ruledFinding(1, "two revisions", "B", [
            review("atl", "revise", { revisedTier: "C", answer: "contest" }),
            review("obl", "revise"),
          ]),
          finalTier: "D",
        },
      ],
    ),
    scope: "1",
    judgedRepos: ["repo-edu"],
  })
  const entry = {
    target,
    round: 1,
    finding: 1,
    date: "2026-11-03",
    reason: "The named revision was right.",
  }
  for (const [revision, kept, ending] of [
    ["atl", 0, "first"],
    ["obl", 1, "second"],
  ] as const) {
    writeDisprovedFinding(path, { ...entry, revision })
    const evidence = await readModelEvidence(f.runtime)
    const auditor = evidence.auditors.get(
      JSON.stringify(["audit-alpha", "low"]),
    )
    assert.deepEqual(auditor?.samples[0]?.counts, {
      "A/B": { kept, downgraded: 1 - kept, dropped: 0, disproved: 0 },
      C: { kept: 0, downgraded: 0, dropped: 0, disproved: 0 },
    })
    const coder = evidence.coders.get(
      modelKey({ assistant: "codex", model: "coder-alpha", effort: "low" }),
    )
    assert.deepEqual(coder?.samples[0]?.kept, { "A/B": kept, C: 0 })
    assert.equal(evidence.vetPairs.length, 1)
    assert.deepEqual(evidence.vetPairs[0]?.ruling, {
      judge: { kind: "user" },
      ending,
    })
    const row = evidence.disproved[0]
    assert.equal(row?.claim, "auditor")
    assert.deepEqual(
      row?.right.map((party) => party.identity?.model),
      [revision === "atl" ? "vet-alpha" : "vet-beta"],
    )
  }
})

test("an active plan remains excluded without a step count", async (t) => {
  const f = await modelFixture(t)
  const audit = await commit(
    f.root,
    "active/impl-audit-1 obl clean: record the current audit",
    "coder-alpha low",
  )
  writeRoundData(join(f.roundRoot, "active-impl-rounds.json"), {
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

  const evidence = await readModelEvidence(f.runtime)
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
  const roundRoot = f.runtime.roundRoot
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
  writeRoundData(join(roundRoot, "mixed-plan-rounds.json"), {
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
  writeRoundData(join(roundRoot, "mixed-plan-rounds.json"), {
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
  const paged: string[] = []
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
    pager: async (text) => {
      // The reader leaves the view before the read-out is printed.
      assert.equal(visible.length, 0)
      paged.push(text)
    },
    emergency: (text) => errors.push(text),
  } satisfies Parameters<typeof runCommand>[2]
  const code = await runCommand(["models", "--all"], f.runtime, commandOptions)
  assert.equal(code, 0, errors.join("\n"))
  assert.equal(visible.length, 1)
  assert.equal(visible[0].format, "markdown")
  const output = visible[0].text
  assert.deepEqual(paged, [output])
  const winnerHeadings =
    /^## (?:Planning|Implementation) (?:ruling|ruler) winners$/gm
  const expectedWinnerHeadings = [
    "## Planning ruling winners",
    "## Implementation ruling winners",
    "## Planning ruler winners",
    "## Implementation ruler winners",
  ]
  assert.deepEqual(output.match(winnerHeadings), expectedWinnerHeadings)
  assert.match(output, /## Planning auditors/)
  assert.match(output, /## Implementation auditors/)
  assert.match(output, /audit-alpha low/)
  assert.match(output, /audit-claude low/)
  assert.match(output, /audit-third low/)
  const thinImplementation = implementationAuditors(output, "A/B").split(
    "Fewer than 5 shared plans:\n\n",
  )[1]
  assert.match(
    thinImplementation,
    /\| audit-alpha low \| 0 \| 0 in 0 \| — \| 0 in 0 \| — \| 3\.0 \| 0% \|/,
  )
  assert.equal(
    thinImplementation.match(/\| audit-admission low \|/g)?.length,
    1,
  )
  assert.doesNotMatch(output, /more shared plan/)
  assert.match(
    output,
    /\| audit-third low \| 1 \| 1 in 1 \| 1\.00 \| 1 in 1 \| 1\.00 \| 1\.0 \| 0% \|/,
  )
  assert.match(output, /## Coders/)
  assert.match(output, /\| coder-alpha low \| 1 \| 1 \| 1 \| 1\.00 \| 10\.0 \|/)
  assert.match(output, /## Excluded plans/)
  assert.match(output, /## Planning rounds by plan/)
  assert.match(output, /## Implementation rounds by plan/)
  assert.match(output, /mixed: coder-alpha low, coder-beta low/)
  assert.match(output, /effort-mixed: coder-alpha high, coder-alpha low/)
  assert.doesNotMatch(output, /no-assignment:/)
  const coders = coderSection(output, "A/B")
  assert.match(
    coders,
    /coder-alpha low needs 2 more plans before it is compared\./,
  )
  assert.equal(coders.match(/coder-alpha low needs/g)?.length, 1)
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
  assert.doesNotMatch(visible[0].text, winnerHeadings)
  assert.doesNotMatch(visible[0].text, /## Excluded plans/)
  assert.doesNotMatch(visible[0].text, /## Planning rounds by plan/)
  assert.doesNotMatch(visible[0].text, /## Implementation rounds by plan/)
  assert.doesNotMatch(visible[0].text, /mixed:/)
  assert.match(visible[0].text, /## Later rulings\n\nNo later rulings\./)
  assert.ok(visible[0].text.endsWith("\n"))
  assert.ok(!visible[0].text.endsWith("\n\n"))
  visible.length = 0
  assert.equal(
    await runCommand(["models", "--winners"], f.runtime, commandOptions),
    0,
  )
  assert.deepEqual(
    visible[0].text.match(winnerHeadings),
    expectedWinnerHeadings,
  )
  assert.doesNotMatch(
    visible[0].text,
    /^## .*by auditor and judge|^## .*rounds by plan|^## Excluded plans/m,
  )
  visible.length = 0
  assert.equal(
    await runCommand(["models", "--from", "04-10", "--all"], f.runtime, {
      ...commandOptions,
      now: () => new Date(2026, 9, 6).getTime(),
    }),
    0,
  )
  assert.match(
    visible[0].text,
    /\| coder-alpha low \| 1 \| 1 \| 1 \| 1\.00 \| 10\.0 \|/,
  )
  assert.match(
    visible[0].text,
    /effort-mixed: coder-alpha high, coder-alpha low/,
  )
  assert.doesNotMatch(
    visible[0].text,
    /audit-alpha|audit-claude|audit-third|coder-beta/,
  )
})

test("coder spread and worst plan do not block an otherwise clear lead, and each tier range gives its own verdict", async (t) => {
  const f = await modelFixture(t)
  let planIndex = 0
  const addPlan = async (
    stem: string,
    model: string,
    stepCount: number,
    acceptedFindings: number,
    minutesPerStep: number,
    acceptedCFindings = 0,
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
        [
          ...findings(acceptedFindings, `${stem} defect`),
          ...findings(acceptedCFindings, `${stem} narrow defect`).map(
            (narrow, index) => ({
              ...narrow,
              number: acceptedFindings + index + 1,
              tier: "C" as const,
            }),
          ),
        ],
      ),
      scope,
      judgedRepos: ["repo-edu"],
    })
  }

  await addPlan("alpha-low-1", "coder-alpha", 1, 0, 1, 2)
  await addPlan("alpha-low-2", "coder-alpha", 1, 0, 1)
  await addPlan("alpha-variable", "coder-alpha", 2, 1, 4)
  await addPlan("beta-steady-1", "coder-beta", 6, 1, 10)
  await addPlan("beta-steady-2", "coder-beta", 6, 1, 10)
  await addPlan("beta-steady-3", "coder-beta", 6, 1, 10)

  const report = await modelsReport(f.runtime, {
    ...testSettings,
    coders: [
      { assistant: "codex", model: "coder-alpha", effort: "low" },
      { assistant: "codex", model: "coder-beta", effort: "low" },
    ],
  })
  assert.doesNotMatch(report, /spread|worst plan|reliability blocks/)
  const serious = coderSection(report, "A/B")
  assert.match(serious, /\| coder-alpha low \| 3 \| 4 \| 1 \| 0\.17 \| 2\.5 \|/)
  assert.match(serious, /records clearly support running coder-alpha low/)
  const cFindings = coderSection(report, "C")
  assert.match(
    cFindings,
    /\| coder-alpha low \| 3 \| 4 \| 2 \| 0\.67 \| 2\.5 \|/,
  )
  assert.match(cFindings, /The records do not separate one coder clearly\./)
})

test("coder admission needs every archived plan share and a current whole-plan audit", async (t) => {
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

  const evidence = await readModelEvidence(f.runtime)
  const row = evidence.coders.get(modelKey(coder))
  assert.ok(row)
  assert.deepEqual(
    row.samples.map((sample) => ({
      stem: sample.stem,
      kept: sample.kept,
      steps: sample.steps,
    })),
    [{ stem: "plan-only", kept: { "A/B": 1, C: 0 }, steps: 1 }],
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

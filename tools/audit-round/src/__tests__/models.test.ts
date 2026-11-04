import assert from "node:assert/strict"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { type TestContext, test } from "node:test"
import { execa } from "execa"
import {
  clearlyPreferred,
  clearlyPreferredMeasures,
  coderReliabilityDisadvantages,
  speedWords,
  yieldWords,
} from "../model-comparison.js"
import { modelKey, readModelEvidence } from "../model-evidence.js"
import { modelsReport } from "../models.js"
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
  await commitFixture(planRoot)
  return { ...f, planRoot }
}

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

test("the report names an auditor only with a clear lead in both audit classes", async (t) => {
  const f = await modelFixture(t)
  const audit = await commit(
    f.root,
    "evidence/impl-audit-1 obl clean: fixture audit",
    "coder-alpha low",
  )
  const commits = [{ repository: "repo-edu" as const, sha: audit }]
  const addClass = (workClass: "planning" | "implementation") => {
    const path = join(
      f.planRoot,
      `auditor-${workClass === "planning" ? "plan" : "impl"}-rounds.json`,
    )
    for (const [assistant, model, accepted] of [
      ["claude", "audit-strong", true],
      ["codex", "audit-weak", false],
    ] as const)
      for (let index = 1; index <= 5; index += 1)
        writeRoundData(path, {
          ...round(
            `${workClass}-${model}-${index}`,
            1,
            `2026-10-${String(index).padStart(2, "0")}T${assistant === "claude" ? "10" : "11"}:00:00.000Z`,
            {
              assistant,
              ...selection(model),
              chosenBy: "settings",
            },
            settings("audit-strong", "audit-weak"),
            [phase("audit", assistant, model, 60_000)],
            commits,
            accepted ? findings(1, `${workClass} lead`) : [],
          ),
          ...(workClass === "planning"
            ? { phase: "detailing" as const, settling: "" }
            : { scope: "1", judgedRepos: ["repo-edu" as const] }),
        })
  }
  addClass("planning")
  addClass("implementation")

  const report = await modelsReport(
    { repoEduRoot: f.root, planRoot: f.planRoot },
    [],
  )
  assert.match(
    report,
    /current records clearly support running claude audit-strong low/,
  )

  const path = join(f.planRoot, "auditor-impl-rounds.json")
  writeRoundData(path, {
    ...round(
      "implementation-audit-strong-5",
      1,
      "2026-10-05T10:00:00.000Z",
      {
        assistant: "claude",
        ...selection("audit-strong"),
        chosenBy: "settings",
      },
      settings("audit-strong", "audit-weak"),
      [phase("audit", "claude", "audit-strong", 60_000)],
      commits,
      [],
    ),
    scope: "1",
    judgedRepos: ["repo-edu"],
  })
  const overlapping = await modelsReport(
    { repoEduRoot: f.root, planRoot: f.planRoot },
    [],
  )
  assert.doesNotMatch(overlapping, /clearly support running/)
  assert.match(
    overlapping,
    /current records do not separate one auditor clearly across both audit groups/,
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

test("an archived plan with an unreadable step list stays visible but unranked", async (t) => {
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
      `${stem}-impl-01..01`,
      1,
      "2026-10-01T10:00:00.000Z",
      {
        assistant: "codex",
        ...selection("audit-alpha"),
        chosenBy: "settings",
      },
      settings("audit-claude", "audit-alpha"),
      [phase("fix", "codex", "coder-alpha", 60_000)],
      [{ repository: "repo-edu", sha: audit }],
    ),
    scope: "1",
    judgedRepos: ["repo-edu"],
  })

  const evidence = await readModelEvidence({
    repoEduRoot: f.root,
    planRoot: f.planRoot,
  })
  const row = evidence.coders.get(
    modelKey({ assistant: "codex", model: "coder-alpha", effort: "low" }),
  )
  assert.ok(row)
  assert.equal(row.excluded.get(stem), "archived plan unavailable")
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
      `${stem}-impl-01..01`,
      1,
      "2026-10-01T10:00:00.000Z",
      {
        assistant: "codex",
        ...selection("audit-alpha"),
        chosenBy: "settings",
      },
      settings("audit-claude", "audit-alpha"),
      [phase("audit", "codex", "audit-alpha", 60_000)],
      [{ repository: "repo-edu", sha: audit }],
    ),
    scope: "1",
    judgedRepos: ["repo-edu"],
  })

  const evidence = await readModelEvidence({
    repoEduRoot: f.root,
    planRoot: f.planRoot,
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

test("an active plan contributes no fix tokens without a step count", async (t) => {
  const f = await modelFixture(t)
  const audit = await commit(
    f.root,
    "active/impl-audit-1 obl clean: record the current audit",
    "coder-alpha low",
  )
  writeRoundData(join(f.planRoot, "active-impl-rounds.json"), {
    ...round(
      "active-impl-01..01",
      1,
      "2026-10-01T10:00:00.000Z",
      {
        assistant: "codex",
        ...selection("audit-alpha"),
        chosenBy: "settings",
      },
      settings("audit-claude", "audit-alpha"),
      [phase("fix", "codex", "coder-alpha", 60_000)],
      [{ repository: "repo-edu", sha: audit }],
    ),
    scope: "1",
    judgedRepos: ["repo-edu"],
  })

  const evidence = await readModelEvidence({
    repoEduRoot: f.root,
    planRoot: f.planRoot,
  })
  const row = evidence.coders.get(
    modelKey({ assistant: "codex", model: "coder-alpha", effort: "low" }),
  )
  assert.ok(row)
  assert.equal(row.excluded.get("active"), "not closed")
  assert.equal(row.tokenSteps, 0)
  assert.deepEqual([...row.tokens], [])
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

  const mixedArchive = await archivePlan(planRoot, "mixed", ["repo-edu"])
  writeRoundData(join(mixedArchive, "mixed-impl-rounds.json"), {
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
      "no-assignment-impl-01..01",
      1,
      "2026-10-04T10:00:00.000Z",
      {
        assistant: "codex",
        ...selection("audit-admission"),
        chosenBy: "settings",
      },
      settings("audit-claude", "audit-admission"),
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
      "effort-mixed-impl-01..01",
      1,
      "2026-10-05T10:00:00.000Z",
      {
        assistant: "codex",
        ...selection("audit-admission"),
        chosenBy: "settings",
      },
      settings("audit-claude", "audit-admission"),
      [
        phase("audit", "codex", "audit-admission", 60_000),
        phase("fix", "codex", "coder-alpha", 60_000, "high"),
      ],
      [{ repository: "repo-edu", sha: effortMixedAudit }],
    ),
    scope: "1",
    judgedRepos: ["repo-edu"],
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
  const auditorReading = output
    .split("## Auditors\n\n")[1]
    .split("\n\n| Model |")[0]
  assert.match(
    output,
    /codex audit-alpha low.+first 1, yield 1\.0, dropped 0\.0, 3\.0 min/,
  )
  assert.match(
    auditorReading,
    /codex audit-admission low needs 3 more examples/,
  )
  assert.equal(
    auditorReading.match(
      /for planning audits, codex audit-admission low needs/g,
    )?.length,
    1,
  )
  assert.equal(
    auditorReading.match(
      /for implementation audits, codex audit-admission low needs/g,
    )?.length,
    1,
  )
  assert.doesNotMatch(auditorReading, /codex audit-alpha low/)
  assert.doesNotMatch(auditorReading, /codex audit-third low/)
  assert.doesNotMatch(auditorReading, /needs 0 more examples/)
  assert.match(
    output,
    /codex audit-third low.+first none; later 1, yield 1\.0, dropped 0\.0, 1\.0 min; manual 0.+none/,
  )
  assert.match(
    output,
    /Later means a later settings-chosen round on a target that already has a finished round\. Manual means a round whose auditor the command line chose\./,
  )
  assert.match(output, /## Coders/)
  assert.match(
    output,
    /codex coder-alpha low.+mixed: mixed model records.+effort-mixed: mixed model records/,
  )
  assert.doesNotMatch(output, /no-assignment: /)
  assert.match(output, /codex coder-beta low.+mixed: mixed model records/)
  assert.match(
    output,
    /codex coder-alpha high.+effort-mixed: mixed model records/,
  )
  const coderReading = output
    .split("## Coders\n\n")[1]
    .split("\n\n| Model |")[0]
  assert.equal(coderReading.match(/codex coder-alpha low needs/g)?.length, 2)
  assert.equal(coderReading.match(/codex coder-beta low needs/g)?.length, 2)
  assert.doesNotMatch(coderReading, /coder-alpha high/)
  assert.doesNotMatch(coderReading, /needs 0 more examples/)
  assert.doesNotMatch(output, /planning-fixer/)
  assert.match(output, /the current records do not separate one coder clearly/)
  assert.doesNotMatch(output, /codex-vet low/)
  await assert.rejects(readFile(join(f.root, "calls.jsonl")), {
    code: "ENOENT",
  })
})

test("the report names both reliability blocks on an otherwise clear coder lead", async (t) => {
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
        `${stem}-impl-${scope.replace("-", "..")}`,
        1,
        `2026-10-${String(planIndex).padStart(2, "0")}T10:00:00.000Z`,
        {
          assistant: "codex",
          ...selection("audit-alpha"),
          chosenBy: "settings",
        },
        settings("audit-claude", "audit-alpha"),
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
  await addPlan("alpha-variable", "coder-alpha", 2, 1, 1)
  await addPlan("beta-steady-1", "coder-beta", 6, 1, 10)
  await addPlan("beta-steady-2", "coder-beta", 6, 1, 10)
  await addPlan("beta-steady-3", "coder-beta", 6, 1, 10)

  const report = await modelsReport(
    { repoEduRoot: f.root, planRoot: f.planRoot },
    [
      { assistant: "codex", model: "coder-alpha", effort: "low" },
      { assistant: "codex", model: "coder-beta", effort: "low" },
    ],
  )
  assert.match(
    report,
    /codex coder-alpha low has higher spread than codex coder-beta low/,
  )
  assert.match(
    report,
    /codex coder-alpha low has the worse worst plan, alpha-variable at 0\.5 findings per step/,
  )
  assert.match(report, /reliability blocks the otherwise clear coder lead/)
  assert.doesNotMatch(report, /clearly support running codex coder-alpha low/)
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

  const evidence = await readModelEvidence({ repoEduRoot: f.root, planRoot })
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

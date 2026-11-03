import assert from "node:assert/strict"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { type TestContext, test } from "node:test"
import { execa } from "execa"
import {
  clearlyPreferred,
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
  writeRoundData(join(planRoot, "no-assignment-impl-rounds.json"), {
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
  writeRoundData(join(planRoot, "effort-mixed-impl-rounds.json"), {
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
      /For planning audits, codex audit-admission low needs/g,
    )?.length,
    1,
  )
  assert.equal(
    auditorReading.match(
      /For implementation audits, codex audit-admission low needs/g,
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
  assert.match(output, /## Coders/)
  assert.match(
    output,
    /codex coder-alpha low.+mixed: mixed model records.+no-assignment: no ready assignment.+effort-mixed: mixed model records/,
  )
  assert.match(output, /codex coder-beta low.+mixed: mixed model records/)
  assert.match(
    output,
    /codex coder-alpha high.+effort-mixed: mixed model records/,
  )
  const coderReading = output
    .split("## Coders\n\n")[1]
    .split("\n\n| Model |")[0]
  assert.equal(coderReading.match(/codex coder-alpha low needs/g)?.length, 1)
  assert.equal(coderReading.match(/codex coder-beta low needs/g)?.length, 1)
  assert.doesNotMatch(coderReading, /coder-alpha high/)
  assert.doesNotMatch(coderReading, /needs 0 more examples/)
  assert.doesNotMatch(output, /planning-fixer/)
  assert.match(output, /the current records do not separate one coder clearly/)
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
    writeRoundData(join(f.planRoot, `${stem}-impl-rounds.json`), {
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

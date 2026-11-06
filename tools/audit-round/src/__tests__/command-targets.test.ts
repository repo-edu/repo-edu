import assert from "node:assert/strict"
import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { test } from "node:test"
import { execa } from "execa"
import { runCommand } from "./configured-runner.js"
import { commitFixture, roundFixture } from "./round-fixture.js"

/** A close without an abort reason needs the user's ready declaration behind it. */
async function declareReady(planRoot: string) {
  await commitFixture(
    planRoot,
    "example/ready: declare the plan ready for implementation",
  )
}

/** A completed plan whose bare name resolves to its two groups and full range. */
async function completeRangePlan(fixture: {
  readonly activeRoot: string
  readonly repoRoot: string
}) {
  await writeFile(
    join(fixture.activeRoot, "example.md"),
    `# Example plan

## Implementation plan

1. **First step.** Hosted in Repo Edu.
2. **Second step.** Hosted in Repo Edu.
3. **Third step.** Hosted in Repo Edu.

### Execution and audits

Audit ranges: 1-2, 3.
`,
  )
  await commitFixture(
    fixture.repoRoot,
    "example/impl-2 obx feat(audit-round): second step",
  )
  await commitFixture(
    fixture.repoRoot,
    "example/impl-3 obx feat(audit-round): third step",
  )
  await commitFixture(
    fixture.repoRoot,
    "example/implemented obx: complete the Repo Edu share",
  )
}

/** One open plan-bound deferral in Repo Edu history. */
async function deferPlanChoice(repoRoot: string) {
  await commitFixture(
    repoRoot,
    `example/impl-audit-1 obx c1: defer the plan choice

gpt-6.1-sol xhigh

- [C] [plan:../plan/example.md#decisions] [growth-pattern:none] [reach:developer] [complexity:none] Plan choice: The plan needs a decision.`,
  )
  const sha = (await execa("git", ["rev-parse", "HEAD"], { cwd: repoRoot }))
    .stdout
  return {
    deferringRepository: "repo-edu",
    sha,
    position: 1,
    tier: "c",
    destination: "../plan/example.md#decisions",
    title: "Plan choice",
  } as const
}

test("plan prints the newest active plan without claiming a round", async (t) => {
  const f = await roundFixture(t)
  const nextDay = Math.floor(Date.now() / 1000) + 86_400
  await commitFixture(
    f.planRoot,
    "archived/closed ath: newest but archived",
    `@${nextDay + 1} +0000`,
  )
  await commitFixture(
    f.planRoot,
    "example/settle ath: newest active",
    `@${nextDay} +0000`,
  )
  const before = await readdir(f.activeRoot)
  assert.equal(
    await runCommand(["plan"], f.runtime, f.options),
    0,
    f.errors.join("\n"),
  )
  assert.deepEqual(f.visible, [join(f.activeRoot, "example.md")])
  assert.deepEqual(await readdir(f.activeRoot), before)
})

test("deferrals prints only the active plan's open deferrals", async (t) => {
  const f = await roundFixture(t)
  const deferral = await deferPlanChoice(f.repoRoot)

  assert.equal(
    await runCommand(["deferrals", "example"], f.runtime, f.options),
    0,
    f.errors.join("\n"),
  )
  assert.deepEqual(f.visible, [
    `Open deferrals for example:\n- repo-edu@${deferral.sha}/1 [C] -> ../plan/example.md#decisions: Plan choice`,
  ])
  await assert.rejects(readFile(join(f.root, "calls.jsonl")), {
    code: "ENOENT",
  })
})

test("close supplies open deferrals to one close session from the plan checkout", async (t) => {
  const f = await roundFixture(t)
  const deferral = await deferPlanChoice(f.repoRoot)
  await declareReady(f.planRoot)
  const archive = join(f.planRoot, "archive/example")
  await mkdir(archive, { recursive: true })
  const dataFiles = ["example-plan-rounds.json", "example-impl-rounds.json"]
  for (const file of dataFiles)
    await writeFile(
      join(f.activeRoot, file),
      `${JSON.stringify({ rounds: [], disproved: [] }, null, 2)}\n`,
    )
  f.phases.close = {
    ...(f.phases.close as object),
    moves: dataFiles.map((file) => ({
      from: join(f.activeRoot, file),
      to: join(archive, file),
    })),
  }
  await f.configure({ phases: f.phases })
  const before = await readdir(f.activeRoot)
  assert.equal(
    await runCommand(["close", "example-widen.md"], f.runtime, f.options),
    0,
    f.errors.join("\n"),
  )
  const invocations = (await f.calls()).filter(
    (call) =>
      call.args[0] === "exec" ||
      (call.args[0] === "-p" &&
        !call.args.includes("--no-session-persistence")),
  )
  assert.deepEqual(
    invocations.map((call) => [call.assistant, call.cwd]),
    [["codex", f.planRoot]],
  )
  // The close writes only its log, under the plan's stem and its own tag.
  assert.deepEqual(
    (await readdir(f.activeRoot)).filter((name) => !before.includes(name)),
    ["example-close.obh.log"],
  )
  const log = await readFile(
    join(f.activeRoot, "example-close.obh.log"),
    "utf8",
  )
  assert.match(log, /Close of plan example\.md\n/)
  assert.match(log, /\[close\] starting codex \(fresh\)/)
  assert.ok(
    log.includes(
      "Run the close phase, the unattended loop-close of one plan, in this fresh session.",
    ),
  )
  const phaseArguments = /^Phase arguments \(JSON array\): (.+)$/m.exec(
    log,
  )?.[1]
  assert.ok(phaseArguments)
  assert.deepEqual(JSON.parse(phaseArguments), [
    join(f.activeRoot, "example.md"),
    "obh",
    "gpt-5.6-sol high",
    { deferrals: [deferral] },
  ])
  assert.ok(
    log.includes(
      `Workflow: ${join(f.planRoot, ".agents/skills/close/references/workflow.md")}`,
    ),
  )
  assert.doesNotMatch(log, /audit +codex|fix +codex/)
  assert.match(f.visible.join("\n"), /Close finished\./)
  for (const file of dataFiles) {
    assert.equal(
      await readFile(join(archive, file), "utf8"),
      `${JSON.stringify({ rounds: [], disproved: [] }, null, 2)}\n`,
    )
    await assert.rejects(access(join(f.activeRoot, file)), { code: "ENOENT" })
  }
})

test("a finished close that left its plan in the active folder fails with a resume command", async (t) => {
  const f = await roundFixture(t)
  await declareReady(f.planRoot)
  f.phases.close = { ...(f.phases.close as object), remove: [] }
  await f.configure({ phases: f.phases })
  assert.equal(await runCommand(["close"], f.runtime, f.options), 1)
  const log = await readFile(
    join(f.activeRoot, "example-close.obh.log"),
    "utf8",
  )
  assert.match(
    log,
    /\[close\] failed: The finished close left .+example\.md in the active folder/,
  )
  assert.match(log, /Resume: .*codex .*resume .*close-session/)
})

test("close without a stem takes the plan that plan prints and passes an abort reason", async (t) => {
  const f = await roundFixture(t)
  assert.equal(
    await runCommand(
      ["close", "--aborted", "The check cost more than it gave."],
      f.runtime,
      f.options,
    ),
    0,
    f.errors.join("\n"),
  )
  const log = await readFile(
    join(f.activeRoot, "example-close.obh.log"),
    "utf8",
  )
  assert.ok(
    log.includes(
      `Phase arguments (JSON array): ${JSON.stringify([join(f.activeRoot, "example.md"), "obh", "gpt-5.6-sol high", { deferrals: [] }, "The check cost more than it gave."])}`,
    ),
  )
})

test("close without an abort reason refuses a plan that never reached ready", async (t) => {
  const f = await roundFixture(t)
  const before = await readdir(f.activeRoot)
  for (const args of [["close"], ["close", "example"]]) {
    f.errors.length = 0
    assert.equal(await runCommand(args, f.runtime, f.options), 1)
    assert.match(
      f.errors.join("\n"),
      /example\.md has no ready marker\. Run pnpm audit-round ready first, or close it with --aborted <reason>\./,
    )
  }
  assert.deepEqual(await readdir(f.activeRoot), before)
  await assert.rejects(readFile(join(f.root, "calls.jsonl")), {
    code: "ENOENT",
  })
})

test("close refuses paths and plans without an active artifact before any assistant starts", async (t) => {
  const f = await roundFixture(t)
  await mkdir(join(f.planRoot, "archive/old"), { recursive: true })
  await writeFile(join(f.planRoot, "archive/old/plan.md"), "# Old plan\n")
  assert.equal(
    await runCommand(["close", "../example"], f.runtime, f.options),
    2,
  )
  for (const stem of ["old", "missing"]) {
    f.errors.length = 0
    assert.equal(await runCommand(["close", stem], f.runtime, f.options), 1)
    assert.match(
      f.errors.join("\n"),
      new RegExp(`No active plan named ${stem} .+ already closed`),
    )
  }
  await assert.rejects(readFile(join(f.root, "calls.jsonl")), {
    code: "ENOENT",
  })
})

test("a plan named without its extension runs as its .md file", async (t) => {
  const f = await roundFixture(t)
  assert.equal(
    await runCommand(
      ["round", "example", "2-3", "--auditor", "o"],
      f.runtime,
      f.options,
    ),
    0,
    f.errors.join("\n"),
  )
  const { log } = await f.records()
  assert.ok(
    log.includes(
      `Phase arguments (JSON array): ${JSON.stringify([f.report, join(f.activeRoot, "example.md"), "2-3", { deferrals: [] }])}`,
    ),
  )
})

test("a completed bare range series is refused beside --auditor", async (t) => {
  const f = await roundFixture(t)
  await completeRangePlan(f)

  assert.equal(
    await runCommand(
      ["round", "example", "--auditor", "codex"],
      f.runtime,
      f.options,
    ),
    2,
  )
  assert.match(f.errors.join("\n"), /Use --auditor with one scope/)
  assert.deepEqual(await f.roundFiles(), [])
})

test("a hand-run claim refuses a completed bare range series", async (t) => {
  const f = await roundFixture(t)
  await completeRangePlan(f)

  assert.equal(
    await runCommand(
      ["name", "example", "--auditor", "oth"],
      f.runtime,
      f.options,
    ),
    2,
  )
  assert.match(f.errors.join("\n"), /claims one scope/)
  assert.deepEqual(await f.roundFiles(), [])
})

test("options without a target run the audit the newest plan's history calls for", async (t) => {
  // The fixture's Repo Edu history has landed step 1 without its marker.
  const f = await roundFixture(t)
  const nextDay = Math.floor(Date.now() / 1000) + 86_400
  const commit = (cwd: string, subject: string, offset: number) =>
    commitFixture(cwd, subject, `@${nextDay + offset} +0000`)
  const name = async () => {
    f.visible.length = 0
    f.errors.length = 0
    return runCommand(["name", "--auditor", "oth"], f.runtime, f.options)
  }
  assert.equal(await name(), 2)
  assert.match(f.errors[0], /implemented marker is missing in Repo Edu/)
  await commit(f.repoRoot, "example/impl-audit-2-3 ath clean: record", 0)
  assert.equal(await name(), 2)
  assert.match(f.errors[0], /implemented marker is missing in Repo Edu/)
  await commit(
    f.repoRoot,
    "example/impl-audit-2-3 ath growth-none c1 fix(x): correction",
    1,
  )
  assert.equal(await name(), 2)
  assert.match(f.errors[0], /implemented marker is missing in Repo Edu/)
  // Audit records and a later plan round do not choose the target. The listed
  // steps and the current marker do.
  await commit(f.repoRoot, "example/implemented ath: marker", 2)
  await commit(f.planRoot, "example/plan-audit ath clean: plan round", 3)
  assert.equal(await name(), 0, f.errors.join("\n"))
  assert.deepEqual(JSON.parse(f.visible[0]).arguments, [
    join(f.activeRoot, "example-impl-01..01-01-2-audit.oth.md"),
    join(f.activeRoot, "example.md"),
    "1",
  ])
})

test("a missing plan file is refused before any assistant starts", async (t) => {
  const f = await roundFixture(t)
  for (const name of ["missing", "missing.md"]) {
    assert.equal(
      await runCommand(["round", name, "3"], f.runtime, f.options),
      1,
    )
    assert.match(f.errors.at(-1) as string, /No active plan named missing/)
  }
  await assert.rejects(readFile(join(f.root, "calls.jsonl")), {
    code: "ENOENT",
  })
})

test("an archived plan is refused before any assistant starts", async (t) => {
  const f = await roundFixture(t)
  const archive = join(f.planRoot, "archive/old")
  await mkdir(archive, { recursive: true })
  await writeFile(join(archive, "plan.md"), "# Old plan\n")
  assert.equal(await runCommand(["round", "old", "1"], f.runtime, f.options), 1)
  assert.match(
    f.errors.at(-1) as string,
    /Archived plans are not audit targets/,
  )
  await assert.rejects(readFile(join(f.root, "calls.jsonl")), {
    code: "ENOENT",
  })
})

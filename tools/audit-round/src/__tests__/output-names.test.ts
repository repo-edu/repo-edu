import assert from "node:assert/strict"
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { basename, join } from "node:path"
import { test } from "node:test"
import { execa } from "execa"
import { briefRun, RoundOutput, roundRun } from "./configured-runner.js"
import { fixture, selections, testContext } from "./helpers.js"

const options = { terminal: { write() {}, status() {}, clear() {} } }

test("different auditors cannot open the same candidate and the next run advances", async (t) => {
  const f = await fixture(t)
  const setup = { ...testContext(f.root), plan: "example.md", scope: "2-4" }
  const codex = await roundRun({ ...setup, auditor: "codex" }, 0, selections)
  const claude = await roundRun({ ...setup, auditor: "claude" }, 0, selections)
  assert.equal(codex.nameStart, "example-steps-2-4-01")
  assert.equal(claude.nameStart, codex.nameStart)
  new RoundOutput(codex, options).close()
  assert.throws(() => new RoundOutput(claude, options), { code: "EEXIST" })
  assert.equal(await readFile(codex.paths.claim as string, "utf8"), "")
  await assert.rejects(readFile(claude.paths.log), { code: "ENOENT" })
  await assert.rejects(readFile(claude.paths.markdown), { code: "ENOENT" })
  const next = await roundRun({ ...setup, auditor: "claude" }, 0, selections)
  assert.equal(next.nameStart, "example-steps-2-4-02")
  assert.equal(
    basename(next.paths.markdown),
    "example-steps-2-4-02-abx-round.md",
  )
  assert.equal(basename(next.watch), "example-steps-2-4-02-oth-watch.md")
  new RoundOutput(next, options).close()
})

test("every retained round kind at either root reserves its number across auditors", async (t) => {
  const f = await fixture(t)
  const setup = { ...testContext(f.root), plan: "example.md" }
  for (const root of [f.root, join(f.root, "../plan")]) {
    for (const suffix of [
      "claim.md",
      "abx-round.md",
      "otm-round.log",
      "abx-audit.md",
      "otm-vet.md",
      "abx-rebut.md",
      "oul-brief.md",
      "oul-brief.log",
      "abx-ruling.md",
      "abx-watch.md",
    ]) {
      const path = join(root, `example-all-09-${suffix}`)
      await writeFile(path, "")
      const run = await roundRun(setup, 0, selections)
      assert.equal(run.nameStart, "example-all-10", path)
      await rm(path)
    }
  }
  await writeFile(join(f.root, "ROUND-example-all-codex-old.md"), "")
  await writeFile(join(f.root, "example-all-99-otm-unknown.md"), "")
  await writeFile(join(f.root, "example-all-other-99-otm-audit.md"), "")
  await mkdir(join(f.root, "example-all-99-otm-round.md"))
  assert.equal(
    (await roundRun(setup, 0, selections)).nameStart,
    "example-all-01",
  )
})

test("a plan-root report survives partial cleanup and full cleanup restarts numbering", async (t) => {
  const f = await fixture(t)
  const setup = { ...testContext(f.root), plan: "example.md" }
  const run = await roundRun(setup, 0, selections)
  new RoundOutput(run, options).close()
  const report = join(f.root, "../plan", `${run.nameStart}-oth-audit.md`)
  await writeFile(report, "Report")
  for (const path of [run.paths.claim, run.paths.log, run.paths.markdown])
    await rm(path as string)
  assert.equal(
    (await roundRun(setup, 0, selections)).nameStart,
    "example-all-02",
  )
  await rm(report)
  assert.equal(
    (await roundRun(setup, 0, selections)).nameStart,
    "example-all-01",
  )
})

test("a failed tagged-file open retains the number's claim", async (t) => {
  const f = await fixture(t)
  const setup = { ...testContext(f.root), plan: "example.md" }
  const run = await roundRun(setup, 0, selections)
  await mkdir(run.paths.log)
  assert.throws(() => new RoundOutput(run, options))
  assert.equal(await readFile(run.paths.claim as string, "utf8"), "")
  assert.equal(
    (await roundRun(setup, 0, selections)).nameStart,
    "example-all-02",
  )
})

test("commit filenames resolve HEAD once while keeping typed offsets and list counts", async (t) => {
  const f = await fixture(t)
  await execa("git", ["init", "--quiet"], { ...testContext(f.root) })
  await execa(
    "git",
    [
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.test",
      "-c",
      "core.hooksPath=/dev/null",
      "commit",
      "--allow-empty",
      "-m",
      "Fixture",
    ],
    { ...testContext(f.root) },
  )
  const { stdout: head } = await execa(
    "git",
    ["rev-parse", "--short", "HEAD"],
    { ...testContext(f.root) },
  )
  for (const [commits, target] of [
    [["HEAD"], head],
    [["HEAD-4"], `${head}-4`],
    [["HEAD-4..HEAD"], `${head}-4..${head}`],
    [["HEAD-4", "HEAD-1", "HEAD"], `${head}-4-plus-2`],
    [["abcd1234"], "abcd1234"],
  ] as const) {
    const run = await roundRun(
      { ...testContext(f.root), commits },
      0,
      selections,
    )
    assert.equal(basename(run.paths.markdown), `${target}-01-oth-round.md`)
    assert.equal(run.title, `Audit round of commits ${commits.join(" ")}`)
  }
})

test("archived plans use their folder and scopes keep separate numbering", async (t) => {
  const f = await fixture(t)
  for (const [scope, target] of [
    [undefined, "all"],
    ["3", "step-3"],
    ["2-4", "steps-2-4"],
  ] as const) {
    const run = await roundRun(
      {
        ...testContext(f.root),
        plan: "../plan/archive/example/plan.md",
        scope,
      },
      0,
      selections,
    )
    assert.equal(run.nameStart, `example-${target}-01`)
    new RoundOutput(run, options).close()
  }
})

test("a standalone brief reuses the number and overwrites only its pinned writer's log", async (t) => {
  const f = await fixture(t)
  const transcript = join(f.root, "example-all-09-abx-round.md")
  await writeFile(transcript, "Original transcript")
  const run = briefRun(transcript, 0, selections)
  assert.equal(basename(run.paths.log), "example-all-09-oul-brief.log")
  const first = new RoundOutput(run, options)
  await first.message("First brief")
  first.close()
  new RoundOutput(briefRun(transcript, 1000, selections), options).close()
  assert.doesNotMatch(await readFile(run.paths.log, "utf8"), /First brief/)
  assert.equal(await readFile(transcript, "utf8"), "Original transcript")
  assert.deepEqual(
    (await readdir(f.root)).filter((name) => name.endsWith("-claim.md")),
    [],
  )
})

test("unspellable phase efforts fail before any claim or output is created", async (t) => {
  const f = await fixture(t)
  const before = await readdir(f.root)
  for (const effort of [null, "max"]) {
    for (const assistant of ["codex", "claude"] as const) {
      const chosen = {
        ...selections,
        [assistant]: { ...selections[assistant], effort },
      }
      await assert.rejects(
        roundRun({ ...testContext(f.root), plan: "example.md" }, 0, chosen),
        assistant === "codex"
          ? /codex audit.*full --auditor tag/
          : /claude vet.*CLI settings/,
      )
    }
  }
  // An auditor override cannot supply the effort for the same assistant's fix phase.
  await assert.rejects(
    roundRun(
      {
        ...testContext(f.root),
        plan: "example.md",
        override: { strength: "top", effort: "high" },
      },
      0,
      { ...selections, codex: { model: "gpt-6-astra", effort: null } },
    ),
    /codex fix.*CLI settings/,
  )
  // Claude's ruling follows its settings even when its audit has an override.
  await assert.rejects(
    roundRun(
      {
        ...testContext(f.root),
        plan: "example.md",
        auditor: "claude",
        override: { strength: "top", effort: "high" },
      },
      0,
      { ...selections, claude: { model: "claude-fable-5", effort: null } },
    ),
    /claude rule.*CLI settings/,
  )
  assert.deepEqual(await readdir(f.root), before)
})

test("planning rounds share the bare target number across roots and write at the plan root", async (t) => {
  const f = await fixture(t)
  const context = testContext(f.root, "planning")
  await writeFile(join(f.root, "example-04-oth-audit.md"), "")
  await writeFile(join(context.planRoot, "example-05-claim.md"), "")
  const run = await roundRun(
    { ...context, plan: "example-widen.md" },
    0,
    selections,
  )
  assert.equal(run.nameStart, "example-06")
  assert.equal(run.paths.claim, join(context.planRoot, "example-06-claim.md"))
  assert.equal(
    run.paths.markdown,
    join(context.planRoot, "example-06-oth-round.md"),
  )
  assert.equal(run.watch, join(context.planRoot, "example-06-oth-watch.md"))
  const archived = await roundRun(
    { ...context, plan: "archive/topic/plan.md" },
    0,
    selections,
  )
  assert.equal(archived.nameStart, "topic-01")
})

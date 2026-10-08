import assert from "node:assert/strict"
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { basename, join } from "node:path"
import { test } from "node:test"
import { execa } from "execa"
import {
  briefRun,
  RoundOutput,
  roundRun,
  transcriptNameStart,
} from "./configured-runner.js"
import { fixture, selections, testContext } from "./helpers.js"

const options = { terminal: { write() {}, status() {}, clear() {} } }

test("phase files sort in fixed order with paired logs and dotted commit-range targets", async (t) => {
  const f = await fixture(t)
  const run = await roundRun(
    { ...testContext(f.root), commits: ["abcdef..123abc"], brief: true },
    0,
    selections,
  )
  const names = [
    run.paths.claim,
    run.paths.markdown,
    ...Object.values(run.documents),
    run.watch,
  ].map((file) => {
    assert.ok(file)
    return basename(file)
  })
  assert.deepEqual(names.toSorted(), [
    "abcdef..123abc-01-0-claim.md",
    "abcdef..123abc-01-1-round.oth.md",
    "abcdef..123abc-01-2-audit.oth.md",
    "abcdef..123abc-01-3-vet.abx.md",
    "abcdef..123abc-01-4-rebut.oth.md",
    "abcdef..123abc-01-6-brief.oul.md",
    "abcdef..123abc-01-7-ruling.oth.md",
    "abcdef..123abc-01-9-watch.oth.md",
  ])
  assert.equal(run.data, undefined)
  assert.equal(run.paths.log, run.paths.markdown.replace(/\.md$/, ".log"))
  assert.equal(transcriptNameStart(run.paths.markdown), "abcdef..123abc-01")
  const brief = briefRun(run.paths.markdown, 0, selections)
  assert.equal(brief.paths.log, brief.brief.replace(/\.md$/, ".log"))
  assert.equal(
    basename(run.paths.claim as string),
    "abcdef..123abc-01-0-claim.md",
  )
  await writeFile(run.documents.report, "Retained report")
  assert.equal(
    (
      await roundRun(
        { ...testContext(f.root), commits: ["abcdef..123abc"] },
        0,
        selections,
      )
    ).nameStart,
    "abcdef..123abc-02",
  )
})

test("different auditors cannot open the same candidate and the next run advances", async (t) => {
  const f = await fixture(t)
  const setup = { ...testContext(f.root), plan: "example.md", scope: "2-4" }
  const codex = await roundRun({ ...setup, auditor: "codex" }, 0, selections)
  const claude = await roundRun({ ...setup, auditor: "claude" }, 0, selections)
  assert.equal(codex.nameStart, "example-impl-02..04-01")
  assert.equal(claude.nameStart, codex.nameStart)
  new RoundOutput(codex, options).close()
  assert.throws(() => new RoundOutput(claude, options), { code: "EEXIST" })
  assert.equal(await readFile(codex.paths.claim as string, "utf8"), "")
  await assert.rejects(readFile(claude.paths.log), { code: "ENOENT" })
  await assert.rejects(readFile(claude.paths.markdown), { code: "ENOENT" })
  const next = await roundRun({ ...setup, auditor: "claude" }, 0, selections)
  assert.equal(next.nameStart, "example-impl-02..04-02")
  assert.equal(
    basename(next.paths.markdown),
    "example-impl-02..04-02-1-round.abx.md",
  )
  assert.equal(basename(next.watch), "example-impl-02..04-02-9-watch.oth.md")
  new RoundOutput(next, options).close()
})

test("only retained round files at the plan root reserve numbers across auditors", async (t) => {
  const f = await fixture(t)
  const setup = { ...testContext(f.root), plan: "example.md", scope: "all" }
  for (const root of [f.root, join(f.root, "../plan")]) {
    for (const suffix of [
      "0-claim.md",
      "0-settle.md",
      "0-reopen.md",
      "1-round.abx.md",
      "1-round.abx.json",
      "1-round.otm.log",
      "2-audit.abx.md",
      "3-vet.otm.md",
      "4-rebut.abx.md",
      "6-brief.oul.md",
      "6-brief.oul.log",
      "7-ruling.oth.md",
      "9-watch.abx.md",
    ]) {
      const path = join(root, `example-impl-all-09-${suffix}`)
      await writeFile(path, "")
      const run = await roundRun(setup, 0, selections)
      assert.equal(
        run.nameStart,
        root === setup.planRoot ? "example-impl-all-10" : "example-impl-all-01",
        path,
      )
      await rm(path)
    }
  }
  await writeFile(join(f.root, "ROUND-example-impl-all-codex-old.md"), "")
  await writeFile(join(f.root, "example-impl-all-99-otm-unknown.md"), "")
  await writeFile(join(f.root, "example-impl-all-other-99-2-audit.otm.md"), "")
  await mkdir(join(f.root, "example-impl-all-99-1-round.otm.md"))
  assert.equal(
    (await roundRun(setup, 0, selections)).nameStart,
    "example-impl-all-01",
  )
})

test("a plan-root report survives partial cleanup and full cleanup restarts numbering", async (t) => {
  const f = await fixture(t)
  const setup = { ...testContext(f.root), plan: "example.md", scope: "all" }
  const run = await roundRun(setup, 0, selections)
  new RoundOutput(run, options).close()
  const report = join(f.root, "../plan", `${run.nameStart}-2-audit.oth.md`)
  await writeFile(report, "Report")
  for (const path of [run.paths.claim, run.paths.log, run.paths.markdown])
    await rm(path as string)
  assert.equal(
    (await roundRun(setup, 0, selections)).nameStart,
    "example-impl-all-02",
  )
  await rm(report)
  assert.equal(
    (await roundRun(setup, 0, selections)).nameStart,
    "example-impl-all-01",
  )
})

test("a failed tagged-file open retains the number's claim", async (t) => {
  const f = await fixture(t)
  const setup = { ...testContext(f.root), plan: "example.md", scope: "all" }
  const run = await roundRun(setup, 0, selections)
  await mkdir(run.paths.log)
  assert.throws(() => new RoundOutput(run, options))
  assert.equal(await readFile(run.paths.claim as string, "utf8"), "")
  assert.equal(
    (await roundRun(setup, 0, selections)).nameStart,
    "example-impl-all-02",
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
    assert.equal(basename(run.paths.markdown), `${target}-01-1-round.oth.md`)
    assert.equal(run.title, `Commit audit of ${commits.join(" ")}`)
  }
})

test("archived plans use their folder and scopes keep separate numbering", async (t) => {
  const f = await fixture(t)
  for (const [scope, target] of [
    ["all", "impl-all"],
    ["3", "impl-03..03"],
    ["2-4", "impl-02..04"],
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
  const transcript = join(f.root, "example-impl-all-09-1-round.abx.md")
  await writeFile(transcript, "Original transcript")
  const run = briefRun(transcript, 0, selections)
  assert.equal(basename(run.paths.log), "example-impl-all-09-6-brief.oul.log")
  const first = new RoundOutput(run, options)
  await first.message("First brief")
  first.close()
  new RoundOutput(briefRun(transcript, 1000, selections), options).close()
  assert.doesNotMatch(await readFile(run.paths.log, "utf8"), /First brief/)
  assert.equal(await readFile(transcript, "utf8"), "Original transcript")
  assert.deepEqual(
    (await readdir(f.root)).filter((name) => name.endsWith("-0-claim.md")),
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
        [assistant]: {
          ...selections[assistant],
          configured: { ...selections[assistant].configured, effort },
        },
      }
      await assert.rejects(
        roundRun(
          { ...testContext(f.root), plan: "example.md", scope: "all" },
          0,
          chosen,
        ),
        assistant === "codex"
          ? /codex audit.*full --auditor or --first tag/
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
        scope: "all",
        override: { option: "--auditor", strength: "top", effort: "high" },
      },
      0,
      {
        ...selections,
        codex: {
          ...selections.codex,
          configured: { model: "gpt-6-astra", effort: null },
        },
      },
    ),
    /codex fix.*CLI settings/,
  )
  assert.deepEqual(await readdir(f.root), before)
})

test("planning rounds number their bare target at the plan root and write there", async (t) => {
  const f = await fixture(t)
  const context = testContext(f.root, "planning")
  await writeFile(join(context.planRoot, "example-plan-05-0-claim.md"), "")
  const run = await roundRun(
    { ...context, plan: "example-widen.md" },
    0,
    selections,
  )
  assert.ok(run.data)
  assert.equal(run.nameStart, "example-plan-06")
  assert.equal(
    run.paths.claim,
    join(context.planRoot, "example-plan-06-0-claim.md"),
  )
  assert.equal(
    run.paths.markdown,
    join(context.planRoot, "example-plan-06-1-round.oth.md"),
  )
  assert.equal(
    run.data.path,
    join(context.planRoot, "example-plan-06-1-round.oth.json"),
  )
  assert.equal(
    run.watch,
    join(context.planRoot, "example-plan-06-9-watch.oth.md"),
  )
  const archived = await roundRun(
    { ...context, plan: "archive/topic/plan.md" },
    0,
    selections,
  )
  assert.equal(archived.nameStart, "topic-plan-01")
})

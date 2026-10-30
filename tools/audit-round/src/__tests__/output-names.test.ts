import assert from "node:assert/strict"
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { basename, join } from "node:path"
import { test } from "node:test"
import { roundRun as buildRoundRun } from "../output.js"
import { planRepositoryPrefix } from "../target.js"
import {
  briefRun,
  RoundOutput,
  roundRun,
  testSettings,
  transcriptNameStart,
} from "./configured-runner.js"
import { fixture, releases, testContext, testSetup } from "./helpers.js"
import { commitFixture } from "./round-fixture.js"

const options = { terminal: { write() {}, status() {}, clear() {} } }

test("phase files sort in fixed order with paired logs and dotted commit-range targets", async (t) => {
  const f = await fixture(t)
  const run = await roundRun(
    {
      ...testSetup(f.root),
      commits: ["abcdef..123abc"],
      repository: "repo-edu",
      brief: true,
    },
    0,
    releases,
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
    "abcdef..123abc-01-1-round.obh.md",
    "abcdef..123abc-01-2-audit.obh.md",
    "abcdef..123abc-01-3-vet.abh.md",
    "abcdef..123abc-01-4-rebut.obh.md",
    "abcdef..123abc-01-6-brief.oul.md",
    "abcdef..123abc-01-7-ruling.obh.md",
    "abcdef..123abc-01-9-watch.obh.md",
  ])
  assert.equal(run.data, undefined)
  assert.equal(run.paths.log, run.paths.markdown.replace(/\.md$/, ".log"))
  assert.equal(transcriptNameStart(run.paths.markdown), "abcdef..123abc-01")
  const brief = briefRun(run.paths.markdown, 0, releases)
  assert.equal(brief.paths.log, brief.brief.replace(/\.md$/, ".log"))
  assert.equal(
    basename(run.paths.claim as string),
    "abcdef..123abc-01-0-claim.md",
  )
  await writeFile(run.documents.report, "Retained report")
  assert.equal(
    (
      await roundRun(
        {
          ...testSetup(f.root),
          commits: ["abcdef..123abc"],
          repository: "repo-edu",
        },
        0,
        releases,
      )
    ).nameStart,
    "abcdef..123abc-02",
  )
})

test("different auditors cannot open the same candidate and the next run advances", async (t) => {
  const f = await fixture(t)
  const setup = {
    ...testContext(f.root),
    plan: "example.md",
    scope: "2-4",
    auditorSelectionSource: "settings" as const,
  }
  const codex = await roundRun({ ...setup, auditor: "codex" }, 0, releases)
  const claude = await roundRun({ ...setup, auditor: "claude" }, 0, releases)
  assert.equal(codex.nameStart, "example-impl-02..04-01")
  assert.equal(claude.nameStart, codex.nameStart)
  new RoundOutput(codex, options).close()
  assert.throws(() => new RoundOutput(claude, options), { code: "EEXIST" })
  assert.equal(await readFile(codex.paths.claim as string, "utf8"), "")
  await assert.rejects(readFile(claude.paths.log), { code: "ENOENT" })
  await assert.rejects(readFile(claude.paths.markdown), { code: "ENOENT" })
  const next = await roundRun({ ...setup, auditor: "claude" }, 0, releases)
  assert.equal(next.nameStart, "example-impl-02..04-02")
  assert.equal(
    basename(next.paths.markdown),
    "example-impl-02..04-02-1-round.abh.md",
  )
  assert.equal(basename(next.watch), "example-impl-02..04-02-9-watch.obh.md")
  new RoundOutput(next, options).close()
})

test("only retained numbered files at the plan root reserve numbers across auditors", async (t) => {
  const f = await fixture(t)
  const setup = { ...testSetup(f.root), plan: "example.md", scope: "1" }
  for (const root of [f.root, join(f.root, "../plan")]) {
    for (const suffix of [
      "0-claim.md",
      "0-settle.md",
      "0-reopen.md",
      "1-round.abh.md",
      "1-round.abh.json",
      "1-round.otm.log",
      "2-audit.abh.md",
      "3-vet.otm.md",
      "4-rebut.abh.md",
      "6-brief.oul.md",
      "6-brief.oul.log",
      "7-ruling.obh.md",
      "9-watch.abh.md",
    ]) {
      const path = join(root, `example-impl-01..01-09-${suffix}`)
      await writeFile(path, "")
      const run = await roundRun(setup, 0, releases)
      assert.equal(
        run.nameStart,
        root === setup.planRoot && suffix !== "1-round.abh.json"
          ? "example-impl-01..01-10"
          : "example-impl-01..01-01",
        path,
      )
      await rm(path)
    }
  }
  await writeFile(join(f.root, "ROUND-example-impl-01..01-codex-old.md"), "")
  await writeFile(join(f.root, "example-impl-01..01-99-otm-unknown.md"), "")
  await writeFile(
    join(f.root, "example-impl-01..01-other-99-2-audit.otm.md"),
    "",
  )
  await mkdir(join(f.root, "example-impl-01..01-99-1-round.otm.md"))
  assert.equal(
    (await roundRun(setup, 0, releases)).nameStart,
    "example-impl-01..01-01",
  )
})

test("a plan-root report survives partial cleanup and full cleanup restarts numbering", async (t) => {
  const f = await fixture(t)
  const setup = { ...testSetup(f.root), plan: "example.md", scope: "1" }
  const run = await roundRun(setup, 0, releases)
  new RoundOutput(run, options).close()
  const report = join(f.root, "../plan", `${run.nameStart}-2-audit.obh.md`)
  await writeFile(report, "Report")
  for (const path of [run.paths.claim, run.paths.log, run.paths.markdown])
    await rm(path as string)
  assert.equal(
    (await roundRun(setup, 0, releases)).nameStart,
    "example-impl-01..01-02",
  )
  await rm(report)
  assert.equal(
    (await roundRun(setup, 0, releases)).nameStart,
    "example-impl-01..01-01",
  )
})

test("a failed tagged-file open retains the number's claim", async (t) => {
  const f = await fixture(t)
  const setup = { ...testSetup(f.root), plan: "example.md", scope: "1" }
  const run = await roundRun(setup, 0, releases)
  await mkdir(run.paths.log)
  assert.throws(() => new RoundOutput(run, options))
  assert.equal(await readFile(run.paths.claim as string, "utf8"), "")
  assert.equal(
    (await roundRun(setup, 0, releases)).nameStart,
    "example-impl-01..01-02",
  )
})

test("commit filenames resolve HEAD once while keeping typed offsets and list counts", async (t) => {
  const f = await fixture(t)
  const head = await commitFixture(f.root, "Fixture")
  const planHead = await commitFixture(join(f.root, "../plan"), "Plan fixture")
  for (const [repository, commits, target] of [
    ["repo-edu", ["HEAD"], head],
    ["repo-edu", ["HEAD-4"], `${head}-4`],
    ["repo-edu", ["HEAD-4..HEAD"], `${head}-4..${head}`],
    ["repo-edu", ["HEAD-4", "HEAD-1", "HEAD"], `${head}-4-plus-2`],
    ["repo-edu", ["abcd1234"], "abcd1234"],
    [
      "plan",
      [`${planRepositoryPrefix}HEAD-4..HEAD`],
      `${planHead}-4..${planHead}`,
    ],
  ] as const) {
    const run = await roundRun(
      { ...testSetup(f.root), commits, repository },
      0,
      releases,
    )
    assert.equal(basename(run.paths.markdown), `${target}-01-1-round.obh.md`)
    assert.equal(run.title, `Commit audit of ${commits.join(" ")}`)
  }
})

test("single steps and ranges keep separate padded numbering", async (t) => {
  const f = await fixture(t)
  for (const [scope, target] of [
    ["1", "impl-01..01"],
    ["3", "impl-03..03"],
    ["2-4", "impl-02..04"],
  ] as const) {
    const run = await roundRun(
      {
        ...testSetup(f.root),
        plan: "example.md",
        scope,
      },
      0,
      releases,
    )
    assert.equal(run.nameStart, `example-${target}-01`)
    assert.ok(run.data)
    new RoundOutput(run, options).close()
  }
})

test("a standalone brief reuses the number and overwrites only its pinned writer's log", async (t) => {
  const f = await fixture(t)
  const transcript = join(f.root, "example-impl-01..01-09-1-round.abh.md")
  await writeFile(transcript, "Original transcript")
  const run = briefRun(transcript, 0, releases)
  assert.equal(
    basename(run.paths.log),
    "example-impl-01..01-09-6-brief.oul.log",
  )
  const first = new RoundOutput(run, options)
  await first.message("First brief")
  first.close()
  new RoundOutput(briefRun(transcript, 1000, releases), options).close()
  assert.doesNotMatch(await readFile(run.paths.log, "utf8"), /First brief/)
  assert.equal(await readFile(transcript, "utf8"), "Original transcript")
  assert.deepEqual(
    (await readdir(f.root)).filter((name) => name.endsWith("-0-claim.md")),
    [],
  )
})

test("an automatic judge needs no capability tag because it writes no file", async (t) => {
  const f = await fixture(t)
  const run = await buildRoundRun(
    {
      ...testSetup(f.root),
      plan: "example.md",
      scope: "1",
      automatic: true,
    },
    0,
    releases,
    {
      ...testSettings,
      phases: {
        ...testSettings.phases,
        judge: { assistant: "claude", model: "default", effort: "default" },
      },
    },
  )

  assert.equal(run.phases.at(-1)?.phase, "judge")
})

test("planning rounds number their bare target at the plan root and write there", async (t) => {
  const f = await fixture(t)
  const context = testSetup(f.root, "planning")
  await writeFile(join(context.planRoot, "example-plan-05-0-claim.md"), "")
  const run = await roundRun(
    { ...context, plan: "example-widen.md" },
    0,
    releases,
  )
  assert.ok(run.data)
  assert.equal(run.nameStart, "example-plan-06")
  assert.equal(
    run.paths.claim,
    join(context.planRoot, "example-plan-06-0-claim.md"),
  )
  assert.equal(
    run.paths.markdown,
    join(context.planRoot, "example-plan-06-1-round.obh.md"),
  )
  assert.equal(
    run.data.path,
    join(context.planRoot, "example-plan-rounds.json"),
  )
  assert.equal(
    run.watch,
    join(context.planRoot, "example-plan-06-9-watch.obh.md"),
  )
  const archived = await roundRun(
    { ...context, plan: "archive/topic/plan.md" },
    0,
    releases,
  )
  assert.equal(archived.nameStart, "topic-plan-01")
  assert.equal(archived.data, undefined)
})

import assert from "node:assert/strict"
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { basename, join } from "node:path"
import { test } from "node:test"
import { execa } from "execa"
import { resolveTargets } from "../default-target.js"
import { roundRun as buildRoundRun } from "../output.js"
import { RunClock } from "../run-clock.js"
import {
  planRepositoryPrefix,
  targetRequest,
  unprefixedCommitReference,
} from "../target.js"
import {
  briefRun,
  RoundOutput,
  roundRun,
  testSettings,
  transcriptNameStart,
} from "./configured-runner.js"
import { fixture, releases, testContext, testSetup } from "./helpers.js"
import { commitFixture, shortCommit } from "./round-fixture.js"

const options = {
  terminal: { write() {}, status() {}, clear() {} },
  clock: new RunClock(Date.now),
}

test("phase files sort in fixed order with paired logs and dotted commit-range targets", async (t) => {
  const f = await fixture(t)
  const run = await roundRun(
    {
      ...testSetup(f.root),
      groups: [
        {
          references: ["abcdef..123abc"],
          repository: "repo-edu",
          startingHead: "unused",
          commits: ["a".repeat(40)],
          shortReferences: ["abcdef..123abc"],
        },
      ],
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
    "commit-abcdef..123abc-01-0-claim.md",
    "commit-abcdef..123abc-01-1-round.obh.md",
    "commit-abcdef..123abc-01-2-audit.obh.md",
    "commit-abcdef..123abc-01-3-vet.abh.md",
    "commit-abcdef..123abc-01-4-rebut.obh.md",
    "commit-abcdef..123abc-01-6-brief.oul.md",
    "commit-abcdef..123abc-01-7-ruling.obh.md",
    "commit-abcdef..123abc-01-9-watch.obh.md",
  ])
  assert.equal(
    run.data?.path,
    join(f.runtime.activeRoot, "commit-abcdef..123abc-rounds.json"),
  )
  assert.equal(run.paths.log, run.paths.markdown.replace(/\.md$/, ".log"))
  assert.equal(
    transcriptNameStart(run.paths.markdown),
    "commit-abcdef..123abc-01",
  )
  const brief = await briefRun(run.paths.markdown, f.runtime, 0, releases)
  assert.equal(brief.paths.log, brief.brief.replace(/\.md$/, ".log"))
  assert.equal(
    basename(run.paths.claim as string),
    "commit-abcdef..123abc-01-0-claim.md",
  )
  await writeFile(run.documents.report, "Retained report")
  assert.equal(
    (
      await roundRun(
        {
          ...testSetup(f.root),
          groups: [
            {
              references: ["abcdef..123abc"],
              repository: "repo-edu",
              startingHead: "unused",
              commits: ["a".repeat(40)],
              shortReferences: ["abcdef..123abc"],
            },
          ],
        },
        0,
        releases,
      )
    ).nameStart,
    "commit-abcdef..123abc-02",
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

test("only retained numbered files in the active folder reserve numbers across auditors", async (t) => {
  const f = await fixture(t)
  const setup = { ...testSetup(f.root), plan: "example.md", scope: "1" }
  for (const root of [f.root, setup.activeRoot]) {
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
        root === setup.activeRoot && suffix !== "1-round.abh.json"
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

test("an active-folder report survives partial cleanup and full cleanup restarts numbering", async (t) => {
  const f = await fixture(t)
  const setup = { ...testSetup(f.root), plan: "example.md", scope: "1" }
  const run = await roundRun(setup, 0, releases)
  new RoundOutput(run, options).close()
  const report = join(setup.activeRoot, `${run.nameStart}-2-audit.obh.md`)
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

test("commit filenames resolve each group's references to six characters and join group labels", async (t) => {
  const f = await fixture(t)
  const planRoot = join(f.root, "../plan")
  for (let n = 0; n < 5; n += 1) {
    await commitFixture(f.root, `Fixture ${n}`)
    await commitFixture(planRoot, `Plan fixture ${n}`)
  }
  const context = testContext(f.root)
  const head = await shortCommit(f.root, "HEAD")
  const back = (n: number) => shortCommit(f.root, `HEAD~${n}`)
  const planHead = await shortCommit(planRoot, "HEAD")
  const fullSha = (await execa("git", ["rev-parse", "HEAD~1"], { cwd: f.root }))
    .stdout
  for (const [commits, label] of [
    [["HEAD"], `commit-${head}`],
    [["HEAD-4"], `commit-${await back(4)}`],
    [["HEAD-4..HEAD"], `commit-${await back(4)}..${head}`],
    [["HEAD-4", "HEAD-1", "HEAD"], `commit-${await back(4)}-plus-2`],
    // A typed SHA names the same file at any length.
    [[fullSha], `commit-${await back(1)}`],
    [[fullSha.slice(0, 9)], `commit-${await back(1)}`],
    [
      [`${planRepositoryPrefix}HEAD-4..HEAD`],
      `commit-${await shortCommit(planRoot, "HEAD~4")}..${planHead}`,
    ],
  ] as const) {
    const [first, ...rest] = commits
    const [target] = await resolveTargets(context, targetRequest(first, rest))
    const run = await roundRun({ ...testSetup(f.root), ...target }, 0, releases)
    assert.equal(basename(run.paths.markdown), `${label}-01-1-round.obh.md`)
    assert.equal(run.title, `Commit audit of ${commits.join(" ")}`)
  }

  const references = ["HEAD-1", "HEAD", `${planRepositoryPrefix}HEAD`] as const
  const [target] = await resolveTargets(
    context,
    targetRequest(references[0], references.slice(1)),
  )
  assert.ok("groups" in target)
  assert.deepEqual(
    target.groups.map((group) => group.shortReferences),
    [[await back(1), head], [planHead]],
  )
  const run = await roundRun({ ...testSetup(f.root), ...target }, 0, releases)
  assert.equal(
    basename(run.paths.markdown),
    `commit-${await back(1)}-plus-1+${planHead}-01-1-round.obh.md`,
  )
  assert.equal(run.title, `Commit audit of ${references.join(" ")}`)

  for (const [reference, repository] of [
    ["abcd1234", "repo-edu"],
    ["HEAD-9", "repo-edu"],
    [`${planRepositoryPrefix}abcd1234..HEAD`, "plan"],
  ] as const)
    await assert.rejects(
      resolveTargets(context, targetRequest(reference, [])),
      {
        message: `${unprefixedCommitReference(reference).split("..")[0]} names no commit in the ${repository} checkout.`,
      },
    )
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
  const transcript = join(
    f.runtime.activeRoot,
    "example-impl-01..01-09-1-round.abh.md",
  )
  await writeFile(transcript, "Original transcript")
  const run = await briefRun(transcript, f.runtime, 0, releases)
  assert.equal(
    basename(run.paths.log),
    "example-impl-01..01-09-6-brief.oul.log",
  )
  const first = new RoundOutput(run, options)
  await first.message("First brief")
  first.close()
  new RoundOutput(
    await briefRun(transcript, f.runtime, 1000, releases),
    options,
  ).close()
  assert.doesNotMatch(await readFile(run.paths.log, "utf8"), /First brief/)
  assert.equal(await readFile(transcript, "utf8"), "Original transcript")
  assert.deepEqual(
    (await readdir(f.runtime.activeRoot)).filter((name) =>
      name.endsWith("-0-claim.md"),
    ),
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
      pool: testSettings.auditors,
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

test("planning rounds number their bare target in the active folder and write there", async (t) => {
  const f = await fixture(t)
  const context = testSetup(f.root, "planning")
  await writeFile(join(context.activeRoot, "example-plan-05-0-claim.md"), "")
  const run = await roundRun(
    { ...context, plan: "example-widen.md" },
    0,
    releases,
  )
  assert.ok(run.data)
  assert.equal(run.nameStart, "example-plan-06")
  assert.equal(
    run.paths.claim,
    join(context.activeRoot, "example-plan-06-0-claim.md"),
  )
  assert.equal(
    run.paths.markdown,
    join(context.activeRoot, "example-plan-06-1-round.obh.md"),
  )
  assert.equal(
    run.data.path,
    join(context.activeRoot, "example-plan-rounds.json"),
  )
  assert.equal(
    run.watch,
    join(context.activeRoot, "example-plan-06-9-watch.obh.md"),
  )
  const archived = await roundRun(
    { ...context, plan: "archive/topic/plan.md" },
    0,
    releases,
  )
  assert.equal(archived.nameStart, "topic-plan-01")
  assert.equal(archived.data, undefined)
})

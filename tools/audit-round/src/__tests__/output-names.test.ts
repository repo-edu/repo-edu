import assert from "node:assert/strict"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { basename, join } from "node:path"
import { test } from "node:test"
import { execa } from "execa"
import { resolveTargets } from "../default-target.js"
import { roundRun as buildRoundRun } from "../output.js"
import { RunClock } from "../run-clock.js"
import {
  commitTargetRequest,
  planRepositoryPrefix,
  unprefixedCommitReference,
} from "../target.js"
import {
  pinned,
  RoundOutput,
  roundRun,
  testFixer,
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
  const group = {
    references: ["abcdef..123abc"] as const,
    repository: "repo-edu" as const,
    startingHead: "unused",
    commits: ["abcdef".padEnd(40, "0"), "123abc".padEnd(40, "0")] as const,
    shortReferences: ["abcdef..123abc"] as const,
  }
  const run = await roundRun(
    {
      ...testSetup(f.root),
      originalGroups: [group],
      groups: [group],
    },
    0,
    releases,
  )
  const names = [
    run.paths.claim,
    run.paths.markdown,
    ...Object.values(run.documents).flat(),
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
    "commit-abcdef..123abc-01-6-rule.abh.md",
    "commit-abcdef..123abc-01-7-ruling.obh.md",
    "commit-abcdef..123abc-01-9-watch.obh.md",
  ])
  assert.equal(
    run.data?.path,
    join(f.runtime.roundRoot, "commit-abcdef..123abc-rounds.json"),
  )
  assert.equal(run.paths.log, run.paths.markdown.replace(/\.md$/, ".log"))
  assert.equal(
    transcriptNameStart(run.paths.markdown),
    "commit-abcdef..123abc-01",
  )
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
          originalGroups: [group],
          groups: [group],
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
    ...testFixer,
    plan: "example.md",
    scope: "2-4",
    auditorSelectionSource: "settings" as const,
  }
  const codex = await roundRun({ ...setup, auditor: "codex" }, 0, releases)
  const claude = await roundRun({ ...setup, auditor: "claude" }, 0, releases)
  assert.equal(codex.nameStart, "example-impl-audit-02..04-01")
  assert.equal(claude.nameStart, codex.nameStart)
  new RoundOutput(codex, options).close()
  assert.throws(() => new RoundOutput(claude, options), { code: "EEXIST" })
  assert.equal(await readFile(codex.paths.claim as string, "utf8"), "")
  await assert.rejects(readFile(claude.paths.log), { code: "ENOENT" })
  await assert.rejects(readFile(claude.paths.markdown), { code: "ENOENT" })
  const next = await roundRun({ ...setup, auditor: "claude" }, 0, releases)
  assert.equal(next.nameStart, "example-impl-audit-02..04-02")
  assert.equal(
    basename(next.paths.markdown),
    "example-impl-audit-02..04-02-1-round.abh.md",
  )
  assert.ok(next.watch)
  assert.equal(
    basename(next.watch),
    "example-impl-audit-02..04-02-9-watch.obh.md",
  )
  new RoundOutput(next, options).close()
})

test("only retained numbered files in the round folder reserve numbers across auditors", async (t) => {
  const f = await fixture(t)
  const setup = { ...testSetup(f.root), plan: "example.md", scope: "1" }
  // The plan checkout's active folder holds plans, so its files reserve nothing.
  for (const root of [f.root, setup.activeRoot, setup.roundRoot]) {
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
      "7-ruling.obh.md",
      "9-watch.abh.md",
    ]) {
      const path = join(root, `example-impl-audit-01..01-09-${suffix}`)
      await writeFile(path, "")
      const run = await roundRun(setup, 0, releases)
      assert.equal(
        run.nameStart,
        root === setup.roundRoot && suffix !== "1-round.abh.json"
          ? "example-impl-audit-01..01-10"
          : "example-impl-audit-01..01-01",
        path,
      )
      await rm(path)
    }
  }
  await writeFile(
    join(f.root, "ROUND-example-impl-audit-01..01-codex-old.md"),
    "",
  )
  await writeFile(
    join(f.root, "example-impl-audit-01..01-99-otm-unknown.md"),
    "",
  )
  await writeFile(
    join(f.root, "example-impl-audit-01..01-other-99-2-audit.otm.md"),
    "",
  )
  await mkdir(join(f.root, "example-impl-audit-01..01-99-1-round.otm.md"))
  assert.equal(
    (await roundRun(setup, 0, releases)).nameStart,
    "example-impl-audit-01..01-01",
  )
})

test("a round-folder report survives partial cleanup and full cleanup restarts numbering", async (t) => {
  const f = await fixture(t)
  const setup = { ...testSetup(f.root), plan: "example.md", scope: "1" }
  const run = await roundRun(setup, 0, releases)
  new RoundOutput(run, options).close()
  const report = join(setup.roundRoot, `${run.nameStart}-2-audit.obh.md`)
  await writeFile(report, "Report")
  for (const path of [run.paths.claim, run.paths.log, run.paths.markdown])
    await rm(path as string)
  assert.equal(
    (await roundRun(setup, 0, releases)).nameStart,
    "example-impl-audit-01..01-02",
  )
  await rm(report)
  assert.equal(
    (await roundRun(setup, 0, releases)).nameStart,
    "example-impl-audit-01..01-01",
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
    "example-impl-audit-01..01-02",
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
    [
      ["HEAD-4", "HEAD-3", "HEAD-2", "HEAD-1", "HEAD"],
      `commit-${await back(4)}..${head}`,
    ],
    [
      ["HEAD", "HEAD-1", "HEAD-2", "HEAD-3", "HEAD-4"],
      `commit-${await back(4)}..${head}`,
    ],
    // A typed SHA names the same file at any length.
    [[fullSha], `commit-${await back(1)}`],
    [[fullSha.slice(0, 9)], `commit-${await back(1)}`],
    [
      [`${planRepositoryPrefix}HEAD-4..HEAD`],
      `commit-${await shortCommit(planRoot, "HEAD~4")}..${planHead}`,
    ],
  ] as const) {
    const [target] = await resolveTargets(context, commitTargetRequest(commits))
    const run = await roundRun({ ...testSetup(f.root), ...target }, 0, releases)
    assert.equal(basename(run.paths.markdown), `${label}-01-1-round.obh.md`)
    assert.equal(run.title, `Commit audit of ${commits.join(" ")} (round 1)`)
  }

  const references = ["HEAD-1", "HEAD", `${planRepositoryPrefix}HEAD`] as const
  const [target] = await resolveTargets(
    context,
    commitTargetRequest(references),
  )
  assert.ok("groups" in target)
  assert.deepEqual(
    target.groups.map((group) => group.shortReferences),
    [[await back(1), head], [planHead]],
  )
  const run = await roundRun({ ...testSetup(f.root), ...target }, 0, releases)
  assert.equal(
    basename(run.paths.markdown),
    `commit-${await back(1)}..${head}+${planHead}-01-1-round.obh.md`,
  )
  assert.equal(run.title, `Commit audit of ${references.join(" ")} (round 1)`)

  for (const [reference, repository] of [
    ["abcd1234", "repo-edu"],
    ["HEAD-9", "repo-edu"],
    [`${planRepositoryPrefix}abcd1234..HEAD`, "plan"],
  ] as const) {
    await assert.rejects(
      resolveTargets(context, commitTargetRequest([reference])),
      {
        message: `${unprefixedCommitReference(reference).split("..")[0]} names no commit in the ${repository} checkout.`,
      },
    )
    // A live Git read keeps its checkout busy, which Windows refuses to remove.
    assert.ok(!process.getActiveResourcesInfo().includes("ProcessWrap"))
  }
})

test("single steps and ranges keep separate padded numbering", async (t) => {
  const f = await fixture(t)
  for (const [scope, target] of [
    ["1", "impl-audit-01..01"],
    ["3", "impl-audit-03..03"],
    ["2-4", "impl-audit-02..04"],
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

test("an automatic series adds no assistant phase for its decision", async (t) => {
  const f = await fixture(t)
  const run = await buildRoundRun(
    {
      ...testSetup(f.root),
      plan: "example.md",
      scope: "1",
      pool: testSettings.implementationAudit.auditors,
    },
    0,
    releases,
    testSettings,
    "pnpm audit-round run example",
  )

  assert.notEqual(run.phases.at(-1)?.phase, "judge")
})

test("a planning title counts its round from the latest phase marker beside the file number", async (t) => {
  const f = await fixture(t)
  const context = testSetup(f.root, "planning")
  const retain = (name: string) =>
    writeFile(join(context.roundRoot, `example-plan-audit-${name}`), "")
  const title = async (plan: string) =>
    (await roundRun({ ...context, plan }, 0, releases)).title
  assert.equal(
    await title("example-widen.md"),
    "Plan audit of example-widen.md (widening round 1, file round 1)",
  )
  await retain("01-0-claim.md")
  await retain("02-2-audit.abh.md")
  await retain("03-0-settle.md")
  assert.equal(
    await title("example.md"),
    "Plan audit of example.md (detailing round 1, file round 4)",
  )
  await retain("04-0-claim.md")
  await retain("05-0-claim.md")
  assert.equal(
    await title("example.md"),
    "Plan audit of example.md (detailing round 3, file round 6)",
  )
  await retain("06-0-reopen.md")
  assert.equal(
    await title("example-widen.md"),
    "Plan audit of example-widen.md (widening round 1, file round 7)",
  )
})

test("planning rounds number their bare target in the round folder and write there", async (t) => {
  const f = await fixture(t)
  const context = testSetup(f.root, "planning")
  await writeFile(
    join(context.roundRoot, "example-plan-audit-05-0-claim.md"),
    "",
  )
  const run = await roundRun(
    { ...context, plan: "example-widen.md" },
    0,
    releases,
  )
  assert.ok(run.data)
  assert.equal(run.nameStart, "example-plan-audit-06")
  assert.equal(
    run.paths.claim,
    join(context.roundRoot, "example-plan-audit-06-0-claim.md"),
  )
  assert.equal(
    run.paths.markdown,
    join(context.roundRoot, "example-plan-audit-06-1-round.obh.md"),
  )
  assert.equal(
    run.data.path,
    join(context.roundRoot, "example-plan-rounds.json"),
  )
  assert.equal(
    run.watch,
    join(context.roundRoot, "example-plan-audit-06-9-watch.obh.md"),
  )
  const archived = await roundRun(
    { ...context, plan: "archive/topic/plan.md" },
    0,
    releases,
  )
  assert.equal(archived.nameStart, "topic-plan-audit-01")
  assert.equal(archived.data, undefined)
})

const head = "c".repeat(40)

/** An implementation audit report on the target it names, with no findings. */
const implementationReport = (target: string) =>
  `Implementation audit workflow\nTarget: ${target}\nJudged repos: repo-edu@${head}\n\n## Findings\n\nNo findings.\n`

/** Leave a round that failed in its vet, keeping the given audit report. */
async function stoppedRound(
  setup: Parameters<typeof roundRun>[0],
  report: string | null,
) {
  const run = await roundRun(setup, 0, releases)
  const output = new RoundOutput(run, options)
  if (report !== null) await writeFile(run.documents.report, report)
  output.finish({
    status: "failed",
    phase: "vet",
    reason: "Usage limit",
    sessionId: null,
    assistant: "claude",
    model: pinned("claude"),
    ...testContext(setup.repoEduRoot),
    commits: [],
    account: { settling: "", judgedRepos: [], findings: [] },
  })
  output.close()
  return run
}

test("a call continues its target's newest stopped round on the kept audit report", async (t) => {
  const f = await fixture(t)
  const setup = { ...testSetup(f.root), plan: "example.md", scope: "1" }
  const stopped = await stoppedRound(
    setup,
    implementationReport("example.md 1"),
  )
  // The kept audit report fixes the auditor, whatever the call asks.
  const next = await roundRun({ ...setup, auditor: "claude" }, 0, releases)
  assert.equal(next.nameStart, stopped.nameStart)
  assert.equal(next.stored?.round, 1)
  assert.equal(next.setup.auditor, "codex")
  assert.equal(next.paths.claim, null)
  assert.equal(next.paths.reopenLog, true)
  assert.equal(next.paths.markdown, stopped.paths.markdown)
  assert.equal(next.documents.report, stopped.documents.report)
  assert.match(next.title, /\(round 1\), continued$/)
  assert.ok(next.data)
  assert.equal(next.data.tag, "obh")
})

test("a continued round keeps the stored round's start in its round data", async (t) => {
  const f = await fixture(t)
  const setup = { ...testSetup(f.root), plan: "example.md", scope: "1" }
  await stoppedRound(setup, implementationReport("example.md 1"))
  // The rerun starts an hour later, but the kept audit report read the code
  // at the first start, which the series rules and the range start read.
  const next = await roundRun(setup, 3_600_000, releases)
  assert.equal(next.stored?.round, 1)
  const output = new RoundOutput(next, options)
  output.finish({
    status: "failed",
    phase: "vet",
    reason: "Usage limit",
    sessionId: null,
    assistant: "claude",
    model: pinned("claude"),
    ...testContext(setup.repoEduRoot),
    commits: [],
    account: { settling: "", judgedRepos: [], findings: [] },
  })
  output.close()
  assert.ok(next.data)
  const stored = JSON.parse(await readFile(next.data.path, "utf8")) as {
    rounds: { round: number; started: string }[]
  }
  assert.deepEqual(
    stored.rounds.map(({ round, started }) => ({ round, started })),
    [{ round: 1, started: new Date(0).toISOString() }],
  )
})

test("a stopped round without a valid kept audit report leaves the call a new round", async (t) => {
  const f = await fixture(t)
  const setup = { ...testSetup(f.root), plan: "example.md", scope: "1" }
  await stoppedRound(setup, null)
  const afterAudit = await roundRun(setup, 0, releases)
  assert.equal(afterAudit.nameStart, "example-impl-audit-01..01-02")
  assert.equal(afterAudit.stored, undefined)
  new RoundOutput(afterAudit, options).close()
  // A report that names another target does not read as valid.
  const mistargeted = await stoppedRound(
    setup,
    implementationReport("example.md 2"),
  )
  assert.equal(mistargeted.nameStart, "example-impl-audit-01..01-03")
  const refused = await roundRun(setup, 0, releases)
  assert.equal(refused.nameStart, "example-impl-audit-01..01-04")
  assert.equal(refused.stored, undefined)
})

test("a call continues a stopped planning round only when both are chained or neither is", async (t) => {
  const f = await fixture(t)
  const planning = {
    ...testSetup(f.root, "planning"),
    roundKind: "planning" as const,
    plan: "example.md",
  }
  const deferrals = [
    {
      deferringRepository: "repo-edu" as const,
      sha: "d".repeat(40),
      position: 1,
      tier: "b" as const,
      destination: "plan",
      title: "Fixture deferral",
    },
  ]
  const report = `Planning round workflow\nTarget: example.md\nJudged repos: plan@${head}\n\n## Excess functionality\n\nNo excess findings.\n\n## Missing functionality\n\nNo missing findings.\n`
  const chained = await stoppedRound({ ...planning, deferrals }, report)
  const stored = JSON.parse(
    await readFile(
      join(f.root, "../plan-evidence/active/example-plan-rounds.json"),
      "utf8",
    ),
  ) as { rounds: { deferrals?: unknown }[] }
  assert.deepEqual(stored.rounds[0]?.deferrals, deferrals)
  // An ordinary call opens a new round beside the stopped chained one.
  const ordinary = await roundRun(planning, 0, releases)
  assert.equal(ordinary.stored, undefined)
  assert.equal(ordinary.nameStart, "example-plan-audit-02")
  new RoundOutput(ordinary, options).close()
  // A chained call continues only the newest round, which is no longer the chained one.
  const later = await roundRun({ ...planning, deferrals: [] }, 0, releases)
  assert.equal(later.stored, undefined)
  assert.notEqual(later.nameStart, chained.nameStart)
})

test("a chained call continues a stopped chained round on its stored deferral list", async (t) => {
  const f = await fixture(t)
  const planning = {
    ...testSetup(f.root, "planning"),
    roundKind: "planning" as const,
    plan: "example.md",
  }
  const deferral = {
    deferringRepository: "repo-edu" as const,
    sha: "d".repeat(40),
    position: 1,
    tier: "b" as const,
    destination: "plan",
    title: "Fixture deferral",
  }
  const report = `Planning round workflow\nTarget: example.md\nJudged repos: plan@${head}\n\n## Excess functionality\n\nNo excess findings.\n\n## Missing functionality\n\nNo missing findings.\n`
  const chained = await stoppedRound(
    { ...planning, deferrals: [deferral, { ...deferral, position: 2 }] },
    report,
  )
  const next = await roundRun(
    {
      ...planning,
      deferrals: [{ ...deferral, position: 3 }],
      implementationSeriesScope: "2-4",
    },
    0,
    releases,
  )
  assert.equal(next.nameStart, chained.nameStart)
  assert.deepEqual(next.setup.deferrals, [
    deferral,
    { ...deferral, position: 2 },
  ])
  assert.equal(
    next.openingNote,
    "The implementation audit series for steps 2-4 uses this round to review 2 deferred plan corrections.",
  )
})

test("a continued implementation round keeps the deferral list its audit received, an empty one included", async (t) => {
  const f = await fixture(t)
  const setup = { ...testSetup(f.root), plan: "example.md" }
  const deferral = {
    deferringRepository: "plan" as const,
    sha: "d".repeat(40),
    position: 1,
    tier: "c" as const,
    destination: "tool-audit-round",
    title: "Fixture deferral",
  }
  const storedDeferrals = async (path: string, target: string) =>
    (
      JSON.parse(await readFile(path, "utf8")) as {
        rounds: { target: string; deferrals?: unknown }[]
      }
    ).rounds.find((entry) => entry.target === target)?.deferrals
  // A deferral that opens during the stop waits for a report that judges it.
  const judged = await stoppedRound(
    { ...setup, scope: "1", deferrals: [deferral] },
    implementationReport("example.md 1"),
  )
  assert.ok(judged.data)
  assert.deepEqual(
    await storedDeferrals(judged.data.path, judged.data.target),
    [deferral],
  )
  const opened = { ...deferral, position: 2 }
  const next = await roundRun(
    { ...setup, scope: "1", deferrals: [deferral, opened] },
    0,
    releases,
  )
  assert.equal(next.nameStart, judged.nameStart)
  assert.deepEqual(next.setup.deferrals, [deferral])
  // An audit that received no deferral keeps that empty list.
  const empty = await stoppedRound(
    { ...setup, scope: "2", deferrals: [] },
    implementationReport("example.md 2"),
  )
  assert.ok(empty.data)
  assert.deepEqual(
    await storedDeferrals(empty.data.path, empty.data.target),
    [],
  )
  const later = await roundRun(
    { ...setup, scope: "2", deferrals: [opened] },
    0,
    releases,
  )
  assert.equal(later.nameStart, empty.nameStart)
  assert.deepEqual(later.setup.deferrals, [])
})

test("a continued commit round keeps the commits and references its kept audit report judged", async (t) => {
  const f = await fixture(t)
  const original = {
    repository: "repo-edu" as const,
    references: ["abcdef"] as [string],
    startingHead: head,
    commits: ["abcdef".padEnd(40, "0")] as [string],
    shortReferences: ["abcdef"] as [string],
  }
  const setup = {
    ...testSetup(f.root),
    originalGroups: [original] as [typeof original],
    groups: [original] as [typeof original],
  }
  const stopped = await stoppedRound(setup, implementationReport("abcdef"))
  // A later call advances its target by the fixes the series has landed.
  const fix = "123abc".padEnd(40, "0")
  const advanced = {
    ...original,
    references: [original.commits[0], fix] as [string, string],
    commits: [original.commits[0], fix] as [string, string],
  }
  const next = await roundRun({ ...setup, groups: [advanced] }, 0, releases)
  assert.equal(next.nameStart, stopped.nameStart)
  assert.ok("groups" in next.setup)
  assert.deepEqual(next.setup.groups[0]?.references, ["abcdef"])
  assert.deepEqual(next.setup.groups[0]?.commits, original.commits)
})

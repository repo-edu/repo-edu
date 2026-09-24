import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { execa } from "execa"
import { type LogCommit, readLog } from "../episode-log.js"
import {
  glanceDecision as decide,
  readWatchRecords,
  runGlance,
} from "../glance.js"
import type { Repository } from "../subject.js"
import {
  bullet,
  commit,
  correction,
  episode,
  history,
  ratings,
} from "./episode-fixture.js"
import { commitFixture } from "./round-fixture.js"

const glanceDecision = (
  log: readonly LogCommit[],
  records: Readonly<Record<string, unknown>> | null,
  repository: Repository,
) => decide(episode(log, repository), records)
const record = (
  grade: "green" | "amber" | "red",
  head = "c000001",
  repository = "repo-edu",
) => ({
  example: { heads: { [repository]: head }, grade, written: "2026-09-20" },
})

test("missing, invalid and former watch records read green from the episode's anchor", () => {
  for (const records of [
    null,
    {},
    record("green", "c000001", "plan"),
    { example: { sha: "c000001", grade: "green", horizon: 4, written: "x" } },
    { example: { ...record("amber").example, horizon: 6 } },
  ]) {
    const decision = glanceDecision(history(), records, "repo-edu")
    assert.equal(decision.due, false)
    assert.match(
      decision.text,
      /has no watch record for repo-edu; it reads green from its anchor\. No A–C correction commits since\. No area reached the green limit of 4/,
    )
  }
  const stale = glanceDecision(history(), record("red", "deadbeef"), "repo-edu")
  assert.equal(stale.due, false)
  assert.match(
    stale.text,
    /recorded red at deadbeef, which is not on HEAD's history; it reads green from its anchor/,
  )
})

test("without a record the whole episode counts, from its earliest stem commit", () => {
  const before = {
    ...correction(),
    subject: "ath c1 fix(x): before the episode",
  }
  const three = history(correction(), correction(), correction())
  assert.equal(glanceDecision(three, null, "repo-edu").due, false)
  const four = [
    ...history(correction(), correction(), correction(), correction()),
  ]
  const decision = glanceDecision(four, null, "repo-edu")
  assert.equal(decision.due, true)
  assert.match(decision.text, /area:area-a 4.*green limit of 4 \(rule 2\)/)
  // A correction older than the episode's first stem commit is outside it.
  const older = [...three, { ...before, sha: "c000000" }]
  assert.equal(glanceDecision(older, null, "repo-edu").due, false)
  assert.match(glanceDecision(older, null, "repo-edu").text, /area:area-a 3/)
  // The unstemmed history has no anchor, so all of it counts.
  const bare = four.map(({ sha }) => ({
    ...correction(),
    sha,
    subject: "ath c1 fix(x): correction",
  }))
  assert.equal(glanceDecision(bare, null, "repo-edu").due, true)
})

test("red earns a watch without any new correction", () => {
  for (const head of ["c000001", "c000001abc"]) {
    const decision = glanceDecision(history(), record("red", head), "repo-edu")
    assert.equal(decision.due, true)
    assert.match(decision.text, /red record.*rule 1/)
  }
})

test("green requires four correction commits in one area; amber requires two", () => {
  for (const [grade, limit] of [
    ["green", 4],
    ["amber", 2],
  ] as const) {
    for (const count of [limit - 1, limit, limit + 1]) {
      const decision = glanceDecision(
        history(...Array.from({ length: count }, () => correction())),
        record(grade),
        "repo-edu",
      )
      assert.equal(decision.due, count >= limit)
      assert.ok(decision.text.includes(`area:area-a ${count}`))
      assert.ok(decision.text.includes(`${grade} limit of ${limit}`))
    }
  }
})

test("corrections in separate areas never add together", () => {
  const decision = glanceDecision(
    history(...["a", "b", "c", "d", "e"].map((area) => correction(area))),
    record("green"),
    "repo-edu",
  )
  assert.equal(decision.due, false)
})

test("D-only work, clean records, deferrals, steps and empty commits do not advance counts", () => {
  const skipped = [
    commit("example/impl-audit-all ath D2d1 docs(x): polish"),
    commit("example/impl-audit-all ath clean: clear"),
    commit("example/impl-audit-all ath B1: deferred"),
    commit("example/impl-2 ath feat(x): step"),
    commit("example/implemented ath: finished"),
    commit("ath d1 fix(x): polish"),
    { ...correction(), files: [] },
    commit("c1 fix(x): older subject", "- [C] [area:area-a] Old grammar."),
  ]
  assert.equal(
    glanceDecision(
      history(...skipped, ...skipped, correction()),
      record("amber"),
      "repo-edu",
    ).due,
    false,
  )
})

test("mixed tiers count only areas with A-C corrections, once per commit", () => {
  const mixed = commit(
    "example/impl-audit-all ath C2d1 fix(x): mixed corrections",
    [bullet(), bullet(), bullet("area:area-b", "D")].join("\n"),
  )
  const decision = glanceDecision(
    history(mixed, correction("area-b")),
    record("amber"),
    "repo-edu",
  )
  assert.equal(decision.due, false)
  assert.match(decision.text, /area:area-a 1, area:area-b 1/)
  assert.equal(
    glanceDecision(
      history(mixed, correction("area-a")),
      record("amber"),
      "repo-edu",
    ).due,
    true,
  )
})

test("a commit can correct two areas without merging their counts", () => {
  const mixed = commit(
    "example/impl-audit-all ath c2 fix(x): two areas",
    [bullet(), bullet("area:area-b")].join("\n"),
  )
  assert.equal(
    glanceDecision(
      history(mixed, correction("area-b")),
      record("amber"),
      "repo-edu",
    ).due,
    true,
  )
})

test("severity, reach and growth have no early trigger; both cases count", () => {
  const severe = commit(
    "example/impl-audit-all ath A1 redesign(x): proper correction",
    bullet("area:area-a", "A"),
  )
  assert.equal(
    glanceDecision(history(severe), record("green"), "repo-edu").due,
    false,
  )
  const b = correction("area-a", "!B1", "B")
  assert.equal(
    glanceDecision(history(b, b), record("green"), "repo-edu").due,
    false,
  )
  const growth = {
    ...correction(),
    subject:
      "example/impl-audit-all ath growth-high c1 redesign(x): correct the owner",
  }
  assert.equal(
    glanceDecision(history(growth, growth, growth), record("green"), "repo-edu")
      .due,
    false,
  )
  assert.equal(
    glanceDecision(history(severe, correction()), record("amber"), "repo-edu")
      .due,
    true,
  )
})

test("only episode corrections after the saved head count, including off-plan rework", () => {
  const offPlan = { ...correction(), subject: "ath c1 fix(x): rework" }
  const outside = {
    ...correction(),
    subject: "ath c1 fix(y): outside",
    files: ["src/other.ts"],
  }
  const log = history(offPlan, outside, correction(), correction())
  assert.equal(
    glanceDecision(log, record("amber", "c000003"), "repo-edu").due,
    false,
  )
  assert.equal(glanceDecision(log, record("amber"), "repo-edu").due, true)
})

test("plan rounds count sections independently and ignore D findings", () => {
  const plan = (section: string) =>
    commit(
      "example/audit ath C1D1: correct the plan",
      `- C [field:missing] [section:${section}] ${ratings} Correct.\n- D [field:missing] [section:wording] ${ratings} Words.`,
      ["example.md"],
    )
  const saved = record("amber", "c000001", "plan")
  assert.equal(
    glanceDecision(
      history(plan("decisions"), plan("target-state")),
      saved,
      "plan",
    ).due,
    false,
  )
  assert.equal(
    glanceDecision(history(plan("decisions"), plan("decisions")), saved, "plan")
      .due,
    true,
  )
})

test("plan commits count local sections without counting deferred Repo Edu findings", () => {
  const mixed = commit(
    "example/impl-audit-all ath C2 docs(x): correct the plan and defer the code",
    `- C [section:decisions] ${ratings} Correct.\n- C [area:tool-audit-round] ${ratings} Defer.`,
  )
  const deferred = commit(
    "example/impl-audit-all ath C1 docs(x): record the deferred code fix",
    `- C [area:tool-audit-round] ${ratings} Defer.`,
  )
  const decision = glanceDecision(
    history(mixed, deferred),
    record("amber", "c000001", "plan"),
    "plan",
  )
  assert.equal(decision.due, false)
  assert.match(decision.text, /section:decisions 1/)
  assert.doesNotMatch(decision.text, /area:tool-audit-round/)
  assert.equal(
    glanceDecision(
      history(mixed, mixed),
      record("amber", "c000001", "plan"),
      "plan",
    ).due,
    true,
  )
})

test("historical stem prefixes join; unstemmed history uses its own record", () => {
  const a = {
    ...correction(),
    subject: "topology-example/impl-audit-all ath c1 fix(x): correction",
  }
  const b = {
    ...correction(),
    subject: "plan-example/impl-audit-all ath c1 fix(x): correction",
  }
  assert.equal(
    glanceDecision(history(a, b), record("amber"), "repo-edu").due,
    true,
  )
  const bare = history(correction(), correction()).map((c) => ({
    ...c,
    subject: "ath c1 fix(x): correction",
  }))
  assert.equal(
    glanceDecision(bare, { "-": record("amber").example }, "repo-edu").due,
    true,
  )
})

test("unreadable corrections stay in episode evidence without contributing partial counts", () => {
  const data = episode(
    history(commit("example/impl-audit-all ath c1 fix(x): correction")),
  )
  assert.equal(data.unreadable.length, 1)
  assert.equal(decide(data, record("green")).due, false)
})

test("the supplied topic wins over HEAD and retired areas count once in each child", () => {
  const log = history(
    commit("other/impl-1 ath feat(x): another plan", "", ["other.ts"]),
    correction("retired"),
    correction("retired"),
  )
  const decision = decide(episode(log, "repo-edu", "example"), record("amber"))
  assert.equal(decision.due, true)
  assert.match(decision.text, /episode example.*area:child-a 2, area:child-b 2/)
})

test("real Git history carries finding bodies and touched files into the decision", async () => {
  const directory = await mkdtemp(join(tmpdir(), "glance-"))
  try {
    const cwd = join(directory, "repo")
    await mkdir(cwd)
    const first = await commitFixture(
      cwd,
      "example/impl-1 ath feat(x): fixture",
    )
    const body = bullet("area:fixture-area")
    for (let i = 0; i < 2; i++) {
      await writeFile(join(cwd, "a.md"), String(i))
      await execa("git", ["add", "."], { cwd })
      await commitFixture(
        cwd,
        `example/impl-audit-all ath c1 fix(x): correction\n\n${body}`,
      )
    }
    const commits = await readLog(cwd)
    assert.equal(commits.length, 3)
    assert.equal(commits[0].body.trim(), body)
    assert.deepEqual(commits[0].files, ["a.md"])
    assert.ok(commits[2].sha.startsWith(first))
    const cacheRoot = join(directory, "cache")
    assert.equal(await readWatchRecords(cacheRoot), null)
    await mkdir(cacheRoot)
    await writeFile(join(cacheRoot, "watch.json"), "{broken")
    assert.equal(await readWatchRecords(cacheRoot), null)
    await writeFile(
      join(cacheRoot, "watch.json"),
      JSON.stringify(record("amber", first)),
    )
    const repoEduRoot = join(directory, "repo-edu")
    const modelDirectory = join(repoEduRoot, "tools/architecture-check/src")
    await mkdir(modelDirectory, { recursive: true })
    await writeFile(
      join(modelDirectory, "area-model.json"),
      JSON.stringify({
        schemaVersion: 1,
        areas: [
          {
            id: "fixture-area",
            kind: "partition",
            name: "Fixture area",
            members: [{ type: "pattern", path: "^src/" }],
          },
        ],
      }),
    )
    const decision = await runGlance({
      cwd,
      repoEduRoot,
      repository: "repo-edu",
      cacheRoot,
      stem: "example",
    })
    assert.equal(decision.due, true)
    assert.match(decision.text, /area:fixture-area 2/)
    await assert.rejects(
      runGlance({
        cwd: directory,
        repoEduRoot,
        repository: "repo-edu",
        cacheRoot,
      }),
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

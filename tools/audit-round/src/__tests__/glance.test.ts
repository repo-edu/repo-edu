import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { execa } from "execa"
import {
  glanceDecision,
  type LogCommit,
  readLog,
  readWatchRecords,
  runGlance,
} from "../glance.js"
import { commitFixture } from "./round-fixture.js"

/** A log newest first; `sha` counts down so the recorded head reads as a position. */
function log(...subjects: (string | [string, string[]])[]): LogCommit[] {
  return subjects.map((entry, at) => {
    const [subject, files] = typeof entry === "string" ? [entry, []] : entry
    return {
      sha: `c${String(subjects.length - at).padStart(6, "0")}`,
      subject,
      files,
    }
  })
}

const record = (
  grade: "green" | "amber" | "red",
  horizon: number,
  head: string,
  repository: "repo-edu" | "plan" = "repo-edu",
) => ({
  example: {
    heads: { [repository]: head },
    grade,
    horizon,
    written: "2026-09-20",
  },
})

test("rule 1: no record, a missing repository head or a head off HEAD's history is due", () => {
  const history = log("example/impl-3 ath feat(x): s")
  for (const records of [
    null,
    {},
    { other: record("green", 4, "c000001").example },
    record("green", 4, "c000001", "plan"),
    // The pre-settlement record shape names one sha and no repository.
    { example: { sha: "c000001", grade: "red", horizon: 0, written: "x" } },
  ]) {
    const decision = glanceDecision(history, records, "repo-edu")
    assert.equal(decision.due, true)
    assert.match(decision.text, /no watch record for repo-edu.*rule 1/)
  }
  const moved = glanceDecision(
    history,
    record("green", 4, "deadbeef"),
    "repo-edu",
  )
  assert.equal(moved.due, true)
  assert.match(moved.text, /not on HEAD's history.*rule 1/)
})

test("rule 2: a red record is due every round, and a short or long head both find the commit", () => {
  const history = log("example/impl-3 ath feat(x): s")
  for (const head of ["c000001", "c0000", "c000001abc"]) {
    const decision = glanceDecision(history, record("red", 0, head), "repo-edu")
    assert.equal(decision.due, true)
    assert.match(decision.text, /rule 2/)
  }
})

test("rule 3: the distance counts episode commits since the head against the horizon", () => {
  const history = log(
    ["ath c1 fix(x): off-plan rework on a plan file", ["src/a.ts"]],
    ["ath c1 fix(y): touches another area", ["src/y.ts"]],
    ["ath c1 fix(z): touches nothing of the episode", ["src/z.ts"]],
    "example/impl-audit-all ath c1 fix(x): an audit fix, counted",
    "example/impl-2 ath feat(x): a step",
    ["example/impl-1 ath feat(x): the step that named src/a.ts", ["src/a.ts"]],
  )
  // The audit fix is inside the episode and counts like any other commit.
  const amber = glanceDecision(
    history,
    record("amber", 3, "c000001"),
    "repo-edu",
  )
  assert.equal(amber.due, true)
  assert.match(
    amber.text,
    /episode example recorded amber at c000001 with horizon 3; 3 episode commits since, 2 outside the episode\. The distance has reached the horizon of 3 \(rule 3\)/,
  )
  const wider = glanceDecision(
    history,
    record("amber", 4, "c000001"),
    "repo-edu",
  )
  assert.equal(wider.due, false)
  assert.match(wider.text, /No rule holds/)
  // Green carries the fixed horizon of four, whatever number the record holds.
  assert.equal(
    glanceDecision(history, record("green", 2, "c000001"), "repo-edu").due,
    false,
  )
  const later = history.map(
    (c) => [c.subject, [...c.files]] as [string, string[]],
  )
  assert.equal(
    glanceDecision(
      log("example/impl-5 ath feat(x): s", ...later),
      record("green", 9, "c000001"),
      "repo-edu",
    ).due,
    true,
  )
  // Four clean records after a green watch earn the next one on their own.
  const cleanRun = log(
    "example/impl-audit-all ath clean: s",
    "example/impl-audit-all oth clean: s",
    "example/impl-audit-all ath clean: s",
    "example/impl-audit-all oth clean: s",
    "example/impl-1 ath feat(x): s",
  )
  assert.equal(
    glanceDecision(cleanRun, record("green", 4, "c000001"), "repo-edu").due,
    true,
  )
  assert.equal(
    glanceDecision(cleanRun.slice(1), record("green", 4, "c000001"), "repo-edu")
      .due,
    false,
  )
})

test("rules 4 and 5: an uppercase A, three growth-high marks or two ordinary B marks are due", () => {
  const head = "c000001"
  /** Off-plan commits enter the episode through the file the step named. */
  const inside = (subject: string): [string, string[]] => [
    subject,
    ["src/a.ts"],
  ]
  const base: [string, string[]][] = [
    ["example/impl-1 ath feat(x): s", ["src/a.ts"]],
  ]
  const decide = (...subjects: [string, string[]][]) =>
    glanceDecision(
      log(...subjects, ...base),
      record("green", 4, head),
      "repo-edu",
    )
  const a = decide(inside("ath A1 redesign(x): s"), inside("ath c1 fix(x): s"))
  assert.equal(a.due, true)
  assert.match(a.text, /uppercase A \(rule 4\)/)
  // A lowercase a is developer-only and raises nothing; an audit fix that
  // lands an uppercase A is read like any other subject.
  assert.equal(decide(inside("ath a1 redesign(x): s")).due, false)
  const auditFix = decide(inside("example/impl-audit-2 ath A1 redesign(x): s"))
  assert.equal(auditFix.due, true)
  assert.match(auditFix.text, /uppercase A \(rule 4\)/)
  const growth = decide(
    inside("ath growth-high c1 feat(x): s"),
    inside("ath growth-high c1 feat(x): s"),
    inside("ath growth-high c1 feat(x): s"),
  )
  assert.equal(growth.due, true)
  assert.match(growth.text, /3 subjects carry growth-high \(rule 5\)/)
  assert.equal(
    decide(
      inside("ath growth-high c1 feat(x): s"),
      inside("ath growth-high c1 feat(x): s"),
    ).due,
    false,
  )
  const ordinary = decide(
    inside("ath !B1 fix(x): s"),
    inside("ath !B2c1 fix(x): s"),
  )
  assert.equal(ordinary.due, true)
  assert.match(
    ordinary.text,
    /2 subjects carry ! with an uppercase B \(rule 5\)/,
  )
  assert.equal(
    decide(inside("ath !B1 fix(x): s"), inside("ath B1 fix(x): s")).due,
    false,
  )
  // A subject the settled grammar refuses counts toward the distance and raises nothing.
  const old = decide(
    inside("c1 growth-high: feat(x): pre-settlement A1"),
    inside("A1 redesign(x): older still"),
  )
  assert.equal(old.due, false)
  assert.match(old.text, /2 episode commits since/)
})

test("the episode is the most recent stem on HEAD, joined across its historical prefixes", () => {
  const history = log(
    ["ath c1 fix(x): rework", ["docs/a.md"]],
    ["topology-example/impl-1 ath feat(x): old prefix", ["docs/a.md"]],
    "plan-example/init ath: older prefix",
  )
  const decision = glanceDecision(
    history,
    record("amber", 2, "c000001"),
    "repo-edu",
  )
  assert.equal(decision.due, true)
  assert.match(
    decision.text,
    /episode example .*2 episode commits since, 0 outside/,
  )
  // Without any stem the history is unstemmed under the key "-", and every commit counts.
  const bare = log("ath c1 fix(x): s", "ath c1 fix(y): s", "ath c1 fix(z): s")
  const unstemmed = glanceDecision(
    bare,
    {
      "-": {
        heads: { "repo-edu": "c000001" },
        grade: "amber",
        horizon: 2,
        written: "x",
      },
    },
    "repo-edu",
  )
  assert.equal(unstemmed.due, true)
  assert.match(
    unstemmed.text,
    /the unstemmed history recorded amber .*2 episode commits since, 0 outside/,
  )
  assert.equal(
    glanceDecision(bare, record("amber", 2, "c000001"), "repo-edu").due,
    true,
  )
  assert.match(
    glanceDecision(bare, record("amber", 2, "c000001"), "repo-edu").text,
    /no watch record/,
  )
})

test("the log reader lists commits newest first with the files each touched", async () => {
  const directory = await mkdtemp(join(tmpdir(), "glance-"))
  try {
    const cwd = join(directory, "repo")
    await mkdir(cwd)
    const first = await commitFixture(cwd, "example/init ath: fixture")
    await writeFile(join(cwd, "a.md"), "a\n")
    await mkdir(join(cwd, "src"))
    await writeFile(join(cwd, "src/b.ts"), "b\n")
    await execa("git", ["add", "."], { cwd })
    await execa(
      "git",
      [
        "-c",
        "user.name=T",
        "-c",
        "user.email=t@example.test",
        "-c",
        "core.hooksPath=/dev/null",
        "-c",
        "commit.gpgsign=false",
        "commit",
        "-q",
        "-m",
        "example/impl-1 ath feat(x): two files",
      ],
      { cwd },
    )
    const commits = await readLog(cwd)
    assert.equal(commits.length, 2)
    assert.deepEqual(commits[1], {
      sha: first,
      subject: "example/init ath: fixture",
      files: [],
    })
    assert.equal(commits[0].subject, "example/impl-1 ath feat(x): two files")
    assert.deepEqual([...commits[0].files].sort(), ["a.md", "src/b.ts"])
    // The cache and its record are optional; an unreadable record reads as none.
    const cacheRoot = join(directory, "cache")
    assert.equal(await readWatchRecords(cacheRoot), null)
    await mkdir(cacheRoot)
    await writeFile(join(cacheRoot, "watch.json"), "{broken")
    assert.equal(await readWatchRecords(cacheRoot), null)
    await writeFile(
      join(cacheRoot, "watch.json"),
      JSON.stringify(record("green", 4, first)),
    )
    assert.deepEqual(
      await readWatchRecords(cacheRoot),
      record("green", 4, first),
    )
    const decision = await runGlance({ cwd, repository: "repo-edu", cacheRoot })
    assert.equal(decision.due, false)
    assert.match(decision.text, /1 episode commits since/)
    await assert.rejects(
      runGlance({ cwd: directory, repository: "repo-edu", cacheRoot }),
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

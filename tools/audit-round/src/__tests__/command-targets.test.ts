import assert from "node:assert/strict"
import { mkdir, readdir, readFile, utimes, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { test } from "node:test"
import { runCommand } from "./configured-runner.js"
import { commitFixture, roundFixture } from "./round-fixture.js"

test("a brief without a transcript retells the newest round at the plan root", async (t) => {
  const f = await roundFixture(t)
  const brief = async () => {
    f.errors.length = 0
    return runCommand(["brief"], f.runtime, f.options)
  }
  assert.equal(await brief(), 1)
  assert.match(f.errors[0], /No round transcript/)
  const [older, newer] = ["example-02", "example-impl-07..07-01"].map((start) =>
    join(f.planRoot, `${start}-1-round.abx.md`),
  )
  await writeFile(older, "# Plan audit of example.md\n")
  await writeFile(newer, "# Implementation audit of example.md, step 7\n")
  // The later name carries the earlier date, so the date decides rather than the name.
  await utimes(older, 1_000, 1_000)
  assert.equal(await brief(), 0, f.errors.join("\n"))
  const log = await readFile(
    join(f.planRoot, "example-impl-07..07-01-6-brief.oul.log"),
    "utf8",
  )
  assert.ok(log.includes(JSON.stringify([newer, f.brief])))
})

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
  const before = await readdir(f.planRoot)
  assert.equal(
    await runCommand(["plan"], f.runtime, f.options),
    0,
    f.errors.join("\n"),
  )
  assert.deepEqual(f.visible, [join(f.planRoot, "example.md")])
  assert.deepEqual(await readdir(f.planRoot), before)
})

test("close archives the named plan through one close session from the plan checkout", async (t) => {
  const f = await roundFixture(t)
  const before = await readdir(f.planRoot)
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
    (await readdir(f.planRoot)).filter((name) => !before.includes(name)),
    ["example-close.ouh.log"],
  )
  const log = await readFile(join(f.planRoot, "example-close.ouh.log"), "utf8")
  assert.match(log, /Close of plan example\.md\n/)
  assert.match(log, /\[close\] starting codex \(fresh\)/)
  assert.ok(
    log.includes(
      "Run the close phase, the unattended loop-close of one plan, in this fresh session.",
    ),
  )
  assert.ok(
    log.includes(
      `Phase arguments (JSON array): ${JSON.stringify([join(f.planRoot, "example.md"), "ouh", "chosen-model high"])}`,
    ),
  )
  assert.ok(
    log.includes(
      `Workflow: ${join(f.planRoot, ".agents/skills/close/references/workflow.md")}`,
    ),
  )
  assert.doesNotMatch(log, /audit +codex|fix +codex|brief +codex/)
  assert.match(f.visible.join("\n"), /Close finished\./)
})

test("a finished close that left its plan at the root fails with a resume command", async (t) => {
  const f = await roundFixture(t)
  f.phases.close = { ...(f.phases.close as object), remove: [] }
  await f.configure({ phases: f.phases })
  assert.equal(await runCommand(["close"], f.runtime, f.options), 1)
  const log = await readFile(join(f.planRoot, "example-close.ouh.log"), "utf8")
  assert.match(
    log,
    /\[close\] failed: The finished close left .+example\.md at the plan root/,
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
  const log = await readFile(join(f.planRoot, "example-close.ouh.log"), "utf8")
  assert.ok(
    log.includes(
      `Phase arguments (JSON array): ${JSON.stringify([join(f.planRoot, "example.md"), "ouh", "chosen-model high", "The check cost more than it gave."])}`,
    ),
  )
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

test("a brief on its own retells the named transcript without a new round pair", async (t) => {
  const f = await roundFixture(t)
  const transcript = join(f.planRoot, "example-impl-07..07-01-1-round.abx.md")
  await writeFile(transcript, "# Implementation audit of example.md, step 7\n")
  assert.equal(
    await runCommand(
      ["brief", "example-impl-07..07-01-1-round.abx.md"],
      f.runtime,
      f.options,
    ),
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
    invocations.map((call) => call.assistant),
    ["codex"],
  )
  const names = (await readdir(f.planRoot)).filter((name) =>
    name.startsWith("example-impl-07..07-01-"),
  )
  const logName = names.find((name) => name.endsWith(".log")) as string
  assert.match(logName, /^example-impl-07\.\.07-01-6-brief\.oul\.log$/)
  assert.deepEqual(
    names.toSorted(),
    [
      logName,
      "example-impl-07..07-01-1-round.abx.md",
      "example-impl-07..07-01-6-brief.oul.md",
    ].toSorted(),
  )
  const log = await readFile(join(f.planRoot, logName), "utf8")
  assert.match(log, /Brief of example-impl-07\.\.07-01-1-round\.abx\.md\n/)
  assert.ok(
    log.includes(
      `Phase arguments (JSON array): ${JSON.stringify([transcript, f.brief])}`,
    ),
  )
  assert.match(log, /brief +codex +gpt-5\.6-terra +low/)
  assert.doesNotMatch(log, /audit +codex|fix +codex/)
  const visible = f.visible.join("\n")
  assert.equal(visible.includes("Complete brief text."), false)
  assert.equal(f.visible.filter((text) => text === "Written brief").length, 1)
  assert.match(log, /Written brief/)
  assert.match(visible, /Brief finished\./)
  assert.equal(
    await readFile(transcript, "utf8"),
    "# Implementation audit of example.md, step 7\n",
  )
})

test("a plan named without its extension runs as its .md file", async (t) => {
  const f = await roundFixture(t)
  assert.equal(
    await runCommand(
      ["example", "2-3", "--auditor", "o"],
      f.runtime,
      f.options,
    ),
    0,
    f.errors.join("\n"),
  )
  const { log } = await f.records()
  assert.ok(
    log.includes(
      `Phase arguments (JSON array): ${JSON.stringify([f.report, join(f.planRoot, "example.md"), "2-3"])}`,
    ),
  )
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
  assert.match(
    f.errors[0],
    /Landed steps: 1\. The implemented marker is missing in Repo Edu\./,
  )
  await commit(f.repoRoot, "example/impl-audit-2-3 ath clean: record", 0)
  assert.equal(await name(), 2)
  assert.match(f.errors[0], /Landed steps: 1\./)
  await commit(
    f.repoRoot,
    "example/impl-audit-2-3 ath growth-none c1 fix(x): correction",
    1,
  )
  assert.equal(
    await runCommand(["--no-watch", "--auditor", "o"], f.runtime, f.options),
    0,
    f.errors.join("\n"),
  )
  const { log } = await f.records()
  assert.ok(
    log.includes(
      `Phase arguments (JSON array): ${JSON.stringify([f.report, join(f.planRoot, "example.md"), "2-3"])}`,
    ),
  )
  // A plan round after the marker no longer decides; the finished steps do.
  await commit(f.repoRoot, "example/implemented ath: marker", 2)
  await commit(f.planRoot, "example/plan-audit ath clean: plan round", 3)
  assert.equal(await name(), 0, f.errors.join("\n"))
  assert.deepEqual(JSON.parse(f.visible[0]).arguments, [
    join(f.planRoot, "example-impl-all-01-2-audit.oth.md"),
    join(f.planRoot, "example.md"),
    "all",
  ])
})

test("a missing plan file is refused before any assistant starts", async (t) => {
  const f = await roundFixture(t)
  for (const name of ["missing", "missing.md"]) {
    assert.equal(await runCommand([name, "3"], f.runtime, f.options), 1)
    assert.match(f.errors.at(-1) as string, /No plan named missing/)
  }
  await assert.rejects(readFile(join(f.root, "calls.jsonl")), {
    code: "ENOENT",
  })
})

test("a brief on its own refuses a transcript that is not a Markdown file at the root", async (t) => {
  const f = await roundFixture(t)
  await writeFile(join(f.repoRoot, "ROUND-example-old.md"), "Old transcript")
  await writeFile(
    join(f.repoRoot, "../plan/example-01-1-round.oth.md"),
    "Peer transcript",
  )
  for (const name of [
    "missing.md",
    "pnpm-workspace.yaml",
    "ROUND-example-old.md",
  ]) {
    assert.equal(await runCommand(["brief", name], f.runtime, f.options), 1)
    assert.match(
      f.errors.at(-1) as string,
      /Name a round's \*-1-round\.<tag>\.md transcript/,
    )
  }
  await assert.rejects(readFile(join(f.root, "calls.jsonl")), {
    code: "ENOENT",
  })
})

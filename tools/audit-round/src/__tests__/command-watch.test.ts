import assert from "node:assert/strict"
import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { test } from "node:test"
import { namedModels, runCommand, testSettings } from "./configured-runner.js"
import { recorded } from "./helpers.js"
import { roundFixture } from "./round-fixture.js"

test("repeated auditor entries run beyond the old cap with one startup", async (t) => {
  const f = await roundFixture(t, "codex", "repo-edu", false, "b")
  assert.equal(
    await runCommand(
      ["example.md", "3", "--brief", "--auditor", "codex,codex,codex,codex"],
      f.runtime,
      f.options,
    ),
    0,
    f.errors.join("\n"),
  )
  const names = (await f.roundFiles()).toSorted()
  assert.deepEqual(names, [
    "example-impl-03..03-01-1-round.obh.log",
    "example-impl-03..03-01-1-round.obh.md",
    "example-impl-03..03-02-1-round.obh.log",
    "example-impl-03..03-02-1-round.obh.md",
    "example-impl-03..03-03-1-round.obh.log",
    "example-impl-03..03-03-1-round.obh.md",
    "example-impl-03..03-04-1-round.obh.log",
    "example-impl-03..03-04-1-round.obh.md",
  ])
  const invocations = (await f.calls()).filter(
    (call) =>
      call.args[0] === "exec" ||
      (call.args[0] === "-p" &&
        !call.args.includes("--no-session-persistence")),
  )
  // Four rounds of the five phases; the glance after each runs in the runner
  // and a finished fix opens no ruling.
  assert.equal(invocations.length, 20)
  const visible = f.visible.join("\n")
  assert.match(visible, /Next round: codex; 3 auditor entries remain\./)
  assert.match(visible, /Next round: codex; 2 auditor entries remain\./)
  assert.match(visible, /Auditor sequence finished after 4 rounds\./)
  // Updates and releases are read once for the run; later rounds still seat
  // their roles from the releases that first round resolved, one read per
  // model the settings may pin.
  assert.equal(
    (await f.calls()).filter((call) =>
      call.args.includes("--no-session-persistence"),
    ).length,
    namedModels("claude", testSettings).size,
  )
  const second = await readFile(join(f.planRoot, names[2]), "utf8")
  assert.match(
    second,
    /Implementation audit of .*example\.md, step 3 \(round 2\)/,
  )
  assert.match(second, /audit +codex +gpt-5\.6-sol +high/)
})

test("manual queues do not prune a setting from report prose", async (t) => {
  const f = await roundFixture(t, "codex", "repo-edu", false, "b")
  assert.equal(
    await runCommand(
      ["example.md", "1", "--auditor", "codex,o,otl,codex"],
      f.runtime,
      f.options,
    ),
    0,
    f.errors.join("\n"),
  )
  const audits = (await f.prompts()).filter((call) =>
    call.prompt.startsWith("Run the audit phase "),
  )
  assert.equal(audits.length, 4)
  const visible = f.visible.join("\n")
  assert.doesNotMatch(visible, /skipped .* queued entr/)
  assert.match(visible, /Next round: codex; 3 auditor entries remain\./)
})

test("manual queues preserve repeated non-clean settings", async (t) => {
  const f = await roundFixture(t, "codex", "repo-edu", false, "b")
  assert.equal(
    await runCommand(
      ["example.md", "1", "--auditor", "codex,o"],
      f.runtime,
      f.options,
    ),
    0,
    f.errors.join("\n"),
  )
  const audits = (await f.prompts()).filter((call) =>
    call.prompt.startsWith("Run the audit phase "),
  )
  assert.equal(audits.length, 2)
  const visible = f.visible.join("\n")
  assert.doesNotMatch(visible, /skipped .* queued entr/)
  assert.match(visible, /Next round: codex; 1 auditor entries remain\./)
})

test("a clean fix record does not skip later entries for the same auditor", async (t) => {
  const f = await roundFixture(t, "codex", "repo-edu", false, null)
  assert.equal(
    await runCommand(
      ["example.md", "1", "--auditor", "codex,codex,claude"],
      f.runtime,
      f.options,
    ),
    0,
    f.errors.join("\n"),
  )
  const names = (await f.roundFiles()).toSorted()
  assert.deepEqual(names, [
    "example-impl-01..01-01-1-round.obh.log",
    "example-impl-01..01-01-1-round.obh.md",
    "example-impl-01..01-02-1-round.obh.log",
    "example-impl-01..01-02-1-round.obh.md",
    "example-impl-01..01-03-1-round.abh.log",
    "example-impl-01..01-03-1-round.abh.md",
  ])
  const visible = f.visible.join("\n")
  assert.match(visible, /Next round: codex; 2 auditor entries remain\./)
  assert.match(visible, /Auditor sequence finished after 3 rounds\./)
})

test("a red watch stops the auditor sequence before the next queued round", async (t) => {
  // The fixture's record is red, and the watch leaves it red.
  const f = await roundFixture(t, "codex", "repo-edu", false, null, true)
  const queue = join(f.planRoot, "example-impl-01..01-queue.md")
  assert.equal(
    await runCommand(
      ["example.md", "1", "--auditor", "codex,claude"],
      f.runtime,
      f.options,
    ),
    0,
    f.errors.join("\n"),
  )
  const visible = f.visible.join("\n")
  assert.match(
    visible,
    /Auditor sequence stopped: the watch graded red\. Read .*-01-9-watch\.obh\.md before running more rounds\./,
  )
  assert.doesNotMatch(visible, /Next round:/)
  assert.equal((await f.roundFiles()).length, 2)
  await assert.rejects(readFile(queue), { code: "ENOENT" })
})

test("a due glance admits and publishes the returned watch without round session files", async (t) => {
  const f = await roundFixture(t, "codex", "repo-edu", false, null, true)
  assert.equal(
    await runCommand(["example.md", "3"], f.runtime, f.options),
    0,
    f.errors.join("\n"),
  )
  // The watch lands nothing of its own in the pair, so the round still writes two files.
  const { log, markdown, transcript } = await f.records()
  const watch = transcript.replace(/-1-round\.obh\.md$/, "-9-watch.obh.md")
  assert.match(
    log,
    /\n─{72}\n\[glance\] due: episode example recorded red at [0-9a-f]+\. A–C audit correction commits since: area:tool-audit-round 2\. An area reached the red limit of 2\./,
  )
  assert.ok(
    log.includes(
      join(f.repoRoot, ".agents/skills/watch/references/workflow.md"),
    ),
  )
  assert.ok(log.includes(`Phase arguments (JSON array): ${JSON.stringify([])}`))
  assert.doesNotMatch(log, /Source file: .*\/watch\/SKILL\.md/)
  assert.doesNotMatch(log, /watch-edit/)
  assert.equal(log.match(/\[watch\] starting/g)?.length, 1)
  assert.ok(log.includes(`[watch] finished`))
  // The watch follows the round it grades, so none of its text enters the transcript.
  assert.equal(markdown.includes("## watch ("), false)
  assert.ok(f.visible.join("\n").includes("Complete watch text."))
  assert.equal(
    await readFile(watch, "utf8"),
    "# Example: trajectory watch\n\nComplete watch text.\n",
  )
  const record = JSON.parse(
    await readFile(join(f.options.cacheRoot, "watch.json"), "utf8"),
  ).example
  const watchPrompt = (await f.prompts()).find((call) =>
    call.prompt.startsWith("Run the watch phase "),
  )?.prompt
  assert.ok(watchPrompt)
  const supplied = JSON.parse(
    watchPrompt.slice(watchPrompt.lastIndexOf("Joined watch evidence:\n") + 23),
  )
  const suppliedHeads = Object.fromEntries(
    supplied.repositories.map(
      (repository: { repository: string; head: string }) => [
        repository.repository,
        repository.head,
      ],
    ),
  )
  assert.equal(record.grade, "red")
  assert.deepEqual(record.heads, suppliedHeads)
  assert.match(f.visible.join("\n"), /Audit round finished\./)
})

test("a compacted watch publishes neither its document nor cadence record", async (t) => {
  const f = await roundFixture(t, "codex", "repo-edu", false, null, true)
  const watchPhase = f.phases.watch as {
    usage: { path: string; text: string }
  }
  watchPhase.usage.text = await recorded("codex-compacted.jsonl")
  await f.configure({ phases: f.phases })
  const before = await readFile(join(f.options.cacheRoot, "watch.json"), "utf8")

  assert.equal(await runCommand(["example.md", "3"], f.runtime, f.options), 1)

  assert.match(
    f.visible.join("\n"),
    /The watch compacted while reading \d+ characters of evidence; it needs one uncompacted session\. The next watch must start fresh\./,
  )
  assert.match(f.visible.join("\n"), /Session: watch-session/)
  assert.doesNotMatch(f.visible.join("\n"), /Resume:/)
  assert.equal(
    (await readdir(f.planRoot)).some((name) => /-9-watch\./.test(name)),
    false,
  )
  assert.equal(
    await readFile(join(f.options.cacheRoot, "watch.json"), "utf8"),
    before,
  )
})

for (const target of ["implementation", "planning", "commits"] as const) {
  test(`rounds without --brief omit briefs from ${target} rounds while preserving completion and watch`, async (t) => {
    const working = target === "planning" ? "plan" : "repo-edu"
    const f = await roundFixture(
      t,
      "codex",
      working,
      false,
      null,
      true,
      working,
    )
    const args =
      target === "commits"
        ? ["HEAD", "--no-watch"]
        : [
            "example.md",
            ...(target === "planning" ? [] : ["1"]),
            "--auditor",
            "codex,claude",
          ]
    assert.equal(
      await runCommand(args, f.runtime, f.options),
      0,
      f.errors.join("\n"),
    )
    const visible = f.visible.join("\n")
    assert.doesNotMatch(visible, /\[brief\]|^brief\s|Written brief/m)
    assert.equal(
      (await f.prompts()).some((call) =>
        call.prompt.startsWith("Run the brief phase "),
      ),
      false,
    )
    assert.match(visible, /Audit round finished\./)
    if (target !== "commits") {
      // The fixture's red record stops the sequence after the first watch.
      assert.match(visible, /Auditor sequence stopped: the watch graded red\./)
      assert.equal(visible.match(/\[watch\] finished/g)?.length, 1)
    }
    const files = await readdir(f.planRoot)
    assert.equal(
      files.some((name) => /-6-brief\./.test(name)),
      false,
    )
    assert.equal(
      files.some((name) => /-[123]-(audit|vet|rebut)\./.test(name)),
      false,
    )
    for (const name of await f.roundFiles()) {
      const text = await readFile(join(f.planRoot, name), "utf8")
      assert.doesNotMatch(text, /\[brief\]|^brief\s|Written brief/m)
      assert.match(text, /## fix|\[fix\] finished/)
    }
  })
}

test("--no-watch skips the glance and the watch, whatever the record says", async (t) => {
  const f = await roundFixture(t, "codex", "repo-edu", false, null, true)
  assert.equal(
    await runCommand(
      ["example.md", "3", "--no-watch", "--auditor", "o"],
      f.runtime,
      f.options,
    ),
    0,
    f.errors.join("\n"),
  )
  const { log } = await f.records()
  assert.doesNotMatch(log, /\[glance\]|\[watch\]/)
  assert.match(f.visible.join("\n"), /Audit round finished\./)
})

test("a chained run stops when the ruling receives no reply", async (t) => {
  const f = await roundFixture(t, "codex", "repo-edu", true)
  assert.equal(
    await runCommand(
      ["example.md", "1", "--auditor", "codex,claude"],
      f.runtime,
      f.options,
    ),
    0,
    f.errors.join("\n"),
  )
  assert.equal((await f.roundFiles()).length, 2)
  assert.match(
    f.visible.join("\n"),
    /Auditor sequence stopped: this round required your ruling\./,
  )
})

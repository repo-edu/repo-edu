import assert from "node:assert/strict"
import { readdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { test } from "node:test"
import { namedModels, runCommand, testSettings } from "./configured-runner.js"
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
    "example-impl-03..03-01-1-round.ouh.log",
    "example-impl-03..03-01-1-round.ouh.md",
    "example-impl-03..03-02-1-round.ouh.log",
    "example-impl-03..03-02-1-round.ouh.md",
    "example-impl-03..03-03-1-round.ouh.log",
    "example-impl-03..03-03-1-round.ouh.md",
    "example-impl-03..03-04-1-round.ouh.log",
    "example-impl-03..03-04-1-round.ouh.md",
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
  // Updates and settings are read once for the run; later rounds still seat
  // their roles from the selections that first round discovered. Claude's read
  // is its default plus one release for each model the settings may pin.
  assert.equal(
    (await f.calls()).filter((call) =>
      call.args.includes("--no-session-persistence"),
    ).length,
    1 + namedModels("claude", testSettings).size,
  )
  const second = await readFile(join(f.planRoot, names[2]), "utf8")
  assert.match(
    second,
    /Implementation audit of .*example\.md, step 3 \(round 2\)/,
  )
  assert.match(second, /audit +codex +chosen-model +high/)
})

test("a stop recommendation prunes its resolved setting and preserves another setting", async (t) => {
  const f = await roundFixture(t, "codex", "repo-edu", false, "b")
  await writeFile(
    f.report,
    (await readFile(f.report, "utf8")).replace(
      "Recommendation: continue with Codex. Another round is worth its cost.",
      "Recommendation: stop. Another round is unlikely to repay its cost.",
    ),
  )
  assert.equal(
    await runCommand(
      ["example.md", "all", "--auditor", "codex,o,otl,codex"],
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
  for (const argument of [
    "-m",
    "gpt-6-astra",
    "-c",
    "model_reasoning_effort=low",
  ])
    assert.ok(audits[1].args.includes(argument), audits[1].args.join(" "))
  const visible = f.visible.join("\n")
  assert.match(
    visible,
    /Recommendation: stop\. Another round is unlikely to repay its cost\./,
  )
  assert.match(
    visible,
    /Stop recommendation by codex on chosen-model high; skipped 2 queued entries with the same setting\./,
  )
  assert.match(visible, /Next round: codex; 1 auditor entries remain\./)
})

test("a continue recommendation preserves queued entries with the same setting", async (t) => {
  const f = await roundFixture(t, "codex", "repo-edu", false, "b")
  assert.equal(
    await runCommand(
      ["example.md", "all", "--auditor", "codex,o"],
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
  assert.match(
    visible,
    /Recommendation: continue with Codex\. Another round is worth its cost\./,
  )
  assert.doesNotMatch(visible, /skipped .* queued entr/)
  assert.match(visible, /Next round: codex; 1 auditor entries remain\./)
})

test("a clean fix record does not skip later entries for the same auditor", async (t) => {
  const f = await roundFixture(t, "codex", "repo-edu", false, null)
  assert.equal(
    await runCommand(
      ["example.md", "all", "--auditor", "codex,codex,claude"],
      f.runtime,
      f.options,
    ),
    0,
    f.errors.join("\n"),
  )
  const names = (await f.roundFiles()).toSorted()
  assert.deepEqual(names, [
    "example-impl-all-01-1-round.ouh.log",
    "example-impl-all-01-1-round.ouh.md",
    "example-impl-all-02-1-round.ouh.log",
    "example-impl-all-02-1-round.ouh.md",
    "example-impl-all-03-1-round.auh.log",
    "example-impl-all-03-1-round.auh.md",
  ])
  const visible = f.visible.join("\n")
  assert.match(visible, /Next round: codex; 2 auditor entries remain\./)
  assert.match(visible, /Auditor sequence finished after 3 rounds\./)
})

test("a red watch stops the auditor sequence before the next queued round", async (t) => {
  // The fixture's record is red, and the watch leaves it red.
  const f = await roundFixture(t, "codex", "repo-edu", false, null, true)
  const queue = join(f.planRoot, "example-impl-all-queue.md")
  assert.equal(
    await runCommand(
      ["example.md", "all", "--auditor", "codex,claude"],
      f.runtime,
      f.options,
    ),
    0,
    f.errors.join("\n"),
  )
  const visible = f.visible.join("\n")
  assert.match(
    visible,
    /Auditor sequence stopped: the watch graded red\. Read .*-01-9-watch\.ouh\.md before running more rounds\./,
  )
  assert.doesNotMatch(visible, /Next round:/)
  assert.equal((await f.roundFiles()).length, 2)
  await assert.rejects(readFile(queue), { code: "ENOENT" })
})

test("a due glance sends the watch the record and the cache, never the round", async (t) => {
  const f = await roundFixture(t, "codex", "repo-edu", false, null, true)
  assert.equal(
    await runCommand(["example.md", "3"], f.runtime, f.options),
    0,
    f.errors.join("\n"),
  )
  // The watch lands nothing of its own in the pair, so the round still writes two files.
  const { log, markdown, transcript } = await f.records()
  const watch = transcript.replace(/-1-round\.ouh\.md$/, "-9-watch.ouh.md")
  assert.match(
    log,
    /\n─{72}\n\[glance\] due: episode example recorded red at [0-9a-f]+\. A red record is re-read every round \(rule 1\)\./,
  )
  assert.ok(
    log.includes(
      join(f.repoRoot, ".agents/skills/watch/references/workflow.md"),
    ),
  )
  assert.ok(
    log.includes(
      `Phase arguments (JSON array): ${JSON.stringify([watch, f.options.cacheRoot])}`,
    ),
  )
  assert.doesNotMatch(log, /Source file: .*\/watch\/SKILL\.md/)
  assert.doesNotMatch(log, /watch-edit/)
  assert.equal(log.match(/\[watch\] starting/g)?.length, 1)
  assert.ok(log.includes(`[watch] finished`))
  // The watch follows the round it grades, so none of its text enters the transcript.
  assert.equal(markdown.includes("## watch ("), false)
  assert.ok(f.visible.join("\n").includes("Complete watch text."))
  assert.match(f.visible.join("\n"), /Audit round finished\./)
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
            ...(target === "planning" ? [] : ["all"]),
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
      ["example.md", "all", "--auditor", "codex,claude"],
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

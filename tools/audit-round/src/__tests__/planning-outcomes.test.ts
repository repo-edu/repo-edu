import assert from "node:assert/strict"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { test } from "node:test"
import { runCommand } from "../command.js"
import { phaseStream } from "./helpers.js"
import { roundFixture } from "./round-fixture.js"

for (const auditor of ["codex", "claude"] as const) {
  for (const tier of ["a", "b", "c", "d", null] as const) {
    test(`planning chain with ${auditor} and ${tier ?? "clean"} records repeats or crosses once`, async (t) => {
      const f = await roundFixture(
        t,
        auditor,
        "plan",
        false,
        tier,
        false,
        "plan",
      )
      assert.equal(
        await runCommand(
          [
            "example-widen.md",
            "--chain",
            "--auditor",
            auditor === "codex" ? "o" : "a",
          ],
          f.runtime,
          f.options,
        ),
        0,
        f.errors.join("\n"),
      )
      const repeats = tier === "a" || tier === "b"
      const rounds = repeats ? 3 : 2
      const files = (await f.roundFiles())
        .filter((name) => name.endsWith(".log"))
        .sort()
      assert.equal(files.length, rounds)
      for (const [index, file] of files.entries()) {
        const writer =
          index === 0 || repeats
            ? auditor
            : auditor === "codex"
              ? "claude"
              : "codex"
        assert.equal(
          file,
          `example-0${index + 1}-${writer === "codex" ? "ouh" : "auh"}-round.log`,
        )
        const log = await readFile(join(f.planRoot, file), "utf8")
        assert.match(log, /Audit round of plan example-widen\.md/)
        assert.ok(
          log.includes(
            `Phase arguments (JSON array): ${JSON.stringify([`example-0${index + 1}`, "example-widen.md"])}`,
          ),
        )
        assert.match(log, /\[glance\] finished/)
        assert.doesNotMatch(log, /\[(?:rule|watch)\] starting/)
      }
      const visible = f.visible.join("\n")
      assert.match(
        visible,
        repeats ? /3-round cap/ : /second assistant's round/,
      )
      const calls = await f.calls()
      assert.equal(
        calls.filter((call) => call.args.includes("--no-session-persistence"))
          .length,
        1,
      )
      for (const call of calls) assert.equal(call.cwd, f.planRoot)
      const fixes = calls.filter(
        (call) =>
          call.assistant === "codex" &&
          /^Run the fix phase /.test(call.args.at(-1)),
      )
      assert.deepEqual(
        fixes.map((call) => call.auditor),
        files.map((name) => (name.includes("-ouh-") ? "otx" : "ath")),
      )
    })
  }

  test(`a chained ${auditor} premise stop records recovery without a vet or watch`, async (t) => {
    const f = await roundFixture(t, auditor, "plan", false, null, false, "plan")
    await f.configure({
      phases: {
        audit: {
          ...(f.phases.audit as object),
          assistants: undefined,
          stream: await phaseStream(
            auditor,
            'Premise needs a decision.\nPHASE RESULT: {"status":"failed","file":null,"reason":"Premise conflict","tier":null,"due":null,"clean":null}',
            "audit-session",
          ),
        },
      },
    })
    assert.equal(
      await runCommand(
        ["example.md", "--chain", "--auditor", auditor === "codex" ? "o" : "a"],
        f.runtime,
        f.options,
      ),
      1,
    )
    const { log, markdown } = await f.records()
    assert.match(markdown, /Premise needs a decision/)
    assert.match(log, /\[audit\] failed: Premise conflict/)
    assert.doesNotMatch(
      log,
      /\[(?:vet|rebut|fix|brief|rule|glance|watch)\] starting/,
    )
    assert.ok(log.includes(`Resume: cd ${f.planRoot} && ${auditor}`))
    assert.match(log, /audit-session/)
    assert.match(f.visible.join("\n"), /Chain stopped: this round failed/)
  })

  test(`planning handover with ${auditor} stops the chain after the ruling rewrite`, async (t) => {
    const f = await roundFixture(t, auditor, "plan", true, null, true, "plan")
    assert.equal(
      await runCommand(
        ["example.md", "--chain", "--auditor", auditor === "codex" ? "o" : "a"],
        f.runtime,
        f.options,
      ),
      0,
    )
    const { log, transcript } = await f.records()
    assert.ok(
      log.includes(
        `Phase arguments (JSON array): ${JSON.stringify([transcript, f.report])}`,
      ),
    )
    assert.ok(log.includes(`[rule] finished: ${f.ruling}`))
    assert.doesNotMatch(log, /\[(?:glance|watch)\] starting/)
    assert.match(
      f.visible.join("\n"),
      /Chain stopped: this round opened a ruling session/,
    )
    const calls = await f.calls()
    const session = calls.at(-1)
    assert.equal(session.cwd, f.planRoot)
    assert.deepEqual(session.args, [
      "resume",
      "--approve-for-me",
      "fix-session",
    ])
    assert.equal(session.auditor, auditor === "codex" ? "otx" : "ath")
  })
}

for (const phase of [
  "vet",
  "rebut",
  "fix",
  "brief",
  "glance",
  "watch",
  "rule",
  "revise",
] as const) {
  test(`planning ${phase} failure ends the chain in the invoking repository`, async (t) => {
    const ruling = phase === "rule" || phase === "revise"
    const f = await roundFixture(
      t,
      "codex",
      "plan",
      ruling,
      null,
      !ruling,
      "plan",
    )
    f.phases[phase] = { stream: "", exitCode: 7 }
    await f.configure({ phases: f.phases })
    assert.equal(
      await runCommand(["example.md", "--chain"], f.runtime, f.options),
      1,
    )
    const { log } = await f.records()
    assert.ok(log.includes(`[${phase}] failed:`))
    assert.match(f.visible.join("\n"), /Chain stopped: this round failed/)
    assert.equal(
      (await f.calls()).some((call) => call.args[0] === "resume"),
      false,
    )
  })
}

for (const working of ["repo-edu", "plan"] as const) {
  for (const due of [false, true]) {
    test(`watch from ${working} receives shared history and working roots with due=${due}`, async (t) => {
      const f = await roundFixture(
        t,
        "codex",
        working,
        false,
        null,
        due,
        working,
      )
      await mkdir(f.options.cacheRoot)
      // Deliberately different repository positions must travel together. The
      // workflow interprets history; this boundary test checks its context.
      const history = JSON.stringify({
        example: {
          heads: { "repo-edu": "1234567", plan: "abcdef0" },
          grade: "amber",
          horizon: 3,
          written: "2026-09-18",
        },
      })
      const record = join(f.options.cacheRoot, "watch.json")
      await writeFile(record, history)
      assert.equal(
        await runCommand(
          [working === "plan" ? "./example.md" : "../plan/example.md"],
          f.runtime,
          f.options,
        ),
        0,
      )
      const { log, markdown, transcript } = await f.records()
      assert.ok(
        log.includes(
          `Phase arguments (JSON array): ${JSON.stringify([f.options.cacheRoot])}`,
        ),
      )
      assert.ok(log.includes(`Working directory: ${f.runtime.cwd}`))
      assert.ok(log.includes(`Repo Edu checkout: ${f.repoRoot}`))
      assert.ok(log.includes(`Plan checkout: ${f.planRoot}`))
      assert.ok(log.includes(join(f.repoRoot, ".claude/commands/glance.md")))
      assert.equal(log.includes("[watch] starting"), due)
      if (due) {
        const watch = transcript.replace("-ouh-round.md", "-auh-watch.md")
        assert.ok(
          log.includes(
            `Phase arguments (JSON array): ${JSON.stringify([watch, f.options.cacheRoot])}`,
          ),
        )
        assert.ok(
          log.includes(
            `Phase arguments (JSON array): ${JSON.stringify([join(f.repoRoot, ".agents/skills/watch/references/workflow.md"), f.watch])}`,
          ),
        )
        assert.ok(
          log.indexOf("[brief] finished") < log.indexOf("[glance] starting"),
        )
        assert.ok(
          log.indexOf("[watch] finished") < log.indexOf("[revise] starting"),
        )
      }
      assert.doesNotMatch(markdown, /## (?:glance|watch|revise) /)
      assert.equal(await readFile(record, "utf8"), history)
      for (const call of await f.calls()) assert.equal(call.cwd, f.runtime.cwd)
    })
  }
}

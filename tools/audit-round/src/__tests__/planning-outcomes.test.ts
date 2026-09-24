import assert from "node:assert/strict"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { test } from "node:test"
import { split } from "shellwords"
import { runCommand } from "./configured-runner.js"
import { phaseStream } from "./helpers.js"
import { roundFixture } from "./round-fixture.js"

for (const auditor of ["codex", "claude"] as const) {
  for (const tier of ["a", "b", "c", "d", null] as const) {
    test(`planning chain with ${auditor} and ${tier ?? "clean"} follows the requested sequence regardless of landed severity`, async (t) => {
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
            "--auditor",
            auditor === "codex" ? "o,a,a" : "a,o,o",
          ],
          f.runtime,
          f.options,
        ),
        0,
        f.errors.join("\n"),
      )
      const rounds = 3
      const files = (await f.roundFiles())
        .filter((name) => name.endsWith(".log"))
        .sort()
      assert.equal(files.length, rounds)
      for (const [index, file] of files.entries()) {
        const writer =
          index === 0 ? auditor : auditor === "codex" ? "claude" : "codex"
        assert.equal(
          file,
          `example-0${index + 1}-0-round.${writer === "codex" ? "ouh" : "auh"}.log`,
        )
        const log = await readFile(join(f.planRoot, file), "utf8")
        assert.match(log, /Audit round of plan example-widen\.md/)
        assert.ok(
          log.includes(
            `Phase arguments (JSON array): ${JSON.stringify([join(f.planRoot, file.replace("-0-round.", "-1-audit.").replace(".log", ".md")), "example-widen.md"])}`,
          ),
        )
        assert.match(log, /\[glance\] not due: episode example recorded green/)
        assert.doesNotMatch(log, /\[(?:rule|watch)\] starting/)
      }
      const visible = f.visible.join("\n")
      assert.match(visible, /Auditor sequence finished after 3 rounds/)
      const calls = await f.calls()
      assert.equal(
        calls.filter((call) => call.args.includes("--no-session-persistence"))
          .length,
        1,
      )
      for (const call of calls) assert.equal(call.cwd, f.planRoot)
      const fixes = (await f.prompts()).filter(
        (call) =>
          call.assistant === "codex" && /^Run the fix phase /.test(call.prompt),
      )
      assert.deepEqual(
        fixes.map((call) => call.auditor),
        files.map((name) => (name.includes(".ouh.") ? "oth" : "ath")),
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
            'Premise needs a decision.\nPHASE RESULT: {"status":"failed","reason":"Premise conflict"}',
            "audit-session",
          ),
        },
      },
    })
    assert.equal(
      await runCommand(
        ["example.md", "--auditor", auditor === "codex" ? "o,a" : "a,o"],
        f.runtime,
        f.options,
      ),
      1,
    )
    const { log, markdown } = await f.records()
    assert.match(markdown, /Premise needs a decision/)
    assert.match(log, /\[audit\] failed: Premise conflict/)
    assert.doesNotMatch(log, /\[(?:vet|rebut|fix|brief|rule|watch)\] starting/)
    assert.deepEqual(split(log.match(/^Resume: (.+)$/m)?.[1]), [
      "cd",
      f.planRoot,
      "&&",
      auditor,
      ...(auditor === "codex"
        ? ["resume", "--approve-for-me", "audit-session"]
        : [
            "--resume",
            "audit-session",
            "--permission-mode",
            "auto",
            "--add-dir",
            f.repoRoot,
          ]),
    ])
    assert.match(
      f.visible.join("\n"),
      /Auditor sequence stopped: this round failed/,
    )
  })

  test(`planning ruling with ${auditor} stops the chain after the fix writes its ruling`, async (t) => {
    const f = await roundFixture(t, auditor, "plan", true, null, true, "plan")
    assert.equal(
      await runCommand(
        ["example.md", "--auditor", auditor === "codex" ? "o,a" : "a,o"],
        f.runtime,
        f.options,
      ),
      0,
    )
    const { log } = await f.records()
    assert.ok(
      log.includes(
        `Ruling output path (JSON string): ${JSON.stringify(f.ruling)}`,
      ),
    )
    assert.doesNotMatch(log, /\[rule(?:-edit)?\] starting/)
    assert.doesNotMatch(log, /\[glance\]|\[watch\] starting/)
    assert.match(
      f.visible.join("\n"),
      /Auditor sequence stopped: this round required your ruling/,
    )
    const calls = await f.calls()
    const session = calls.at(-1)
    assert.equal(session.cwd, f.planRoot)
    assert.equal(session.args[0], "exec")
    assert.equal(
      calls.some((call) => call.args[0] === "resume"),
      false,
    )
    assert.ok(f.visible.includes("Written ruling by fix"))
    assert.equal(session.auditor, auditor === "codex" ? "oth" : "ath")
  })
}

for (const phase of [
  "vet",
  "rebut",
  "fix",
  "brief",
  "watch",
  "watch-edit",
] as const) {
  test(`planning ${phase} failure ends the chain in the invoking repository`, async (t) => {
    const f = await roundFixture(t, "codex", "plan", false, null, true, "plan")
    f.phases[phase] = { stream: "", exitCode: 7 }
    await f.configure({ phases: f.phases })
    assert.equal(
      await runCommand(
        ["example.md", "--auditor", "codex,claude"],
        f.runtime,
        f.options,
      ),
      1,
    )
    const { log } = await f.records()
    assert.ok(log.includes(`[${phase}] failed:`))
    assert.match(
      f.visible.join("\n"),
      /Auditor sequence stopped: this round failed/,
    )
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
      // Deliberately different repository positions travel together, and the
      // glance counts from the invoking repository's own head. Red is what
      // makes the watch due without a correction to count.
      const history = JSON.stringify({
        example: {
          heads: { "repo-edu": f.heads["repo-edu"], plan: f.heads.plan },
          grade: due ? "red" : "amber",
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
      assert.match(
        log,
        due
          ? new RegExp(
              `\\[glance\\] due: episode example recorded red at ${f.heads[working]}\\. A red record is re-read every round`,
            )
          : new RegExp(
              `\\[glance\\] not due: episode example recorded amber at ${f.heads[working]}\\. No A–C correction commits since`,
            ),
      )
      assert.equal(log.includes("[watch] starting"), due)
      if (due) {
        const watch = transcript.replace("-0-round.ouh.md", "-8-watch.ouh.md")
        assert.ok(
          log.includes(
            `Phase arguments (JSON array): ${JSON.stringify([watch, f.options.cacheRoot])}`,
          ),
        )
        assert.ok(
          log.includes(
            `Phase arguments (JSON array): ${JSON.stringify([f.watch])}`,
          ),
        )
        assert.ok(
          log.includes(join(f.repoRoot, ".agents/skills/watch-edit/SKILL.md")),
        )
        assert.ok(log.indexOf("[brief] finished") < log.indexOf("[glance] due"))
        assert.ok(log.includes(`Working directory: ${f.runtime.cwd}`))
        assert.ok(log.includes(`Repo Edu checkout: ${f.repoRoot}`))
        assert.ok(log.includes(`Plan checkout: ${f.planRoot}`))
        assert.ok(
          log.indexOf("[watch] finished") <
            log.indexOf("[watch-edit] starting"),
        )
      }
      assert.doesNotMatch(markdown, /## (?:watch|watch-edit) /)
      assert.equal(await readFile(record, "utf8"), history)
      for (const call of await f.calls()) assert.equal(call.cwd, f.runtime.cwd)
    })
  }
}

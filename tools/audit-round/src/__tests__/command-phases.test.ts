import assert from "node:assert/strict"
import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { test } from "node:test"
import { execa } from "execa"
import { roundDataSchema } from "../round-data.js"
import { openRunFiles } from "../run-files.js"
import { runCommand, testSettings } from "./configured-runner.js"
import { recordedTag, recordedText } from "./helpers.js"
import { roundFixture } from "./round-fixture.js"

test("one supplied configuration controls auditor phase arguments and output tags", async (t) => {
  const f = await roundFixture(t, "claude", "repo-edu", false, null, true)
  const settings = structuredClone(testSettings)
  settings.defaultAuditor = "claude"
  settings.phases.audit.claude = { model: "chosen-auditor", effort: "low" }
  settings.phases.watch = {
    assistant: "codex",
    model: "chosen-watch",
    effort: "medium",
  }
  settings.strengthModels.codex.top = "chosen-watch"
  assert.equal(
    await runCommand(["example.md", "3", "--auditor", "a"], f.runtime, {
      ...f.options,
      settings,
    }),
    0,
  )
  const { log, transcript } = await f.records()
  assert.ok(transcript.endsWith("-1-round.aul.md"))
  assert.match(log, /audit +claude +chosen-auditor +low +audit-round settings/)
  assert.match(log, /watch +codex +chosen-watch +medium +audit-round settings/)
  assert.doesNotMatch(log, /watch-edit/)
  const watchCall = (await f.prompts()).find(
    (call) =>
      call.assistant === "codex" && /^Run the watch phase /.test(call.prompt),
  )
  assert.ok(watchCall.args.includes("chosen-watch"))
  assert.ok(watchCall.args.includes("model_reasoning_effort=medium"))
  assert.ok(watchCall.prompt.includes("-9-watch.otm.md"))
})

for (const auditor of ["claude", "codex"] as const) {
  for (const owner of ["repo-edu", "plan"] as const) {
    for (const ruling of [false, true]) {
      test(`command runs ${auditor} audit, ${owner} routing and ${ruling ? "ruling" : "completion"}`, async (t) => {
        const f = await roundFixture(t, auditor, owner, ruling)
        const { repoRoot } = f
        const argv = [
          "example.md",
          "2-3",
          "--brief",
          "--auditor",
          auditor === "claude" ? "a" : "o",
        ]
        assert.equal(
          await runCommand(argv, { ...f.runtime, cwd: f.planRoot }, f.options),
          0,
          f.errors.join("\n"),
        )
        const calls = await f.calls()
        const invocations = calls.filter(
          (call) =>
            call.args[0] === "exec" ||
            (call.args[0] === "-p" &&
              !call.args.includes("--no-session-persistence")),
        )
        assert.deepEqual(
          invocations.map((call) => call.assistant),
          [
            auditor,
            auditor === "codex" ? "claude" : "codex",
            auditor,
            "codex",
            ...(ruling ? [] : ["codex"]),
          ],
        )
        assert.equal(
          invocations[0].args.includes("resume") ||
            invocations[0].args.includes("--resume"),
          false,
        )
        assert.equal(
          invocations[1].args.includes("resume") ||
            invocations[1].args.includes("--resume"),
          false,
        )
        assert.equal(invocations[2].args.includes("resume"), false)
        assert.equal(invocations[2].args.includes("--resume"), false)
        assert.equal(invocations[3].args.includes("resume"), false)
        // The fix commits the round, so it carries the round's commit stamps:
        // the phases grouped by what they ran on, and the auditor's capability
        // tag. The phase reports take precedence over the startup settings.
        const stamps = {
          phases:
            auditor === "codex"
              ? `audit, rebut: ${recordedText("codex")}\nvet: ${recordedText("claude")}\nfix: chosen-model high\nAudit, vet and rebuttal took 0 min.`
              : `audit, rebut: ${recordedText("claude")}\nvet: ${recordedText("codex")}\nfix: chosen-model high\nAudit, vet and rebuttal took 0 min.`,
          auditor: recordedTag(auditor),
        }
        assert.deepEqual(
          {
            phases: invocations[3].phases,
            auditor: invocations[3].auditor,
          },
          stamps,
        )
        if (ruling)
          assert.equal(
            calls.some((call) => call.args[0] === "resume"),
            false,
          )
        assert.ok(
          calls
            .filter(
              (call) =>
                call.assistant === "codex" &&
                ["exec", "resume"].includes(call.args[0]),
            )
            .every((call) => call.args.includes("--approve-for-me")),
        )
        const { log, markdown, transcript } = await f.records()
        for (const path of [f.report, f.vet, f.rebut]) {
          if (ruling) {
            const text = await readFile(path, "utf8")
            assert.ok(text.length > 0)
            assert.doesNotMatch(text, /PHASE RESULT:/)
            assert.ok(markdown.includes(text.trimEnd()))
          } else await assert.rejects(readFile(path), { code: "ENOENT" })
        }
        const visible = f.visible.join("\n")
        assert.doesNotMatch(visible, /PHASE RESULT:/)
        // The run's rule is heavier than the phase rule and boxes the run in,
        // whether the round finished or handed over for a ruling.
        assert.match(log, /\n═{72}\n[^\n]+\nStarted \d{4}-/)
        assert.match(log, /(finished\.|retained\.\n[^\n]+)\n═{72}\n/)
        assert.equal(log.match(/═{72}/g)?.length, 2)
        assert.doesNotMatch(log, /─{72}\n[^\n]*\nStarted /)
        // A round that handed over has not proved its work landed, so it never glances.
        assert.equal(log.includes("[glance]"), !ruling)
        if (!ruling)
          assert.match(
            log,
            /\[glance\] not due: episode example recorded green at [0-9a-f]+\. No A–C audit correction commits since\. No area reached the green limit of 3/,
          )
        assert.match(log, /fix +codex +chosen-model +high/)
        assert.match(log, /brief +codex +gpt-5\.6-terra +low/)
        for (const phase of ["audit", "vet", "rebut", "fix"] as const) {
          assert.ok(markdown.includes(`## ${phase} (`))
          const text = {
            audit: "Judged repos:",
            vet: "1. [B] Revise",
            rebut: "Written rebut",
            fix: "Complete fix text.",
          }[phase]
          assert.ok(markdown.includes(text))
          assert.ok(visible.includes(text))
          assert.equal(log.includes(text), false)
        }
        // The brief retells the transcript, so the transcript never carries it.
        assert.equal(markdown.includes("## brief ("), false)
        assert.equal(markdown.includes("Complete brief text."), false)
        assert.equal(visible.includes("Complete brief text."), false)
        assert.equal(
          f.visible.filter((text) => text === "Written brief").length,
          ruling ? 0 : 1,
        )
        assert.equal(log.includes("Written brief"), !ruling)
        assert.equal(markdown.includes("Written brief"), false)
        assert.ok(
          log.includes(
            `Phase arguments (JSON array): ${JSON.stringify([f.report, join(f.planRoot, "example.md"), "2-3"])}`,
          ),
        )
        assert.equal(
          log.includes(
            `Phase arguments (JSON array): ${JSON.stringify([transcript, f.brief])}`,
          ),
          !ruling,
        )
        assert.equal(
          log.includes(
            join(repoRoot, ".agents/skills/brief-round/references/workflow.md"),
          ),
          !ruling,
        )
        assert.equal(log.includes(`[brief] finished`), !ruling)
        for (const args of [
          [f.report, f.vet],
          [f.report, f.vet, f.rebut],
        ]) {
          assert.ok(
            log.includes(
              `Phase arguments (JSON array): ${JSON.stringify(args)}`,
            ),
          )
        }
        assert.ok(
          log.includes(join(f.planRoot, "home/agents/skills/fix/SKILL.md")),
        )
        assert.match(log, /audit-round-probe-error/)
        assert.equal(visible.includes("audit-round-probe-error"), false)
        assert.equal(log.includes("\u001b"), false)
        if (ruling) {
          assert.ok(visible.includes("Written ruling by fix"))
          assert.ok(
            log.includes(
              `Ruling output path (JSON string): ${JSON.stringify(f.ruling)}`,
            ),
          )
          assert.doesNotMatch(log, /\[rule(?:-edit)?\] starting/)
          assert.doesNotMatch(log, /\[brief\] starting/)
          assert.match(visible, /Stopped without a ruling/)
          assert.doesNotMatch(visible, /Opening codex session/)
          assert.doesNotMatch(visible, /Audit round finished\./)
        } else assert.match(visible, /Audit round finished\./)
        assert.ok(f.clears() >= 4)
      })
    }
  }
}

for (const auditor of ["claude", "codex"] as const) {
  test(`a clean ${auditor} audit records only its auditor without later sessions`, async (t) => {
    const f = await roundFixture(
      t,
      auditor,
      "plan",
      false,
      null,
      false,
      "repo-edu",
      true,
    )
    const argv = [
      "example.md",
      "2-3",
      "--auditor",
      auditor === "claude" ? "a" : "o",
    ]
    assert.equal(
      await runCommand(argv, f.runtime, f.options),
      0,
      f.errors.join("\n"),
    )
    const calls = await f.calls()
    const invocations = calls.filter(
      (call) =>
        call.args[0] === "exec" ||
        (call.args[0] === "-p" &&
          !call.args.includes("--no-session-persistence")),
    )
    assert.deepEqual(
      invocations.map((call) => call.assistant),
      [auditor],
    )
    const commit = (
      await execa("git", ["log", "-1", "--format=%s%n%b"], { cwd: f.planRoot })
    ).stdout
    assert.match(
      commit,
      new RegExp(`^example/impl-audit-2-3 ${recordedTag(auditor)} clean:`),
    )
    assert.ok(commit.includes(`audit: ${recordedText(auditor)}`))
    assert.doesNotMatch(commit, /fix:|vet:|rebut:/)
    const { log, markdown } = await f.records()
    assert.doesNotMatch(
      log,
      /\[(?:vet|rebut|fix|brief|rule|watch)\] starting|\[glance\]/,
    )
    assert.match(markdown, /## Clean completion/)
    assert.match(f.visible.join("\n"), /Audit round finished\./)
  })
}

for (const auditor of ["claude", "codex"] as const) {
  test(`a vet that accepts every ${auditor} finding skips the rebuttal, and the fix stamps only the phases that ran`, async (t) => {
    const f = await roundFixture(
      t,
      auditor,
      "plan",
      false,
      "b",
      false,
      "repo-edu",
      false,
      true,
    )
    const argv = [
      "example.md",
      "2-3",
      "--brief",
      "--auditor",
      auditor === "claude" ? "a" : "o",
    ]
    assert.equal(
      await runCommand(argv, f.runtime, f.options),
      0,
      f.errors.join("\n"),
    )
    const calls = await f.calls()
    const invocations = calls.filter(
      (call) =>
        call.args[0] === "exec" ||
        (call.args[0] === "-p" &&
          !call.args.includes("--no-session-persistence")),
    )
    const vetter = auditor === "codex" ? "claude" : "codex"
    assert.deepEqual(
      invocations.map((call) => call.assistant),
      [auditor, vetter, "codex", "codex"],
    )
    // The auditor had nothing to answer, so the rebuttal that never ran is
    // not stamped into the record.
    assert.deepEqual(
      { phases: invocations[2].phases, auditor: invocations[2].auditor },
      {
        phases:
          auditor === "codex"
            ? `audit: ${recordedText("codex")}\nvet: ${recordedText("claude")}\nfix: chosen-model high\nAudit and vet took 0 min.`
            : `audit: ${recordedText("claude")}\nvet: ${recordedText("codex")}\nfix: chosen-model high\nAudit and vet took 0 min.`,
        auditor: recordedTag(auditor),
      },
    )
    const { log, markdown } = await f.records()
    assert.doesNotMatch(log, /\[rebut\] starting/)
    const files = await readdir(f.planRoot)
    assert.equal(
      files.some((name) => name.includes("-4-rebut.")),
      false,
    )
    assert.ok(files.includes("example-impl-02..03-01-6-brief.oul.md"))
    for (const phase of ["audit", "vet", "fix"] as const)
      assert.ok(markdown.includes(`## ${phase} (`))
    assert.equal(markdown.includes("## rebut ("), false)
    assert.match(f.visible.join("\n"), /Audit round finished\./)
  })
}

for (const phase of ["audit", "vet", "rebut", "fix", "brief"] as const) {
  test(`command stops at ${phase} failure and retains recovery evidence`, async (t) => {
    const f = await roundFixture(t)
    f.phases[phase] = { stream: "", exitCode: 7 }
    await f.configure({ phases: f.phases })
    assert.equal(
      await runCommand(
        ["example.md", "all", "--brief", "--auditor", "o"],
        f.runtime,
        f.options,
      ),
      1,
    )
    const log = (await f.records()).log
    assert.match(log, new RegExp(`\\[${phase}\\] failed:`))
    for (const output of [log, f.visible.join("\n")])
      assert.doesNotMatch(output, /Files at repository roots:/)
    assert.match(log, /Session: unavailable/)
    assert.doesNotMatch(log, /^Resume:/m)
    const calls = (await f.calls()).filter(
      (call) =>
        call.args[0] === "exec" ||
        (call.args[0] === "-p" &&
          !call.args.includes("--no-session-persistence")),
    )
    assert.equal(
      calls.length,
      ["audit", "vet", "rebut", "fix", "brief"].indexOf(phase) + 1,
    )
  })
}

for (const target of ["log", "markdown"] as const) {
  test(`required ${target} write failure stops the command and awaits the active child`, async (t) => {
    const f = await roundFixture(t)
    const phases = {
      ...f.phases,
      audit: { ...(f.phases.audit as object), wait: true },
    }
    await f.configure({ phases })
    const code = await runCommand(["example.md", "all"], f.runtime, {
      ...f.options,
      openFiles(paths) {
        const files = openRunFiles(paths)
        const write = files[target] as (text: string) => void
        return {
          ...files,
          [target]: (text: string) => {
            if (
              text.includes(
                target === "log" ? "printf audit-round-probe" : "Judged repos:",
              )
            )
              throw new Error(`Required ${target} write failed`)
            write(text)
          },
        }
      },
    })
    assert.equal(code, 1)
    assert.ok(f.visible.join("\n").includes(`Required ${target} write failed`))
    const calls = await f.calls()
    assert.equal(calls.filter((call) => call.args[0] === "exec").length, 1)
    assert.throws(() => process.kill(calls.at(-1).pid, 0), { code: "ESRCH" })
    const dataName = (await readdir(f.planRoot)).find((name) =>
      /-1-round\.[ao][btu][lmhx]\.json$/.test(name),
    )
    assert.ok(dataName)
    const data = roundDataSchema.parse(
      JSON.parse(await readFile(join(f.planRoot, dataName), "utf8")),
    )
    assert.deepEqual(data.commits, [])
    assert.equal(data.phases.at(-1)?.phase, "audit")
    assert.ok(f.clears() > 0)
  })
}

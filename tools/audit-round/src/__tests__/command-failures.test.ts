import assert from "node:assert/strict"
import { mkdir, readdir, readFile, symlink, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { test } from "node:test"
import { split } from "shellwords"
import { runCommand } from "./configured-runner.js"
import { phaseStream, recordedTag, recordedText } from "./helpers.js"
import { commitFixture, roundFixture } from "./round-fixture.js"

test("a single explicit auditor claims one round", async (t) => {
  const f = await roundFixture(t, "codex", "repo-edu", false, "b")
  assert.equal(
    await runCommand(
      ["example.md", "3", "--auditor", "o"],
      f.runtime,
      f.options,
    ),
    0,
    f.errors.join("\n"),
  )
  const names = await f.roundFiles()
  assert.equal(names.length, 2)
  assert.ok(
    names.every((name) =>
      name.startsWith("example-impl-03..03-01-1-round.ouh."),
    ),
  )
  assert.doesNotMatch(f.visible.join("\n"), /Chain/)
})

for (const auditor of ["codex", "claude"] as const) {
  for (const ruling of [false, true]) {
    test(`planning from Repo Edu keeps every session at the plan root with ${auditor} auditing and ruling=${ruling}`, async (t) => {
      const f = await roundFixture(
        t,
        auditor,
        "plan",
        ruling,
        null,
        false,
        "plan",
      )
      assert.equal(
        await runCommand(
          [
            "example-widen.md",
            "--brief",
            "--auditor",
            auditor === "codex" ? "o" : "a",
          ],
          { ...f.runtime, cwd: f.repoRoot },
          f.options,
        ),
        0,
        f.errors.join("\n"),
      )
      const { log, transcript } = await f.records()
      assert.equal(
        transcript,
        join(
          f.planRoot,
          `example-plan-01-1-round.${auditor === "codex" ? "ouh" : "auh"}.md`,
        ),
      )
      assert.match(log, /Plan audit of .*example\.md/)
      assert.ok(
        log.includes(
          `Phase arguments (JSON array): ${JSON.stringify([f.report, join(f.planRoot, "example.md")])}`,
        ),
      )
      const calls = await f.calls()
      for (const call of calls) assert.equal(call.cwd, f.planRoot)
      const phases = calls.filter(
        (call) =>
          call.args[0] === "exec" ||
          (call.args[0] === "-p" &&
            !call.args.includes("--no-session-persistence")),
      )
      for (const call of phases.filter((call) => call.assistant === "claude"))
        assert.equal(call.args[call.args.indexOf("--add-dir") + 1], f.repoRoot)
      for (const phase of ["audit", "vet", "rebut", "fix"]) {
        const launcher =
          phase === "fix" ||
          (phase === "vet" ? auditor === "claude" : auditor === "codex")
            ? join(f.planRoot, `home/agents/skills/${phase}/SKILL.md`)
            : join(f.planRoot, `home/claude/commands/${phase}.md`)
        assert.ok(log.includes(launcher), launcher)
      }
      assert.equal(
        log.includes(
          join(f.repoRoot, ".agents/skills/brief-round/references/workflow.md"),
        ),
        !ruling,
      )
      assert.ok(
        log.includes(
          `${f.repoRoot}/.agents/references/round-protocol.md#runner-result`,
        ),
      )
      assert.match(log, /unattended planning round/)
      assert.ok(log.includes(`Repo Edu checkout: ${f.repoRoot}`))
      assert.ok(log.includes(`Plan checkout: ${f.planRoot}`))
      const fixCall = phases[3]
      assert.equal(fixCall.assistant, "codex")
      assert.equal(fixCall.args.includes("resume"), false)
      assert.deepEqual(
        { phases: fixCall.phases, auditor: fixCall.auditor },
        {
          phases:
            auditor === "codex"
              ? `audit, rebut: ${recordedText("codex")}\nvet: ${recordedText("claude")}\nfix: chosen-model high\nAudit, vet and rebuttal took 0 min.`
              : `audit, rebut: ${recordedText("claude")}\nvet: ${recordedText("codex")}\nfix: chosen-model high\nAudit, vet and rebuttal took 0 min.`,
          auditor: recordedTag(auditor),
        },
      )
      if (ruling) {
        assert.ok(
          log.includes(`${f.repoRoot}/.agents/skills/fix/references/ruling.md`),
        )
        assert.deepEqual(split(log.match(/^Resume: (.+)$/m)?.[1]), [
          "cd",
          f.planRoot,
          "&&",
          "codex",
          "resume",
          "--approve-for-me",
          "fix-session",
        ])
      }
      assert.equal(
        (await readdir(f.repoRoot)).some((name) =>
          /-(?:1-round\.[ao][btu][lmhx]\.(?:md|log)|0-claim\.md)$/.test(name),
        ),
        false,
      )
    })
  }
}

for (const working of ["repo-edu", "plan"] as const) {
  test(`name uses the same target grammar from ${working}`, async (t) => {
    const f = await roundFixture(
      t,
      "codex",
      working,
      false,
      null,
      false,
      working,
      false,
      false,
      false,
    )
    const name = (args: readonly string[]) =>
      runCommand(["name", ...args, "--auditor", "oth"], f.runtime, f.options)
    // Before any step lands, the name alone plans; afterwards a scope audits.
    assert.equal(await name(["example"]), 0, f.errors.join("\n"))
    assert.equal(
      JSON.parse(f.visible[0]).claim,
      join(f.planRoot, "example-plan-01-0-claim.md"),
    )
    await commitFixture(f.repoRoot, "example/impl-1 ath feat(x): step")
    for (const [args, target] of [
      [["example", "all"], "example-impl-all"],
      [["example", "1-2"], "example-impl-01..02"],
      [["example", "9-12"], "example-impl-09..12"],
      [["abcdef"], "abcdef"],
    ] as const) {
      f.visible.length = 0
      assert.equal(await name(args), 0, f.errors.join("\n"))
      assert.equal(
        JSON.parse(f.visible[0]).claim,
        join(f.planRoot, `${target}-01-0-claim.md`),
      )
    }
    await assert.rejects(readFile(join(f.root, "calls.jsonl")), {
      code: "ENOENT",
    })
  })
}

for (const working of ["repo-edu", "plan"] as const) {
  for (const owner of ["repo-edu", "plan"] as const) {
    test(`standalone brief from ${working} uses Repo Edu's workflow and the session directory for the ${owner} transcript`, async (t) => {
      const f = await roundFixture(
        t,
        "codex",
        owner,
        false,
        null,
        false,
        working,
      )
      const outputRoot = f.planRoot
      const transcript = join(outputRoot, "example-01-1-round.oth.md")
      const title =
        owner === "plan"
          ? "# Plan audit of example.md\n"
          : "# Implementation audit of example.md, all steps\n"
      await writeFile(transcript, title)
      const argument = "example-01-1-round.oth.md"
      assert.equal(
        await runCommand(["brief", argument], f.runtime, f.options),
        0,
        f.errors.join("\n"),
      )
      const log = await readFile(
        join(outputRoot, "example-01-6-brief.oul.log"),
        "utf8",
      )
      assert.ok(
        log.includes(
          `unattended ${owner === "plan" ? "planning" : "implementation-audit"} round`,
        ),
      )
      assert.ok(
        log.includes(
          join(f.repoRoot, ".agents/skills/brief-round/references/workflow.md"),
        ),
      )
      assert.doesNotMatch(log, /Source file: .*\/brief-round\/SKILL\.md/)
      assert.ok(
        log.includes(
          `Phase arguments (JSON array): ${JSON.stringify([transcript, f.brief])}`,
        ),
      )
      for (const call of await f.calls())
        assert.equal(call.cwd, owner === "plan" ? f.planRoot : f.repoRoot)
      assert.equal(await readFile(transcript, "utf8"), title)
    })
  }
}

test("discovery accepts aliases, subdirectories and unrelated directories", async (t) => {
  const f = await roundFixture(t)
  const nested = join(f.repoRoot, "nested")
  const unrelated = join(f.root, "unrelated")
  const alias = join(f.root, "alias")
  await mkdir(nested)
  await mkdir(unrelated)
  await symlink(f.repoRoot, alias)
  for (const cwd of [nested, unrelated, alias]) {
    assert.equal(
      await runCommand(
        ["name", "example", "1", "--auditor", "oth"],
        { ...f.runtime, cwd },
        f.options,
      ),
      0,
      f.errors.join("\n"),
    )
  }
})

for (const phase of ["audit", "vet"] as const) {
  test(`an invalid ${phase} response fails with its recovery session`, async (t) => {
    const f = await roundFixture(t)
    const file =
      phase === "audit" ? f.report : join(f.repoRoot, "VET-example.md")
    await writeFile(file, "Malformed evidence")
    assert.equal(
      await runCommand(["example.md", "all"], f.runtime, f.options),
      1,
    )
    const { log } = await f.records()
    assert.ok(log.includes(`[${phase}] failed:`))
    assert.ok(log.includes(`${phase}-session`))
    assert.doesNotMatch(log, /\[fix\] starting/)
  })
}

for (const phase of [
  "audit",
  "vet",
  "rebut",
  "fix",
  "brief",
  "watch",
] as const) {
  test(`an empty ${phase} output cannot complete its phase`, async (t) => {
    const ruling = phase === "fix"
    const f = await roundFixture(t, "codex", "repo-edu", ruling, null, !ruling)
    f.phases[phase] = {
      ...(f.phases[phase] as object),
      document: { text: " \n" },
    }
    await f.configure({ phases: f.phases })
    assert.equal(
      await runCommand(["example.md", "all", "--brief"], f.runtime, f.options),
      1,
    )
    const { log } = await f.records()
    assert.ok(log.includes(`[${phase}] failed: Phase output is empty:`))
    assert.ok(log.includes(`Session: ${phase}-session`))
  })
}

test("a fix cannot request a ruling without writing its supplied document", async (t) => {
  const f = await roundFixture(t, "codex", "repo-edu", true)
  f.phases.fix = { ...(f.phases.fix as object), document: undefined }
  await f.configure({ phases: f.phases })
  assert.equal(await runCommand(["example.md", "all"], f.runtime, f.options), 1)
  const { log } = await f.records()
  assert.match(log, /\[fix\] failed:/)
  assert.match(log, /Session: fix-session/)
  assert.doesNotMatch(log, /\[brief\] starting/)
  assert.doesNotMatch(f.visible.join("\n"), /Your ruling is needed/)
})

test("a finished fix with no actual commit cannot complete a plan round with findings", async (t) => {
  const f = await roundFixture(t)
  f.phases.fix = { ...(f.phases.fix as object), commits: [] }
  await f.configure({ phases: f.phases })
  assert.equal(await runCommand(["example.md", "all"], f.runtime, f.options), 1)
  const { log } = await f.records()
  assert.match(log, /\[fix\] failed:.*landed no commit/)
  assert.doesNotMatch(log, /\[brief\] starting|\[glance\]/)
})

test("a failed planning audit retains its root and recovery session without starting the vet", async (t) => {
  const f = await roundFixture(t, "claude", "plan", false, null, false, "plan")
  await f.configure({
    phases: {
      audit: {
        stream: await phaseStream(
          "claude",
          'Premise needs a decision.\nPHASE RESULT: {"status":"failed","reason":"Premise conflict"}',
          "audit-session",
        ),
      },
    },
  })
  assert.equal(
    await runCommand(["example.md", "--auditor", "a"], f.runtime, f.options),
    1,
  )
  const { log } = await f.records()
  assert.match(log, /Premise conflict/)
  assert.doesNotMatch(log, /\[vet\] starting/)
  assert.deepEqual(split(log.match(/^Resume: (.+)$/m)?.[1]), [
    "cd",
    f.planRoot,
    "&&",
    "claude",
    "--resume",
    "audit-session",
    "--permission-mode",
    "auto",
    "--add-dir",
    f.repoRoot,
  ])
  for (const output of [log, f.visible.join("\n")])
    assert.doesNotMatch(output, /Files at repository roots:/)
})

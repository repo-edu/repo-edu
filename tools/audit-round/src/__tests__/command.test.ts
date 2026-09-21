import assert from "node:assert/strict"
import {
  mkdir,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises"
import { join } from "node:path"
import { test } from "node:test"
import { execa } from "execa"
import { runCommand } from "../command.js"
import { openRunFiles } from "../run-files.js"
import { phaseStream } from "./helpers.js"
import { roundFixture } from "./round-fixture.js"

for (const auditor of ["claude", "codex"] as const) {
  for (const owner of ["repo-edu", "plan"] as const) {
    for (const ruling of [false, true]) {
      test(`command runs ${auditor} audit, ${owner} routing and ${ruling ? "ruling" : "completion"}`, async (t) => {
        const f = await roundFixture(t, auditor, owner, ruling)
        const { repoRoot, brief } = f
        const argv = [
          "example.md",
          "2-3",
          ...(auditor === "claude" ? ["--auditor", "a"] : []),
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
          [
            auditor,
            auditor === "codex" ? "claude" : "codex",
            auditor,
            "codex",
            "codex",
            // A requested ruling adds Claude's draft and Codex's fresh rewrite.
            // A round that finished glances at the record in the runner
            // instead, and the record here leaves no watch due.
            ...(ruling ? (["claude", "codex"] as const) : []),
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
        assert.ok(invocations[2].args.includes("audit-session"))
        assert.equal(invocations[3].args.includes("resume"), false)
        // The fix commits the round, so it carries the round's commit stamps:
        // the phases grouped by what they ran on, and the auditor's capability
        // tag. The phase reports take precedence over the startup settings.
        const stamps = {
          phases:
            auditor === "codex"
              ? "audit, rebut: gpt-6-astra xhigh\nvet: claude-fable-5-1 high\nfix: chosen-model high"
              : "audit, rebut: claude-fable-5-1 high\nvet: gpt-6-astra xhigh\nfix: chosen-model high",
          auditor: auditor === "codex" ? "otx" : "ath",
        }
        assert.deepEqual(
          {
            phases: invocations[3].phases,
            auditor: invocations[3].auditor,
          },
          stamps,
        )
        if (ruling) {
          const resumed = calls.find((call) => call.args[0] === "resume")
          assert.deepEqual(
            { phases: resumed?.phases, auditor: resumed?.auditor },
            {
              ...stamps,
              phases:
                auditor === "codex"
                  ? "audit, rebut, fix: gpt-6-astra xhigh\nvet: claude-fable-5-1 high"
                  : "audit, rebut: claude-fable-5-1 high\nvet, fix: gpt-6-astra xhigh",
            },
          )
        }
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
        const visible = f.visible.join("\n")
        assert.match(log, /\nStarted \d{4}-/)
        // A round that handed over has not proved its work landed, so it never glances.
        assert.equal(log.includes("[glance]"), !ruling)
        if (!ruling)
          assert.match(
            log,
            /\[glance\] not due: episode example recorded green at [0-9a-f]+\. No A–C correction commits since\. No area reached the green limit of 4/,
          )
        assert.match(log, /fix +codex +chosen-model high/)
        assert.match(log, /brief +codex +gpt-5\.6-terra low/)
        for (const phase of ["audit", "vet", "rebut", "fix"] as const) {
          assert.ok(markdown.includes(`## ${phase} (`))
          assert.ok(markdown.includes(`Complete ${phase} text.`))
          assert.ok(visible.includes(`Complete ${phase} text.`))
          assert.equal(log.includes(`Complete ${phase} text.`), false)
        }
        // The brief retells the transcript, so the transcript never carries it.
        assert.equal(markdown.includes("## brief ("), false)
        assert.equal(markdown.includes("Complete brief text."), false)
        assert.ok(visible.includes("Complete brief text."))
        assert.ok(
          log.includes(
            `Phase arguments (JSON array): ["example-steps-2-3-01","example.md","2-3"]`,
          ),
        )
        assert.ok(
          log.includes(
            `Phase arguments (JSON array): ${JSON.stringify([transcript])}`,
          ),
        )
        assert.ok(log.includes(join(repoRoot, ".agents/skills/brief/SKILL.md")))
        assert.ok(log.includes(`[brief] finished: ${brief}`))
        assert.equal(
          log.split(
            `Phase arguments (JSON array): ${JSON.stringify([f.report])}`,
          ).length - 1,
          3,
        )
        assert.ok(
          log.includes(join(f.root, owner, ".agents/skills/fix/SKILL.md")),
        )
        assert.match(log, /audit-round-probe-error/)
        assert.equal(visible.includes("audit-round-probe-error"), false)
        assert.equal(log.includes("\u001b"), false)
        if (ruling) {
          // The brief and the ruling land before the fix session opens, because
          // the user rules from them.
          assert.equal(calls.at(-2).assistant, "codex")
          assert.deepEqual(calls.at(-1).args, [
            "resume",
            "--approve-for-me",
            "fix-session",
          ])
          assert.ok(log.includes(join(repoRoot, ".claude/commands/rule.md")))
          assert.ok(
            log.includes(join(repoRoot, ".agents/skills/rule-edit/SKILL.md")),
          )
          assert.ok(
            log.includes(
              `Phase arguments (JSON array): ${JSON.stringify([transcript, f.report])}`,
            ),
          )
          // The edit pass is given the draft and the sources the ruling grounds in.
          assert.ok(
            log.includes(
              `Phase arguments (JSON array): ${JSON.stringify([
                f.ruling,
                transcript,
                f.report,
              ])}`,
            ),
          )
          assert.ok(log.includes(`[rule-edit] finished: ${f.ruling}`))
          // Both ruling passes retell the round, so neither enters the transcript.
          for (const phase of ["rule", "rule-edit"] as const) {
            assert.equal(markdown.includes(`## ${phase} (`), false)
            assert.equal(markdown.includes(`Complete ${phase} text.`), false)
            assert.ok(visible.includes(`Complete ${phase} text.`))
          }
          assert.match(visible, /Opening codex session fix-session/)
          assert.doesNotMatch(visible, /Audit round finished\./)
        } else assert.match(visible, /Audit round finished\./)
        assert.ok(f.clears() >= 4)
      })
    }
  }
}

for (const auditor of ["claude", "codex"] as const) {
  test(`a clean ${auditor} audit skips the vet and rebuttal, and the fix stamps only the phases that ran`, async (t) => {
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
      ...(auditor === "claude" ? ["--auditor", "a"] : []),
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
      [auditor, "codex", "codex"],
    )
    // The commit body names the phases the transcript holds, so the vet and
    // the rebuttal that never ran are not stamped into the clean record.
    assert.deepEqual(
      { phases: invocations[1].phases, auditor: invocations[1].auditor },
      {
        phases:
          auditor === "codex"
            ? "audit: gpt-6-astra xhigh\nfix: chosen-model high"
            : "audit: claude-fable-5-1 high\nfix: chosen-model high",
        auditor: auditor === "codex" ? "otx" : "ath",
      },
    )
    const { log, markdown } = await f.records()
    assert.doesNotMatch(log, /\[(?:vet|rebut)\] starting/)
    assert.ok(log.includes(join(f.planRoot, ".agents/skills/fix/SKILL.md")))
    assert.equal(
      log.split(`Phase arguments (JSON array): ${JSON.stringify([f.report])}`)
        .length - 1,
      1,
    )
    for (const phase of ["audit", "fix"] as const)
      assert.ok(markdown.includes(`## ${phase} (`))
    for (const phase of ["vet", "rebut"] as const)
      assert.equal(markdown.includes(`## ${phase} (`), false)
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
      ...(auditor === "claude" ? ["--auditor", "a"] : []),
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
            ? "audit: gpt-6-astra xhigh\nvet: claude-fable-5-1 high\nfix: chosen-model high"
            : "audit: claude-fable-5-1 high\nvet: gpt-6-astra xhigh\nfix: chosen-model high",
        auditor: auditor === "codex" ? "otx" : "ath",
      },
    )
    const { log, markdown } = await f.records()
    assert.doesNotMatch(log, /\[rebut\] starting/)
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
    assert.equal(await runCommand(["example.md"], f.runtime, f.options), 1)
    const log = (await f.records()).log
    assert.match(log, new RegExp(`\\[${phase}\\] failed:`))
    assert.match(log, /Files at repository roots:/)
    if (phase === "rebut")
      assert.match(
        log,
        /Resume: cd .* && codex resume --approve-for-me audit-session/,
      )
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
    const code = await runCommand(["example.md"], f.runtime, {
      ...f.options,
      openFiles(paths) {
        const files = openRunFiles(paths)
        const write = files[target] as (text: string) => void
        return {
          ...files,
          [target]: (text: string) => {
            if (
              text.includes(
                target === "log"
                  ? "printf audit-round-probe"
                  : "Complete audit text.",
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
    assert.ok(f.clears() > 0)
  })
}

test("an unavailable writer still prints the known session to the emergency channel", async (t) => {
  const f = await roundFixture(t)
  let failed = false
  assert.equal(
    await runCommand(["example.md"], f.runtime, {
      ...f.options,
      openFiles(paths) {
        const files = openRunFiles(paths)
        return {
          ...files,
          log(text) {
            if (text.includes("printf audit-round-probe")) failed = true
            if (failed) throw new Error("Disk full")
            files.log(text)
          },
        }
      },
    }),
    1,
  )
  assert.match(
    f.errors.join("\n"),
    /Resume: cd .* && codex resume --approve-for-me audit-session/,
  )
})

test("a terminal failure during startup stops before any round file is created", async (t) => {
  const f = await roundFixture(t)
  assert.equal(
    await runCommand(["example.md"], f.runtime, {
      ...f.options,
      terminal: {
        ...f.options.terminal,
        write(text) {
          if (text === "claude update output")
            throw new Error("Update presentation failed")
          f.options.terminal.write(text)
        },
      },
    }),
    1,
  )
  assert.equal((await f.calls()).length, 1)
  assert.deepEqual(await f.roundFiles(), [])
  assert.match(f.errors.join("\n"), /Update presentation failed/)
})

test("startup writes only to the terminal before the models table opens the run log", async (t) => {
  const f = await roundFixture(t)
  assert.equal(
    await runCommand(["example.md"], f.runtime, {
      ...f.options,
      openFiles(paths) {
        assert.ok(f.visible.includes("Checking claude updates..."))
        assert.ok(f.visible.includes("claude update output"))
        return openRunFiles(paths)
      },
    }),
    0,
    f.errors.join("\n"),
  )
  const { log } = await f.records()
  assert.match(log, /^audit +codex +chosen-model high/)
  assert.doesNotMatch(
    log,
    /Checking .* updates|claude update output|Codex is up to date/,
  )
})

for (const effort of [null, "max"]) {
  test(`a ${effort} configured effort stops the command before any round files exist`, async (t) => {
    const f = await roundFixture(t)
    await f.configure({
      phases: f.phases,
      config: { model: "unlisted-model", model_reasoning_effort: effort },
    })
    const before = await readdir(f.repoRoot)
    assert.equal(await runCommand(["example.md"], f.runtime, f.options), 1)
    assert.match(f.errors.join("\n"), /codex audit.*full --auditor tag/)
    assert.deepEqual(await readdir(f.repoRoot), before)
    assert.equal(
      (await f.calls()).filter((call) => call.args[0] === "exec").length,
      0,
    )
  })
}

for (const auditor of ["codex", "claude"] as const) {
  test(`a full --auditor tag reaches the ${auditor} audit and its rebuttal alone`, async (t) => {
    const f = await roundFixture(t, auditor)
    assert.equal(
      await runCommand(
        ["example.md", "3", "--auditor", auditor === "codex" ? "otx" : "atx"],
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
    const pin =
      auditor === "codex"
        ? ["-m", "gpt-6-astra", "-c", "model_reasoning_effort=xhigh"]
        : ["--model", "fable", "--effort", "xhigh"]
    // The audit names the override and the rebuttal resumes that thread on it.
    for (const index of [0, 2])
      assert.ok(
        pin.every((argument) => invocations[index].args.includes(argument)),
        invocations[index].args.join(" "),
      )
    // A Codex pin precedes the subcommand, so a resumed rebuttal still carries it.
    if (auditor === "codex")
      assert.ok(
        invocations[2].args.indexOf("-m") <
          invocations[2].args.indexOf("resume"),
      )
    // The vet and the fix keep whatever their own CLI is configured to use.
    for (const index of [1, 3])
      for (const flag of ["-m", "--model", "-c", "--effort"])
        assert.equal(invocations[index].args.includes(flag), false)
    // The brief names its own model whatever the command line asked for.
    assert.ok(invocations[4].args.includes("gpt-5.6-terra"))
    const { log } = await f.records()
    assert.match(
      log,
      auditor === "codex"
        ? /audit +codex +gpt-6-astra extra high +--auditor/
        : /audit +claude +fable extra high +--auditor/,
    )
    assert.match(log, /fix +codex +chosen-model high +codex settings/)
    assert.match(log, /brief +codex +gpt-5\.6-terra low +phase pin/)
    // The requested alias and effort stay in the arguments and header above.
    // The fix receives the release and effort reported by each phase instead.
    assert.deepEqual(
      { phases: invocations[3].phases, auditor: invocations[3].auditor },
      {
        phases:
          auditor === "codex"
            ? "audit, rebut: gpt-6-astra xhigh\nvet: claude-fable-5-1 high\nfix: chosen-model high"
            : "audit, rebut: claude-fable-5-1 high\nvet: gpt-6-astra xhigh\nfix: chosen-model high",
        auditor: auditor === "codex" ? "otx" : "ath",
      },
    )
  })
}

test("argument errors and help start no assistant processes", async (t) => {
  const f = await roundFixture(t)
  for (const argv of [
    ["HEAD", "--chain"],
    ["HEAD-2..HEAD", "--chain"],
    ["23674f", "--chain"],
    ["HEAD--1"],
    ["HEAD", "3"],
    ["example.md", "HEAD"],
    ["example.md", "3-1"],
    ["example.md", "0"],
    ["example.md", "--auditor", "other"],
    // A tag names its fields by letter, in order, and never asks for `u`.
    ["example.md", "--auditor", "claude"],
    ["example.md", "--auditor", "xa"],
    ["example.md", "--auditor", "aux"],
    ["example.md", "--auditor", "atxx"],
    ["example.md", "--chain", "extra", "3"],
    ["example.md", "--unknown"],
    ["brief"],
    ["brief", "ROUND-example.md", "extra"],
  ])
    assert.equal(await runCommand(argv, f.runtime, f.options), 2)
  // A bare command line, -h and --help all reach the same help.
  for (const argv of [[], ["-h"], ["--help"], ["brief", "--help"]])
    assert.equal(await runCommand(argv, f.runtime, f.options), 0)
  await assert.rejects(readFile(join(f.root, "calls.jsonl")), {
    code: "ENOENT",
  })
  const visible = f.visible.join("\n")
  assert.match(
    visible,
    /Usage: audit-round \[options\] <target> \[scope-or-commits\.\.\.\]/,
  )
  assert.match(visible, /HEAD-<n>/)
  assert.match(visible, /Codex\s+always fixes and\s+briefs/)
  assert.match(visible, /plain-words brief/)
  assert.match(visible, /run up to 3 rounds on the same scope/)
  assert.match(visible, /--auditor <tag>\s+capability tag of the assistant/)
  assert.match(visible, /an optional l,\s+m, h or x for the effort/)
  assert.match(visible, /\(default: o\)/)
  // A round is the command itself, and each command carries its own help.
  assert.doesNotMatch(visible, /^\s+round\b/m)
  assert.doesNotMatch(visible, /^\s+help\b/m)
})

for (const auditor of ["codex", "claude"] as const) {
  test(`${auditor} commit audit preserves its target and finishes without a watch`, async (t) => {
    const f = await roundFixture(t, auditor, "repo-edu", false, "b", true)
    await execa("git", ["init", "--quiet"], { cwd: f.repoRoot })
    await execa(
      "git",
      [
        "-c",
        "user.name=Test",
        "-c",
        "user.email=test@example.test",
        "-c",
        "core.hooksPath=/dev/null",
        "commit",
        "--allow-empty",
        "-m",
        "Fixture",
      ],
      { cwd: f.repoRoot },
    )
    const { stdout: head } = await execa(
      "git",
      ["rev-parse", "--short", "HEAD"],
      { cwd: f.repoRoot },
    )
    const commits = auditor === "codex" ? ["HEAD-2..HEAD"] : ["HEAD-1", "HEAD"]
    assert.equal(
      await runCommand(
        [...commits, "--auditor", auditor === "codex" ? "o" : "a"],
        f.runtime,
        f.options,
      ),
      0,
      f.errors.join("\n"),
    )
    const { log, markdown, transcript } = await f.records()
    assert.ok(
      log.includes(
        `Phase arguments (JSON array): ${JSON.stringify([auditor === "codex" ? `${head}-2..${head}-01` : `${head}-1-plus-1-01`, ...commits])}`,
      ),
    )
    assert.ok(
      markdown.startsWith(`# Audit round of commits ${commits.join(" ")}\n`),
    )
    assert.ok(transcript.includes(commits[0].replaceAll("HEAD", head)))
    for (const phase of ["audit", "vet", "rebut", "fix", "brief"])
      assert.ok(log.includes(`[${phase}] finished`))
    assert.doesNotMatch(log, /\[(?:glance|watch)\]|watch +claude|Chained round/)
    const invocations = (await f.calls()).filter(
      (call) =>
        call.args[0] === "exec" ||
        (call.args[0] === "-p" &&
          !call.args.includes("--no-session-persistence")),
    )
    assert.equal(invocations.length, 5)
  })
}

test("a brief on its own retells the named transcript without a new round pair", async (t) => {
  const f = await roundFixture(t)
  const transcript = join(f.repoRoot, "example-step-7-01-abx-round.md")
  await writeFile(transcript, "# Audit round of implementation example.md 7\n")
  assert.equal(
    await runCommand(
      ["brief", "example-step-7-01-abx-round.md"],
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
  const names = (await readdir(f.repoRoot)).filter((name) =>
    name.startsWith("example-step-7-01-"),
  )
  const logName = names.find((name) => name.endsWith(".log")) as string
  assert.match(logName, /^example-step-7-01-oul-brief\.log$/)
  assert.deepEqual(
    names.toSorted(),
    [logName, "example-step-7-01-abx-round.md"].toSorted(),
  )
  const log = await readFile(join(f.repoRoot, logName), "utf8")
  assert.match(log, /Brief of example-step-7-01-abx-round\.md\n/)
  assert.ok(
    log.includes(
      `Phase arguments (JSON array): ${JSON.stringify([transcript])}`,
    ),
  )
  assert.match(log, /brief +codex +gpt-5\.6-terra low/)
  assert.doesNotMatch(log, /audit +codex|fix +codex/)
  const visible = f.visible.join("\n")
  assert.ok(visible.includes("Complete brief text."))
  assert.match(visible, /Brief finished\./)
  assert.equal(
    await readFile(transcript, "utf8"),
    "# Audit round of implementation example.md 7\n",
  )
})

test("a plan named without its extension runs as its .md file", async (t) => {
  const f = await roundFixture(t)
  assert.equal(
    await runCommand(["example", "2-3"], f.runtime, f.options),
    0,
    f.errors.join("\n"),
  )
  const { log } = await f.records()
  assert.ok(
    log.includes(
      `Phase arguments (JSON array): ["example-steps-2-3-01","example.md","2-3"]`,
    ),
  )
})

test("a missing plan file is refused before any assistant starts", async (t) => {
  const f = await roundFixture(t)
  for (const name of ["missing", "missing.md", "../plan/missing"]) {
    assert.equal(await runCommand([name, "3"], f.runtime, f.options), 1)
    assert.match(f.errors.at(-1) as string, /No plan file at .*missing\.md/)
  }
  await assert.rejects(readFile(join(f.root, "calls.jsonl")), {
    code: "ENOENT",
  })
})

test("a brief on its own refuses a transcript that is not a Markdown file at the root", async (t) => {
  const f = await roundFixture(t)
  await writeFile(join(f.repoRoot, "ROUND-example-old.md"), "Old transcript")
  await writeFile(
    join(f.repoRoot, "../plan/example-01-oth-round.md"),
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
      /Name a round's \*-round\.md transcript/,
    )
  }
  await assert.rejects(readFile(join(f.root, "calls.jsonl")), {
    code: "ENOENT",
  })
})

test("a chained run repeats the auditor while the fix records a B finding", async (t) => {
  const f = await roundFixture(t, "codex", "repo-edu", false, "b")
  assert.equal(
    await runCommand(["example.md", "3", "--chain"], f.runtime, f.options),
    0,
    f.errors.join("\n"),
  )
  const names = (await f.roundFiles()).toSorted()
  assert.deepEqual(names, [
    "example-step-3-01-ouh-round.log",
    "example-step-3-01-ouh-round.md",
    "example-step-3-02-ouh-round.log",
    "example-step-3-02-ouh-round.md",
    "example-step-3-03-ouh-round.log",
    "example-step-3-03-ouh-round.md",
  ])
  const invocations = (await f.calls()).filter(
    (call) =>
      call.args[0] === "exec" ||
      (call.args[0] === "-p" &&
        !call.args.includes("--no-session-persistence")),
  )
  // Three rounds of the five phases; the glance after each runs in the runner
  // and a finished fix opens no ruling.
  assert.equal(invocations.length, 15)
  const visible = f.visible.join("\n")
  assert.match(
    visible,
    /Chained round 2 of at most 3: codex audits the same scope again\./,
  )
  assert.match(
    visible,
    /Chained round 3 of at most 3: codex audits the same scope again\./,
  )
  assert.match(
    visible,
    /Chain stopped at the 3-round cap with findings still landing\./,
  )
  // Updates and settings are read once for the run; later rounds still seat
  // their roles from the selections that first round discovered.
  assert.equal(
    (await f.calls()).filter((call) =>
      call.args.includes("--no-session-persistence"),
    ).length,
    1,
  )
  const second = await readFile(join(f.repoRoot, names[2]), "utf8")
  assert.match(
    second,
    /Audit round of implementation example\.md 3 \(round 2\)/,
  )
  assert.match(second, /audit +codex +chosen-model high/)
})

test("a chained run crosses to the other assistant once the fix records a clean round", async (t) => {
  const f = await roundFixture(t, "codex", "repo-edu", false, null)
  assert.equal(
    await runCommand(["example.md", "--chain"], f.runtime, f.options),
    0,
    f.errors.join("\n"),
  )
  const names = (await f.roundFiles()).toSorted()
  assert.deepEqual(names, [
    "example-all-01-ouh-round.log",
    "example-all-01-ouh-round.md",
    "example-all-02-auh-round.log",
    "example-all-02-auh-round.md",
  ])
  const visible = f.visible.join("\n")
  assert.match(
    visible,
    /Chained round 2 of at most 3: claude audits the same scope again\./,
  )
  assert.match(visible, /Chain stopped after the second assistant's round\./)
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
  const watch = transcript.replace(/-ouh-round\.md$/, "-auh-watch.md")
  assert.match(
    log,
    /\n─{72}\n\[glance\] due: episode example recorded red at [0-9a-f]+\. A red record is re-read every round \(rule 1\)\./,
  )
  assert.ok(log.includes(join(f.repoRoot, ".claude/commands/watch.md")))
  assert.ok(
    log.includes(
      `Phase arguments (JSON array): ${JSON.stringify([watch, f.options.cacheRoot])}`,
    ),
  )
  // The edit pass is given the draft alone, and no round file.
  assert.ok(
    log.includes(join(f.repoRoot, ".agents/skills/watch-edit/SKILL.md")),
  )
  assert.ok(
    log.includes(`Phase arguments (JSON array): ${JSON.stringify([f.watch])}`),
  )
  assert.ok(log.includes(`[watch-edit] finished: ${f.watch}`))
  // The watch follows the round it grades, so none of its text enters the transcript.
  assert.equal(markdown.includes("## watch ("), false)
  assert.ok(f.visible.join("\n").includes("Complete watch text."))
  assert.match(f.visible.join("\n"), /Audit round finished\./)
})

test("--no-watch skips the glance and the watch, whatever the record says", async (t) => {
  const f = await roundFixture(t, "codex", "repo-edu", false, null, true)
  assert.equal(
    await runCommand(["example.md", "3", "--no-watch"], f.runtime, f.options),
    0,
    f.errors.join("\n"),
  )
  const { log } = await f.records()
  assert.doesNotMatch(log, /\[glance\]|\[watch\]/)
  assert.match(f.visible.join("\n"), /Audit round finished\./)
})

test("a chained run stops at the round that opens a ruling session", async (t) => {
  const f = await roundFixture(t, "codex", "repo-edu", true)
  assert.equal(
    await runCommand(["example.md", "--chain"], f.runtime, f.options),
    0,
    f.errors.join("\n"),
  )
  assert.equal((await f.roundFiles()).length, 2)
  assert.match(
    f.visible.join("\n"),
    /Chain stopped: this round opened a ruling session\./,
  )
})

test("an unchained run claims its round number and says nothing about a chain", async (t) => {
  const f = await roundFixture(t, "codex", "repo-edu", false, "b")
  assert.equal(
    await runCommand(["example.md", "3"], f.runtime, f.options),
    0,
    f.errors.join("\n"),
  )
  const names = await f.roundFiles()
  assert.equal(names.length, 2)
  assert.ok(
    names.every((name) => name.startsWith("example-step-3-01-ouh-round.")),
  )
  assert.doesNotMatch(f.visible.join("\n"), /Chain/)
})

for (const auditor of ["codex", "claude"] as const) {
  for (const ruling of [false, true]) {
    test(`planning start keeps every session at the plan root with ${auditor} auditing and ruling=${ruling}`, async (t) => {
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
          ["example-widen.md", "--auditor", auditor === "codex" ? "o" : "a"],
          f.runtime,
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
          `example-01-${auditor === "codex" ? "ouh" : "auh"}-round.md`,
        ),
      )
      assert.match(log, /Audit round of plan example-widen\.md/)
      assert.ok(
        log.includes(
          `Phase arguments (JSON array): ${JSON.stringify(["example-01", "example-widen.md"])}`,
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
            ? join(f.planRoot, `.agents/skills/${phase}/SKILL.md`)
            : join(f.planRoot, `.claude/commands/${phase}.md`)
        assert.ok(log.includes(launcher), launcher)
      }
      assert.ok(log.includes(join(f.repoRoot, ".agents/skills/brief/SKILL.md")))
      assert.ok(
        log.includes(
          `${f.repoRoot}/.agents/skills/audit/references/workflow.md#runner-result`,
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
              ? "audit, rebut: gpt-6-astra xhigh\nvet: claude-fable-5-1 high\nfix: chosen-model high"
              : "audit, rebut: claude-fable-5-1 high\nvet: gpt-6-astra xhigh\nfix: chosen-model high",
          auditor: auditor === "codex" ? "otx" : "ath",
        },
      )
      if (ruling) {
        assert.ok(log.includes(join(f.repoRoot, ".claude/commands/rule.md")))
        assert.ok(
          log.includes(join(f.repoRoot, ".agents/skills/rule-edit/SKILL.md")),
        )
        assert.ok(
          log.includes(
            `Resume: cd ${f.planRoot} && codex resume --approve-for-me fix-session`,
          ),
        )
      }
      assert.equal(
        (await readdir(f.repoRoot)).some((name) =>
          /-(round|claim)\.(md|log)$/.test(name),
        ),
        false,
      )
    })
  }
}

test("planning start rejects step and commit scopes before any assistant or output", async (t) => {
  const f = await roundFixture(t, "codex", "plan", false, null, false, "plan")
  for (const argv of [
    ["example.md", "1"],
    ["example.md", "1-2"],
    ["HEAD"],
    ["HEAD-2..HEAD"],
    ["abcdef"],
    ["example.md", "HEAD"],
  ]) {
    assert.equal(await runCommand(argv, f.runtime, f.options), 2)
    assert.match(
      f.errors.at(-1) as string,
      /Implementation and commit audits run from Repo Edu/,
    )
  }
  assert.deepEqual(await f.roundFiles(), [])
  await assert.rejects(readFile(join(f.root, "calls.jsonl")), {
    code: "ENOENT",
  })
})

for (const working of ["repo-edu", "plan"] as const) {
  for (const owner of ["repo-edu", "plan"] as const) {
    test(`standalone brief from ${working} uses Repo Edu's launcher and writes beside the ${owner} transcript`, async (t) => {
      const f = await roundFixture(
        t,
        "codex",
        owner,
        false,
        null,
        false,
        working,
      )
      const outputRoot = owner === "plan" ? f.planRoot : f.repoRoot
      const transcript = join(outputRoot, "example-01-oth-round.md")
      await writeFile(transcript, "# Planning round\n")
      const argument =
        working === owner
          ? "example-01-oth-round.md"
          : `../${owner}/example-01-oth-round.md`
      assert.equal(
        await runCommand(["brief", argument], f.runtime, f.options),
        0,
        f.errors.join("\n"),
      )
      const log = await readFile(
        join(outputRoot, "example-01-oul-brief.log"),
        "utf8",
      )
      assert.ok(
        log.includes(
          `unattended ${owner === "plan" ? "planning" : "implementation-audit"} round`,
        ),
      )
      assert.ok(log.includes(join(f.repoRoot, ".agents/skills/brief/SKILL.md")))
      assert.ok(
        log.includes(
          `Phase arguments (JSON array): ${JSON.stringify([transcript])}`,
        ),
      )
      for (const call of await f.calls()) assert.equal(call.cwd, f.runtime.cwd)
      assert.equal(await readFile(transcript, "utf8"), "# Planning round\n")
    })
  }
}

test("discovery admits a checkout alias but refuses subdirectories and unrelated roots", async (t) => {
  const f = await roundFixture(t)
  const nested = join(f.repoRoot, "nested")
  const unrelated = join(f.root, "unrelated")
  await mkdir(nested)
  await mkdir(unrelated)
  for (const cwd of [nested, unrelated]) {
    assert.equal(
      await runCommand(["example.md"], { ...f.runtime, cwd }, f.options),
      1,
    )
    assert.match(
      f.errors.at(-1) as string,
      /Repo Edu or sibling plan checkout root/,
    )
  }
  await assert.rejects(readFile(join(f.root, "calls.jsonl")), {
    code: "ENOENT",
  })
  const alias = join(f.root, "alias")
  await symlink(f.repoRoot, alias)
  assert.equal(
    await runCommand(["example.md"], { ...f.runtime, cwd: alias }, f.options),
    0,
    f.errors.join("\n"),
  )
  for (const call of await f.calls()) assert.equal(call.cwd, f.repoRoot)
})

for (const phase of ["audit", "vet"] as const) {
  for (const missing of [false, true]) {
    test(`a ${missing ? "missing" : "malformed"} ${phase} file fails with its recovery session`, async (t) => {
      const f = await roundFixture(t)
      const file =
        phase === "audit" ? f.report : join(f.repoRoot, "VET-example.md")
      if (missing) await rm(file)
      else await writeFile(file, "Malformed evidence")
      assert.equal(await runCommand(["example.md"], f.runtime, f.options), 1)
      const { log } = await f.records()
      assert.ok(log.includes(`[${phase}] failed:`))
      assert.ok(log.includes(`${phase}-session`))
      assert.doesNotMatch(log, /\[fix\] starting/)
    })
  }
}

test("a finished fix with no actual commit cannot complete a plan round with findings", async (t) => {
  const f = await roundFixture(t)
  f.phases.fix = { ...(f.phases.fix as object), commits: [] }
  await f.configure({ phases: f.phases })
  assert.equal(await runCommand(["example.md"], f.runtime, f.options), 1)
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
          'Premise needs a decision.\nPHASE RESULT: {"status":"failed","file":null,"reason":"Premise conflict"}',
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
  assert.ok(
    log.includes(
      `Resume: cd ${f.planRoot} && claude --resume audit-session --permission-mode auto --add-dir ${f.repoRoot}`,
    ),
  )
  assert.ok(log.includes(`Files at repository roots:\n${f.repoRoot}:\n`))
  assert.ok(log.includes(`${f.planRoot}:\n`))
})

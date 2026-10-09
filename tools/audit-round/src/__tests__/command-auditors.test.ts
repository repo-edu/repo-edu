import assert from "node:assert/strict"
import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { test } from "node:test"
import { execa } from "execa"
import { openRunFiles } from "../run-files.js"
import { runCommand, testSettings } from "./configured-runner.js"
import { recordedTag, recordedText } from "./helpers.js"
import { roundFixture } from "./round-fixture.js"

test("an unavailable writer still prints the known session to the emergency channel", async (t) => {
  const f = await roundFixture(t)
  let failed = false
  assert.equal(
    await runCommand(["example.md", "all", "--auditor", "o"], f.runtime, {
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
    await runCommand(["example.md", "all", "--auditor", "o"], f.runtime, {
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
    await runCommand(["example.md", "all", "--auditor", "o"], f.runtime, {
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
  assert.match(log, /^audit +codex +chosen-model +high/)
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
    assert.equal(
      await runCommand(["example.md", "all"], f.runtime, f.options),
      1,
    )
    assert.match(
      f.errors.join("\n"),
      /codex audit.*full --auditor or --first tag/,
    )
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
    const settings = structuredClone(testSettings)
    settings.phases.audit[auditor] = [
      { model: "first-pair-member", effort: "low" },
      { model: "second-pair-member", effort: "medium" },
    ]
    assert.equal(
      await runCommand(
        [
          "example.md",
          "3",
          "--brief",
          "--auditor",
          auditor === "codex" ? "otx" : "atx",
        ],
        f.runtime,
        { ...f.options, settings },
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
        : ["--model", "claude-fable-5-1", "--effort", "xhigh"]
    // The audit and its fresh rebuttal both carry the override.
    for (const index of [0, 2])
      assert.ok(
        pin.every((argument) => invocations[index].args.includes(argument)),
        invocations[index].args.join(" "),
      )
    assert.equal(invocations[2].args.includes("resume"), false)
    assert.equal(invocations[2].args.includes("--resume"), false)
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
        ? /audit +codex +gpt-6-astra +extra high +--auditor/
        : /audit +claude +claude-fable-5-1 +extra high +--auditor/,
    )
    assert.match(log, /fix +codex +chosen-model +high +CLI default/)
    assert.match(log, /brief +codex +gpt-5\.6-terra +low +audit-round settings/)
    // The requested model and effort stay in the arguments above.
    // The fix receives the release and effort reported by each phase instead.
    assert.deepEqual(
      { phases: invocations[3].phases, auditor: invocations[3].auditor },
      {
        phases:
          auditor === "codex"
            ? `audit, rebut: ${recordedText("codex")}\nvet: ${recordedText("claude")}\nfix: chosen-model high\nAudit, vet and rebuttal took 0 min.`
            : `audit, rebut: ${recordedText("claude")}\nvet: ${recordedText("codex")}\nfix: chosen-model high\nAudit, vet and rebuttal took 0 min.`,
        auditor: recordedTag(auditor),
      },
    )
  })
}

test("a configured pair refuses partial --auditor and --first tags before startup", async (t) => {
  const f = await roundFixture(t)
  const settings = structuredClone(testSettings)
  settings.phases.audit.codex = [
    { model: "gpt-5.6-sol", effort: "medium" },
    { model: "gpt-6-astra", effort: "xhigh" },
  ]
  for (const argv of [
    ["example.md", "all", "--auditor", "o"],
    ["example.md", "all", "--first", "oh"],
  ])
    assert.equal(
      await runCommand(argv, f.runtime, { ...f.options, settings }),
      2,
    )
  const errors = f.errors.join("\n")
  assert.match(errors, /codex's audit selection is the pair/)
  assert.match(errors, /gpt-5\.6-sol at medium/)
  assert.match(errors, /gpt-6-astra at xhigh/)
  assert.match(errors, /Use codex or a full tag with both tier and effort/)
  await assert.rejects(readFile(join(f.root, "calls.jsonl")), {
    code: "ENOENT",
  })
})

for (const auditor of ["codex", "claude"] as const) {
  test(`--auditor ${auditor} inherits CLI settings for audit and rebuttal despite phase pins`, async (t) => {
    const f = await roundFixture(t, auditor)
    const settings = structuredClone(testSettings)
    settings.defaultAuditor = auditor === "codex" ? "claude" : "codex"
    settings.phases.audit[auditor] = { model: "pinned-auditor", effort: "low" }
    settings.phases.fix = {
      assistant: "codex",
      model: "pinned-fix",
      effort: "medium",
    }
    assert.equal(
      await runCommand(["example.md", "all", "--auditor", auditor], f.runtime, {
        ...f.options,
        settings,
      }),
      0,
      f.errors.join("\n"),
    )
    const prompts = await f.prompts()
    for (const phase of ["audit", "rebut"]) {
      const call = prompts.find((call) =>
        call.prompt.startsWith(`Run the ${phase} phase `),
      )
      assert.ok(call)
      assert.equal(call.assistant, auditor)
      for (const flag of ["-m", "--model", "-c", "--effort"])
        assert.equal(call.args.includes(flag), false)
    }
    const fix = prompts.find((call) =>
      call.prompt.startsWith("Run the fix phase "),
    )
    assert.ok(fix?.args.includes("pinned-fix"))
    assert.ok(fix?.args.includes("model_reasoning_effort=medium"))
    const { log, transcript } = await f.records()
    for (const phase of ["audit", "rebut"])
      assert.match(
        log,
        new RegExp(
          `${phase} +${auditor} +${auditor === "claude" ? "claude-model" : "chosen-model"} +high +CLI default`,
        ),
      )
    assert.ok(
      transcript.endsWith(`-1-round.${auditor === "claude" ? "a" : "o"}uh.md`),
    )
  })
}

test("auditor lists keep each entry's model and effort independent", async (t) => {
  const f = await roundFixture(t, "claude")
  const settings = structuredClone(testSettings)
  settings.phases.audit.claude = { model: "pinned-claude", effort: "low" }
  settings.phases.audit.codex = { model: "pinned-codex", effort: "high" }
  assert.equal(
    await runCommand(
      [
        "example.md",
        "2-3",
        "--auditor",
        " atx, obm, claude, otl ",
        "--no-watch",
      ],
      f.runtime,
      { ...f.options, settings },
    ),
    0,
    f.errors.join("\n"),
  )
  const prompts = await f.prompts()
  const expected = [
    {
      assistant: "claude",
      pin: ["--model", "claude-fable-5-1", "--effort", "xhigh"],
    },
    {
      assistant: "codex",
      pin: ["-m", "gpt-5.6-sol", "-c", "model_reasoning_effort=medium"],
    },
    { assistant: "claude", pin: [] },
    {
      assistant: "codex",
      pin: ["-m", "gpt-6-astra", "-c", "model_reasoning_effort=low"],
    },
  ]
  for (const phase of ["audit", "rebut"]) {
    const calls = prompts.filter((call) =>
      call.prompt.startsWith(`Run the ${phase} phase `),
    )
    assert.deepEqual(
      calls.map((call) => call.assistant),
      expected.map((entry) => entry.assistant),
    )
    for (const [index, call] of calls.entries()) {
      for (const arg of expected[index].pin)
        assert.ok(call.args.includes(arg), call.args.join(" "))
      assert.equal(call.args.includes("pinned-claude"), false)
      assert.equal(call.args.includes("pinned-codex"), false)
      if (index === 2) {
        assert.equal(call.args.includes("--model"), false)
        assert.equal(call.args.includes("--effort"), false)
      }
    }
  }
  for (const phase of ["vet", "fix"]) {
    for (const call of prompts.filter((call) =>
      call.prompt.startsWith(`Run the ${phase} phase `),
    )) {
      for (const flag of ["--model", "--effort", "-m", "-c"])
        assert.equal(call.args.includes(flag), false)
    }
  }
  assert.deepEqual(
    prompts
      .filter((call) => call.prompt.startsWith("Run the vet phase "))
      .map((call) => call.assistant),
    ["codex", "claude", "codex", "claude"],
  )
  assert.equal((await f.roundFiles()).length, 8)
  assert.doesNotMatch(f.visible.join("\n"), /\[glance\]|\[watch\]/)
})

test("argument errors and help start no assistant processes", async (t) => {
  const f = await roundFixture(t)
  for (const argv of [
    ["HEAD", "--auditor", "codex,claude"],
    ["HEAD-2..HEAD", "--auditor", "codex,claude"],
    ["23674f", "--auditor", "codex,claude"],
    ["HEAD--1"],
    ["HEAD", "3"],
    ["example.md", "HEAD"],
    ["example.md", "3-1"],
    ["example.md", "0"],
    ["example.md", "all", "--auditor", "other"],
    ["example.md", "all", "--auditor", ""],
    ["example.md", "all", "--auditor", ","],
    ["example.md", "all", "--auditor", " , "],
    ["example.md", "all", "--auditor", "codex,other"],
    // --first names one round, and --auditor already names the first.
    ["example.md", "all", "--first", "codex,claude"],
    ["example.md", "all", "--first", "other"],
    ["example.md", "all", "--first", "codex", "--auditor", "claude"],
    ["example.md", "--chain"],
    ["name", "example.md", "--auditor", "oth,ath"],
    // A tag names its fields by letter, in order, and never asks for `u`.
    ["example.md", "all", "--auditor", "claudex"],
    ["example.md", "all", "--auditor", "xa"],
    ["example.md", "all", "--auditor", "aux"],
    ["example.md", "all", "--auditor", "atxx"],
    ["example.md", "--chain", "extra", "3"],
    ["example.md", "--unknown"],
    ["example.md", "--no-brief"],
    ["brief", "ROUND-example.md", "extra"],
    ["close", "example", "extra"],
    ["close", "example", "--aborted"],
    ["close", "example", "--aborted", " "],
  ])
    assert.equal(await runCommand(argv, f.runtime, f.options), 2)
  // A bare command line, -h and --help all reach the same help.
  assert.match(f.errors.join("\n"), /Auditor entry 2 \(other\): expected/)
  for (const argv of [
    [],
    ["-h"],
    ["--help"],
    ["brief", "--help"],
    ["close", "--help"],
    ["trial", "--help"],
    ["plan", "--help"],
  ])
    assert.equal(await runCommand(argv, f.runtime, f.options), 0)
  await assert.rejects(readFile(join(f.root, "calls.jsonl")), {
    code: "ENOENT",
  })
  const visible = f.visible.join("\n")
  assert.match(
    visible,
    /Usage: audit-round \[options\] \[target\] \[scope-or-commits\.\.\.\]\n {7}audit-round trial\n {7}audit-round brief \[options\] \[transcript\]\n {7}audit-round close \[options\] \[stem\]\n {7}audit-round plan/,
  )
  assert.match(
    visible,
    /Alone, the stem runs the audit the plan's history calls for/,
  )
  assert.match(
    visible,
    /Omitted +Options without a target take the active plan/,
  )
  // Hand-run launchers call the housekeeping commands; help shows what a user runs.
  assert.doesNotMatch(visible, /^\s+(name|paths|episode|delete-reports)\s/m)
  for (const name of ["trial", "brief", "close", "plan"])
    assert.match(visible, new RegExp(`^\\s+${name}\\s`, "m"))
  assert.match(visible, /--aborted <reason>/)
  assert.match(visible, /HEAD-<n>/)
  assert.match(visible, /assistant set in settings\.json\s+fixes/)
  assert.match(visible, /plain-words brief/)
  assert.match(visible, /--auditor <selections>\s+auditors in round order/)
  assert.doesNotMatch(visible, /--chain/)
  assert.match(visible, /<effort>\s+l = low, m = medium, h = high, x = xhigh/)
  assert.match(visible, /default auditor comes from\s+settings\.json/)
  assert.match(visible, /Targets and scope:/)
  assert.match(visible, /Auditor selection \(--auditor <selections>\):/)
  assert.match(visible, /Each entry runs\s+one round, from left to right/)
  assert.match(visible, /<assistant>\[<tier>\]\[<effort>\]/)
  assert.match(visible, /--auditor atx,obm/)
  assert.match(visible, /Round sequence:/)
  assert.match(visible, /<target>-queue\.md at the\s+plan root/)
  assert.match(visible, /Examples \(from either checkout\):/)
  assert.ok(visible.split("\n").every((line) => line.length <= 88))
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
        [...commits, "--brief", "--auditor", auditor === "codex" ? "o" : "a"],
        f.runtime,
        f.options,
      ),
      0,
      f.errors.join("\n"),
    )
    const { log, markdown, transcript } = await f.records()
    assert.ok(
      log.includes(
        `Phase arguments (JSON array): ${JSON.stringify([f.report, ...commits])}`,
      ),
    )
    assert.ok(markdown.startsWith(`# Commit audit of ${commits.join(" ")}\n`))
    assert.ok(transcript.includes(commits[0].replaceAll("HEAD", head)))
    for (const phase of ["audit", "vet", "rebut", "fix", "brief"])
      assert.ok(log.includes(`[${phase}] finished`))
    assert.doesNotMatch(log, /\[(?:glance|watch)\]|watch +codex|Chained round/)
    const invocations = (await f.calls()).filter(
      (call) =>
        call.args[0] === "exec" ||
        (call.args[0] === "-p" &&
          !call.args.includes("--no-session-persistence")),
    )
    assert.equal(invocations.length, 5)
  })
}

import assert from "node:assert/strict"
import { mkdir, readdir, readFile, realpath, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { type TestContext, test } from "node:test"
import { runCommand } from "../command.js"
import type { Assistant } from "../phase.js"
import { openRunFiles } from "../run-files.js"
import { fixture, phaseStream, recorded } from "./helpers.js"

async function roundFixture(
  t: TestContext,
  auditor: Assistant = "codex",
  owner: "repo-edu" | "plan" = "repo-edu",
  ruling = false,
) {
  const f = await fixture(t)
  await mkdir(join(f.root, "repo-edu/.agents/skills/audit/references"), {
    recursive: true,
  })
  // The command resolves its root through realpath, so paths it derives compare against this.
  const repoRoot = await realpath(join(f.root, "repo-edu"))
  const planRoot = join(f.root, "plan")
  await mkdir(planRoot)
  await writeFile(
    join(repoRoot, ".agents/skills/audit/references/workflow.md"),
    "Fixture marker",
  )
  await writeFile(join(repoRoot, "pnpm-workspace.yaml"), "packages: []\n")
  const report = join(f.root, owner, "AUDIT-example.md")
  const brief = join(repoRoot, "ROUND-TS-example-brief.md")
  const phases: Record<string, unknown> = {}
  for (const phase of ["audit", "vet", "rebut", "fix", "brief"] as const) {
    const assistant =
      phase === "fix"
        ? "codex"
        : phase === "brief"
          ? "claude"
          : phase === "vet"
            ? auditor === "codex"
              ? "claude"
              : "codex"
            : auditor
    const sessionId = phase === "rebut" ? "audit-session" : `${phase}-session`
    const file =
      phase === "fix"
        ? null
        : phase === "audit"
          ? report
          : phase === "brief"
            ? brief
            : join(f.root, owner, `${phase.toUpperCase()}-example.md`)
    const final = `Complete ${phase} text.\n\n| Result | Value |\n| --- | --- |\n| Round | ${phase} |\nPHASE RESULT: ${JSON.stringify({ status: phase === "fix" && ruling ? "needs-ruling" : "finished", file, reason: null })}`
    phases[phase] = {
      stream: await phaseStream(assistant, final, sessionId),
      usage: {
        path: join(f.root, `rollout-${sessionId}.jsonl`),
        text: await recorded("codex-rollout.jsonl"),
      },
    }
  }
  await f.configure({ phases })
  const visible: string[] = []
  const errors: string[] = []
  const status: string[] = []
  let clears = 0
  const options = {
    terminal: {
      write: (text: string) => {
        visible.push(text)
      },
      status: (text: string) => {
        status.push(text)
      },
      clear: () => {
        clears++
      },
    },
    emergency: (text: string) => {
      errors.push(text)
    },
    cacheRoot: join(f.root, "cache"),
  }
  const records = async () => {
    const names = (await readdir(repoRoot)).filter((name) =>
      name.startsWith("ROUND-TS-"),
    )
    assert.equal(names.length, 2)
    const log = await readFile(
      join(repoRoot, names.find((name) => name.endsWith(".log")) as string),
      "utf8",
    )
    const transcript = join(
      repoRoot,
      names.find((name) => name.endsWith(".md")) as string,
    )
    const markdown = await readFile(transcript, "utf8")
    return { log, markdown, transcript }
  }
  return {
    ...f,
    repoRoot,
    report,
    brief,
    phases,
    visible,
    errors,
    status,
    clears: () => clears,
    options,
    records,
    runtime: { ...f.runtime, cwd: repoRoot },
  }
}

for (const auditor of ["claude", "codex"] as const) {
  for (const owner of ["repo-edu", "plan"] as const) {
    for (const ruling of [false, true]) {
      test(`command runs ${auditor} audit, ${owner} routing and ${ruling ? "ruling" : "completion"}`, async (t) => {
        const f = await roundFixture(t, auditor, owner, ruling)
        const { repoRoot, brief } = f
        const argv = [
          "example.md",
          "2-3",
          ...(auditor === "claude" ? ["--auditor", "claude"] : []),
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
            "claude",
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
        assert.match(log, /TypeScript runner/)
        assert.match(log, /fixer +codex +chosen-model high/)
        assert.match(log, /briefer +claude +claude-model high/)
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
          log.includes(`Phase arguments (JSON array): ["example.md","2-3"]`),
        )
        assert.ok(
          log.includes(
            `Phase arguments (JSON array): ${JSON.stringify([transcript])}`,
          ),
        )
        assert.ok(log.includes(`${repoRoot}/.claude/commands/brief.md`))
        assert.ok(log.includes(`[brief] finished: ${brief}`))
        assert.equal(
          log.split(
            `Phase arguments (JSON array): ${JSON.stringify([f.report])}`,
          ).length - 1,
          3,
        )
        assert.ok(
          log.includes(`${join(f.root, owner)}/.agents/skills/fix/SKILL.md`),
        )
        assert.match(log, /audit-round-probe-error/)
        assert.equal(visible.includes("audit-round-probe-error"), false)
        assert.equal(log.includes("\u001b"), false)
        if (ruling) {
          // The brief lands before the ruling session opens, because the ruling is read from it.
          assert.equal(calls.at(-2).assistant, "claude")
          assert.deepEqual(calls.at(-1).args, [
            "resume",
            "--approve-for-me",
            "fix-session",
          ])
          assert.match(visible, /Opening codex session fix-session/)
          assert.doesNotMatch(visible, /Audit round finished\./)
        } else assert.match(visible, /Audit round finished\./)
        assert.ok(f.clears() >= 4)
      })
    }
  }
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
      assert.match(log, /Resume: codex resume --approve-for-me audit-session/)
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
    /Resume: codex resume --approve-for-me audit-session/,
  )
})

test("a recording failure during update output cannot be treated as an update warning", async (t) => {
  const f = await roundFixture(t)
  assert.equal(
    await runCommand(["example.md"], f.runtime, {
      ...f.options,
      openFiles(paths) {
        const files = openRunFiles(paths)
        return {
          ...files,
          log(text) {
            if (text === "claude update output")
              throw new Error("Update recording failed")
            files.log(text)
          },
        }
      },
    }),
    1,
  )
  assert.equal((await f.calls()).length, 1)
  assert.match(f.errors.join("\n"), /Update recording failed/)
})

test("argument errors and help start no assistant processes", async (t) => {
  const f = await roundFixture(t)
  for (const argv of [
    [],
    ["example.md", "3-1"],
    ["example.md", "0"],
    ["example.md", "--auditor", "other"],
    ["example.md", "--unknown"],
    ["brief"],
    ["brief", "ROUND-TS-example.md", "extra"],
  ])
    assert.equal(await runCommand(argv, f.runtime, f.options), 2)
  for (const argv of [["--help"], ["round", "--help"], ["brief", "--help"]])
    assert.equal(await runCommand(argv, f.runtime, f.options), 0)
  await assert.rejects(readFile(join(f.root, "calls.jsonl")), {
    code: "ENOENT",
  })
  const visible = f.visible.join("\n")
  assert.match(visible, /Codex always fixes/)
  assert.match(visible, /always briefs/)
  assert.match(visible, /plain-words brief/)
})

test("a brief on its own retells the named transcript without a new round pair", async (t) => {
  const f = await roundFixture(t)
  const transcript = join(
    f.repoRoot,
    "ROUND-TS-example-step-7-claude-2026-09-12T22-17-38.md",
  )
  await writeFile(transcript, "# Audit round of example.md 7\n")
  assert.equal(
    await runCommand(
      ["brief", "ROUND-TS-example-step-7-claude-2026-09-12T22-17-38.md"],
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
    ["claude"],
  )
  const names = (await readdir(f.repoRoot)).filter((name) =>
    name.startsWith("ROUND-TS-"),
  )
  const logName = names.find((name) => name.endsWith(".log")) as string
  assert.match(
    logName,
    /^ROUND-TS-example-step-7-claude-2026-09-12T22-17-38-brief-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.log$/,
  )
  assert.deepEqual(
    names.toSorted(),
    [
      logName,
      "ROUND-TS-example-step-7-claude-2026-09-12T22-17-38.md",
    ].toSorted(),
  )
  const log = await readFile(join(f.repoRoot, logName), "utf8")
  assert.match(
    log,
    /^Brief of ROUND-TS-example-step-7-claude-2026-09-12T22-17-38\.md\n/,
  )
  assert.ok(
    log.includes(
      `Phase arguments (JSON array): ${JSON.stringify([transcript])}`,
    ),
  )
  assert.match(log, /briefer +claude +claude-model high/)
  assert.doesNotMatch(log, /auditor|fixer/)
  const visible = f.visible.join("\n")
  assert.ok(visible.includes("Complete brief text."))
  assert.match(visible, /Brief finished\./)
  assert.equal(
    await readFile(transcript, "utf8"),
    "# Audit round of example.md 7\n",
  )
})

test("a brief on its own refuses a transcript that is not a Markdown file at the root", async (t) => {
  const f = await roundFixture(t)
  for (const name of ["missing.md", "pnpm-workspace.yaml"]) {
    assert.equal(await runCommand(["brief", name], f.runtime, f.options), 1)
    assert.match(
      f.errors.at(-1) as string,
      /Name a round's ROUND-TS-\*\.md transcript/,
    )
  }
  await assert.rejects(readFile(join(f.root, "calls.jsonl")), {
    code: "ENOENT",
  })
})

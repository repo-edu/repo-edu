import assert from "node:assert/strict"
import { mkdir, readdir, readFile, symlink, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { test } from "node:test"
import { execa } from "execa"
import { split } from "shellwords"
import { openRunFiles } from "../run-files.js"
import { runCommand, testSettings } from "./configured-runner.js"
import { phaseStream } from "./helpers.js"
import { commitFixture, roundFixture } from "./round-fixture.js"

test("a ruling stays in the runner and resumes the fix without replaying internal prompts", async (t) => {
  const f = await roundFixture(t, "codex", "repo-edu", true)
  const reply = "Choose option 1.\nKeep the existing range."
  let requests = 0
  const code = await runCommand(
    ["example.md", "--auditor", "codex,claude", "--no-watch"],
    f.runtime,
    {
      ...f.options,
      readReply: async () => {
        requests++
        assert.ok(f.visible.includes("Written ruling by fix"))
        assert.doesNotMatch(
          f.visible.join("\n"),
          /\[brief\] starting|Written brief/,
        )
        const stream = await phaseStream(
          "codex",
          'Applied the ruling.\nPHASE RESULT: {"status":"finished","reason":null}',
          "fix-session",
        )
        await f.configure({
          phases: {
            ...f.phases,
            fix: {
              ...(f.phases.fix as Record<string, unknown>),
              assistants: { codex: { stream } },
              commits: [
                {
                  cwd: f.repoRoot,
                  subject:
                    "example/impl-audit-all oth c1 fix(audit-round): apply ruling",
                },
              ],
            },
          },
        })
        return reply
      },
    },
  )
  assert.equal(code, 0, f.errors.join("\n"))
  assert.equal(requests, 1)
  const visible = f.visible.join("\n")
  assert.match(visible, /Applied the ruling/)
  assert.equal(f.visible.filter((text) => text === "Written brief").length, 1)
  assert.ok(
    visible.indexOf("Applied the ruling") < visible.indexOf("Written brief"),
  )
  assert.doesNotMatch(
    visible,
    /Run the .* phase|Phase arguments|SKILL\.md|OpenAI Codex/,
  )
  assert.match(
    visible,
    /Auditor sequence stopped: this round required your ruling/,
  )
  const calls = await f.calls()
  assert.equal(
    calls.some((call) => call.args[0] === "resume"),
    false,
  )
  const resumed = calls.find(
    (call) => call.args[0] === "exec" && call.args.includes("fix-session"),
  )
  assert.ok(resumed)
  assert.ok(resumed.args.includes("--json"))
  assert.ok(resumed.args.includes("--approve-for-me"))
  const { markdown, log } = await f.records()
  assert.ok(markdown.includes(`## User ruling\n\n${reply}`))
  assert.ok(log.includes(reply))
  assert.match(log, /Run the fix phase .* resumed session/)
  assert.equal(log.match(/\[brief\] starting/g)?.length, 1)
  assert.match(log, /Written brief/)
  assert.doesNotMatch(markdown, /Written brief/)
  assert.equal((await f.roundFiles()).length, 2)
})

for (const working of ["repo-edu", "plan"] as const) {
  test(`episode at ${working} prints shared evidence and resolves stems and explicit anchors without writes`, async (t) => {
    const f = await roundFixture(
      t,
      "codex",
      working,
      false,
      null,
      false,
      working,
    )
    const root = f.runtime.cwd
    const older = await commitFixture(
      root,
      "older/impl-1 oth docs(x): older topic",
    )
    await commitFixture(root, "oth docs(x): unstemmed anchor")
    const unstemmed = (await execa("git", ["rev-parse", "HEAD"], { cwd: root }))
      .stdout
    const newest = await commitFixture(
      root,
      "newest/impl-1 oth docs(x): newest topic",
    )
    const before = await Promise.all(
      [f.repoRoot, f.planRoot, f.options.cacheRoot].map((path) =>
        readdir(path, { recursive: true }),
      ),
    )
    const invoke = async (target?: string) => {
      f.visible.length = 0
      assert.equal(
        await runCommand(
          ["episode", ...(target === undefined ? [] : [target])],
          f.runtime,
          f.options,
        ),
        0,
        f.errors.join("\n"),
      )
      return JSON.parse(f.visible.join("\n"))
    }
    assert.equal((await invoke()).topic, "newest")
    const stem = await invoke("topology-example")
    assert.equal(stem.topic, "example")
    assert.equal(stem.repositories.length, 2)
    const anchored = await invoke(older)
    assert.equal(anchored.topic, "older")
    assert.ok(
      anchored.repositories
        .find((entry: { repository: string }) => entry.repository === working)
        .anchor.startsWith(older),
    )
    const fallback = await invoke("HEAD-1")
    assert.equal(fallback.topic, "newest")
    assert.equal(
      fallback.repositories.find(
        (entry: { repository: string }) => entry.repository === working,
      ).anchor,
      unstemmed,
    )
    const head = await invoke("HEAD")
    assert.ok(
      head.repositories
        .find((entry: { repository: string }) => entry.repository === working)
        .head.startsWith(newest),
    )
    const exampleAnchor = await invoke(f.heads[working])
    for (const entry of exampleAnchor.repositories)
      assert.ok(
        entry.anchor.startsWith(
          f.heads[entry.repository as keyof typeof f.heads],
        ),
      )
    assert.deepEqual(
      await Promise.all(
        [f.repoRoot, f.planRoot, f.options.cacheRoot].map((path) =>
          readdir(path, { recursive: true }),
        ),
      ),
      before,
    )
    await assert.rejects(readFile(join(f.root, "calls.jsonl")), {
      code: "ENOENT",
    })
  })
}

for (const working of ["repo-edu", "plan"] as const) {
  for (const tag of ["abl", "otx", "oux", "auh"]) {
    test(`name at ${working} preserves the actual ${tag} auditor and only writes its claim`, async (t) => {
      const f = await roundFixture(
        t,
        "codex",
        working,
        false,
        null,
        false,
        working,
      )
      const root = f.runtime.cwd
      const target = working === "plan" ? "example" : "example-step-2"
      const peer = working === "plan" ? f.repoRoot : f.planRoot
      await writeFile(join(peer, `${target}-09-1-audit.oth.md`), "Peer report")
      const before = await readdir(root)
      const settings = structuredClone(testSettings)
      for (const assistant of ["claude", "codex"] as const)
        settings.phases.audit[assistant] = {
          model: settings.strengthModels[assistant].top,
          effort: "medium",
        }
      const args = [
        "name",
        "example.md",
        ...(working === "plan" ? [] : ["2"]),
        "--auditor",
        tag,
      ]
      assert.equal(
        await runCommand(args, f.runtime, { ...f.options, settings }),
        0,
        f.errors.join("\n"),
      )
      assert.deepEqual(
        f.visible,
        [`${target}-10-claim.md`, `${target}-10-1-audit.${tag}.md`].map(
          (name) => join(root, name),
        ),
      )
      assert.deepEqual(
        (await readdir(root)).filter((name) => !before.includes(name)),
        [`${target}-10-claim.md`],
      )
      assert.equal(await readFile(f.visible[0], "utf8"), "")
      f.visible.length = 0
      assert.equal(await runCommand(args, f.runtime, f.options), 0)
      assert.equal(f.visible[0], join(root, `${target}-11-claim.md`))
      await assert.rejects(readFile(join(f.root, "calls.jsonl")), {
        code: "ENOENT",
      })
    })
  }
}

test("name shares commit range and list targets with the runner", async (t) => {
  const f = await roundFixture(t)
  for (const [references, target] of [
    [["HEAD-2..HEAD"], `${f.heads["repo-edu"]}-2..${f.heads["repo-edu"]}`],
    [["abcd", "HEAD", "ef01"], "abcd-plus-2"],
  ] as const) {
    f.visible.length = 0
    assert.equal(
      await runCommand(
        ["name", ...references, "--auditor", "oux"],
        f.runtime,
        f.options,
      ),
      0,
    )
    assert.equal(f.visible[1], join(f.repoRoot, `${target}-01-1-audit.oux.md`))
  }
})

test("name requires a complete session tag before any assistant or claim", async (t) => {
  const f = await roundFixture(t)
  for (const tag of [null, "o", "ot", "ox", "utx", "otz", "otxx", "Otx"]) {
    assert.equal(
      await runCommand(
        ["name", "example.md", ...(tag === null ? [] : ["--auditor", tag])],
        f.runtime,
        f.options,
      ),
      2,
    )
  }
  assert.equal(
    (await readdir(f.repoRoot)).some((name) => name.endsWith("-claim.md")),
    false,
  )
  await assert.rejects(readFile(join(f.root, "calls.jsonl")), {
    code: "ENOENT",
  })
})

test("name preserves the hand-run implementation-step route at the plan root", async (t) => {
  const f = await roundFixture(t, "codex", "plan", false, null, false, "plan")
  assert.equal(
    await runCommand(
      ["name", "example.md", "2-3", "--auditor", "oux"],
      f.runtime,
      f.options,
    ),
    0,
  )
  assert.equal(
    f.visible[1],
    join(f.planRoot, "example-steps-2-3-01-1-audit.oux.md"),
  )
  assert.equal(
    await runCommand(
      ["name", "abcd", "ef01", "--auditor", "oux"],
      f.runtime,
      f.options,
    ),
    2,
  )
})

for (const working of ["repo-edu", "plan"] as const) {
  test(`close at ${working} removes only the exact round's numbered report kinds without assistant startup`, async (t) => {
    const f = await roundFixture(
      t,
      "codex",
      working,
      false,
      null,
      false,
      working,
    )
    const root = f.runtime.cwd
    const target = "abcd-2..ef01-01"
    const removed = [
      "1-audit.oux.md",
      "1-audit.abl.md",
      "2-vet.ath.md",
      "3-rebut.oux.md",
    ].map((suffix) => `${target}-${suffix}`)
    const retained = [
      `${target}-claim.md`,
      `${target}-0-round.oux.md`,
      `${target}-0-round.oux.log`,
      `${target}-5-brief.obm.md`,
      `${target}-5-brief.obm.log`,
      `${target}-6-ruling.oth.md`,
      `${target}-8-watch.oth.md`,
      `${target}-2-audit.oux.md`,
      `${target}-1-audit.md`,
      `${target}-1-audit.oux.log`,
      "abcd-2..ef01-010-1-audit.oux.md",
      "abcd-2..ef01-02-1-audit.oux.md",
      "abcd-2..ef01-extra-01-1-audit.oux.md",
    ]
    for (const name of [...removed, ...retained])
      await writeFile(join(root, name), name)
    const peerFile = join(
      working === "plan" ? f.repoRoot : f.planRoot,
      removed[0],
    )
    await writeFile(peerFile, "Peer report")
    for (const invalid of [
      "example",
      "../example-01",
      "/example-01",
      "example-1",
    ])
      assert.equal(
        await runCommand(["close", invalid], f.runtime, f.options),
        2,
      )
    assert.equal(await runCommand(["close", target], f.runtime, f.options), 0)
    const names = await readdir(root)
    for (const name of removed) assert.equal(names.includes(name), false, name)
    for (const name of retained) assert.ok(names.includes(name), name)
    assert.equal(await readFile(peerFile, "utf8"), "Peer report")
    assert.equal(await runCommand(["close", target], f.runtime, f.options), 0)
    await assert.rejects(readFile(join(f.root, "calls.jsonl")), {
      code: "ENOENT",
    })
  })
}

test("one supplied configuration controls default auditor, phase arguments and output tags", async (t) => {
  const f = await roundFixture(t, "claude", "repo-edu", false, null, true)
  const settings = structuredClone(testSettings)
  settings.defaultAuditor = "claude"
  settings.phases.audit.claude = { model: "chosen-auditor", effort: "low" }
  settings.phases.watch = {
    assistant: "codex",
    model: "chosen-watch",
    effort: "medium",
  }
  settings.phases["watch-edit"] = {
    assistant: "codex",
    model: null,
    effort: "medium",
  }
  settings.strengthModels.codex.top = "chosen-watch"
  assert.equal(
    await runCommand(["example.md", "3"], f.runtime, {
      ...f.options,
      settings,
    }),
    0,
  )
  const { log, transcript } = await f.records()
  assert.ok(transcript.endsWith("-0-round.aul.md"))
  assert.match(log, /audit +claude +chosen-auditor low +settings\.json/)
  assert.match(log, /watch +codex +chosen-watch medium +settings\.json/)
  assert.match(
    log,
    /watch-edit +codex +chosen-model medium +codex settings\/settings\.json/,
  )
  const watchCall = (await f.prompts()).find(
    (call) =>
      call.assistant === "codex" && /^Run the watch phase /.test(call.prompt),
  )
  assert.ok(watchCall.args.includes("chosen-watch"))
  assert.ok(watchCall.args.includes("model_reasoning_effort=medium"))
  assert.ok(watchCall.prompt.includes("-8-watch.otm.md"))
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
        assert.ok(invocations[2].args.includes("audit-session"))
        assert.equal(invocations[3].args.includes("resume"), false)
        // The fix commits the round, so it carries the round's commit stamps:
        // the phases grouped by what they ran on, and the auditor's capability
        // tag. The phase reports take precedence over the startup settings.
        const stamps = {
          phases:
            auditor === "codex"
              ? "audit, rebut: gpt-6-astra high\nvet: claude-fable-5-1 high\nfix: chosen-model high"
              : "audit, rebut: claude-fable-5-1 high\nvet: gpt-6-astra high\nfix: chosen-model high",
          auditor: auditor === "codex" ? "oth" : "ath",
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
          if (ruling) assert.ok((await readFile(path, "utf8")).length > 0)
          else await assert.rejects(readFile(path), { code: "ENOENT" })
        }
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
        assert.equal(visible.includes("Complete brief text."), false)
        assert.equal(
          f.visible.filter((text) => text === "Written brief").length,
          ruling ? 0 : 1,
        )
        assert.equal(log.includes("Written brief"), !ruling)
        assert.equal(markdown.includes("Written brief"), false)
        assert.ok(
          log.includes(
            `Phase arguments (JSON array): ${JSON.stringify([f.report, "example.md", "2-3"])}`,
          ),
        )
        assert.equal(
          log.includes(
            `Phase arguments (JSON array): ${JSON.stringify([transcript, f.brief])}`,
          ),
          !ruling,
        )
        assert.equal(
          log.includes(join(repoRoot, ".agents/skills/brief/SKILL.md")),
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
        assert.ok(log.includes(join(repoRoot, ".agents/skills/fix/SKILL.md")))
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
      [auditor],
    )
    const commit = (
      await execa("git", ["log", "-1", "--format=%s%n%b"], { cwd: f.planRoot })
    ).stdout
    assert.match(
      commit,
      new RegExp(
        `^example/impl-audit-2-3 ${auditor === "codex" ? "oth" : "ath"} clean:`,
      ),
    )
    assert.ok(
      commit.includes(
        auditor === "codex"
          ? "audit: gpt-6-astra high"
          : "audit: claude-fable-5-1 high",
      ),
    )
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
            ? "audit: gpt-6-astra high\nvet: claude-fable-5-1 high\nfix: chosen-model high"
            : "audit: claude-fable-5-1 high\nvet: gpt-6-astra high\nfix: chosen-model high",
        auditor: auditor === "codex" ? "oth" : "ath",
      },
    )
    const { log, markdown } = await f.records()
    assert.doesNotMatch(log, /\[rebut\] starting/)
    const files = await readdir(f.repoRoot)
    assert.equal(
      files.some((name) => name.includes("-3-rebut.")),
      false,
    )
    assert.ok(files.includes("example-steps-2-3-01-5-brief.oul.md"))
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
    for (const output of [log, f.visible.join("\n")])
      assert.doesNotMatch(output, /Files at repository roots:/)
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
        : ["--model", "claude-fable-5-1", "--effort", "xhigh"]
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
        : /audit +claude +claude-fable-5-1 extra high +--auditor/,
    )
    assert.match(log, /fix +codex +chosen-model high +codex settings/)
    assert.match(log, /brief +codex +gpt-5\.6-terra low +settings\.json/)
    // The requested alias and effort stay in the arguments and header above.
    // The fix receives the release and effort reported by each phase instead.
    assert.deepEqual(
      { phases: invocations[3].phases, auditor: invocations[3].auditor },
      {
        phases:
          auditor === "codex"
            ? "audit, rebut: gpt-6-astra high\nvet: claude-fable-5-1 high\nfix: chosen-model high"
            : "audit, rebut: claude-fable-5-1 high\nvet: gpt-6-astra high\nfix: chosen-model high",
        auditor: auditor === "codex" ? "oth" : "ath",
      },
    )
  })
}

for (const auditor of ["codex", "claude"] as const) {
  test(`--auditor ${auditor} inherits CLI settings for audit and rebuttal despite phase pins`, async (t) => {
    const f = await roundFixture(t, auditor)
    const settings = structuredClone(testSettings)
    settings.defaultAuditor = auditor === "codex" ? "claude" : "codex"
    settings.phases.audit[auditor] = { model: "pinned-auditor", effort: "low" }
    settings.phases.fix = { model: "pinned-fix", effort: "medium" }
    assert.equal(
      await runCommand(["example.md", "--auditor", auditor], f.runtime, {
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
          `${phase} +${auditor} +${auditor === "claude" ? "claude-model" : "chosen-model"} high +${auditor} settings`,
        ),
      )
    assert.ok(
      transcript.endsWith(`-0-round.${auditor === "claude" ? "a" : "o"}uh.md`),
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
    ["example.md", "--auditor", "other"],
    ["example.md", "--auditor", ""],
    ["example.md", "--auditor", "codex,"],
    ["example.md", "--auditor", ",claude"],
    ["example.md", "--auditor", "codex,,claude"],
    ["example.md", "--auditor", "codex, ,claude"],
    ["example.md", "--auditor", "codex,other"],
    ["example.md", "--chain"],
    ["name", "example.md", "--auditor", "oth,ath"],
    // A tag names its fields by letter, in order, and never asks for `u`.
    ["example.md", "--auditor", "claudex"],
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
  assert.match(f.errors.join("\n"), /Auditor entry 2: expected/)
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
  assert.match(visible, /Codex\s+always fixes/)
  assert.match(visible, /plain-words brief/)
  assert.match(
    visible,
    /--auditor <selections>\s+comma-separated auditors in round order/,
  )
  assert.doesNotMatch(visible, /--chain/)
  assert.match(visible, /<effort>\s+l = low, m = medium, h = high, x = xhigh/)
  assert.match(visible, /default auditor comes from\s+settings\.json/)
  assert.match(visible, /Targets and scope:/)
  assert.match(visible, /Auditor selection \(--auditor <selections>\):/)
  assert.match(visible, /<assistant>\[<tier>\]\[<effort>\]/)
  assert.match(visible, /--auditor atx,obm/)
  assert.match(visible, /Round sequence:/)
  assert.match(visible, /Examples \(from Repo Edu\):/)
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
        `Phase arguments (JSON array): ${JSON.stringify([f.report, ...commits])}`,
      ),
    )
    assert.ok(
      markdown.startsWith(`# Audit round of commits ${commits.join(" ")}\n`),
    )
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

test("a brief on its own retells the named transcript without a new round pair", async (t) => {
  const f = await roundFixture(t)
  const transcript = join(f.repoRoot, "example-step-7-01-0-round.abx.md")
  await writeFile(transcript, "# Audit round of implementation example.md 7\n")
  assert.equal(
    await runCommand(
      ["brief", "example-step-7-01-0-round.abx.md"],
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
  assert.match(logName, /^example-step-7-01-5-brief\.oul\.log$/)
  assert.deepEqual(
    names.toSorted(),
    [
      logName,
      "example-step-7-01-0-round.abx.md",
      "example-step-7-01-5-brief.oul.md",
    ].toSorted(),
  )
  const log = await readFile(join(f.repoRoot, logName), "utf8")
  assert.match(log, /Brief of example-step-7-01-0-round\.abx\.md\n/)
  assert.ok(
    log.includes(
      `Phase arguments (JSON array): ${JSON.stringify([transcript, f.brief])}`,
    ),
  )
  assert.match(log, /brief +codex +gpt-5\.6-terra low/)
  assert.doesNotMatch(log, /audit +codex|fix +codex/)
  const visible = f.visible.join("\n")
  assert.equal(visible.includes("Complete brief text."), false)
  assert.equal(f.visible.filter((text) => text === "Written brief").length, 1)
  assert.match(log, /Written brief/)
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
      `Phase arguments (JSON array): ${JSON.stringify([f.report, "example.md", "2-3"])}`,
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
    join(f.repoRoot, "../plan/example-01-0-round.oth.md"),
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
      /Name a round's \*-0-round\.<tag>\.md transcript/,
    )
  }
  await assert.rejects(readFile(join(f.root, "calls.jsonl")), {
    code: "ENOENT",
  })
})

test("repeated auditor entries run beyond the old cap with one startup", async (t) => {
  const f = await roundFixture(t, "codex", "repo-edu", false, "b")
  assert.equal(
    await runCommand(
      ["example.md", "3", "--auditor", "codex,codex,codex,codex"],
      f.runtime,
      f.options,
    ),
    0,
    f.errors.join("\n"),
  )
  const names = (await f.roundFiles()).toSorted()
  assert.deepEqual(names, [
    "example-step-3-01-0-round.ouh.log",
    "example-step-3-01-0-round.ouh.md",
    "example-step-3-02-0-round.ouh.log",
    "example-step-3-02-0-round.ouh.md",
    "example-step-3-03-0-round.ouh.log",
    "example-step-3-03-0-round.ouh.md",
    "example-step-3-04-0-round.ouh.log",
    "example-step-3-04-0-round.ouh.md",
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

test("a clean fix record does not skip later entries for the same auditor", async (t) => {
  const f = await roundFixture(t, "codex", "repo-edu", false, null)
  assert.equal(
    await runCommand(
      ["example.md", "--auditor", "codex,codex,claude"],
      f.runtime,
      f.options,
    ),
    0,
    f.errors.join("\n"),
  )
  const names = (await f.roundFiles()).toSorted()
  assert.deepEqual(names, [
    "example-all-01-0-round.ouh.log",
    "example-all-01-0-round.ouh.md",
    "example-all-02-0-round.ouh.log",
    "example-all-02-0-round.ouh.md",
    "example-all-03-0-round.auh.log",
    "example-all-03-0-round.auh.md",
  ])
  const visible = f.visible.join("\n")
  assert.match(visible, /Next round: codex; 2 auditor entries remain\./)
  assert.match(visible, /Auditor sequence finished after 3 rounds\./)
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
  const watch = transcript.replace(/-0-round\.ouh\.md$/, "-8-watch.ouh.md")
  assert.match(
    log,
    /\n─{72}\n\[glance\] due: episode example recorded red at [0-9a-f]+\. A red record is re-read every round \(rule 1\)\./,
  )
  assert.ok(log.includes(join(f.repoRoot, ".agents/skills/watch/SKILL.md")))
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
  assert.ok(log.includes(`[watch-edit] finished`))
  // The watch follows the round it grades, so none of its text enters the transcript.
  assert.equal(markdown.includes("## watch ("), false)
  assert.ok(f.visible.join("\n").includes("Complete watch text."))
  assert.match(f.visible.join("\n"), /Audit round finished\./)
})

for (const target of ["implementation", "planning", "commits"] as const) {
  test(`--no-brief omits briefs from ${target} rounds while preserving completion and watch`, async (t) => {
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
        : ["example.md", "--auditor", "codex,claude"]
    assert.equal(
      await runCommand([...args, "--no-brief"], f.runtime, f.options),
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
      assert.match(visible, /Auditor sequence finished after 2 rounds\./)
      assert.equal(visible.match(/\[watch-edit\] finished/g)?.length, 2)
    }
    const files = await readdir(f.runtime.cwd)
    assert.equal(
      files.some((name) => /-5-brief\./.test(name)),
      false,
    )
    assert.equal(
      files.some((name) => /-[123]-(audit|vet|rebut)\./.test(name)),
      false,
    )
    for (const name of await f.roundFiles()) {
      const text = await readFile(join(f.runtime.cwd, name), "utf8")
      assert.doesNotMatch(text, /\[brief\]|^brief\s|Written brief/m)
      assert.match(text, /## fix|\[fix\] finished/)
    }
  })
}

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

test("a chained run stops at the round that requires a ruling", async (t) => {
  const f = await roundFixture(t, "codex", "repo-edu", true)
  assert.equal(
    await runCommand(
      ["example.md", "--auditor", "codex,claude"],
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
    names.every((name) => name.startsWith("example-step-3-01-0-round.ouh.")),
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
          `example-01-0-round.${auditor === "codex" ? "ouh" : "auh"}.md`,
        ),
      )
      assert.match(log, /Audit round of plan example-widen\.md/)
      assert.ok(
        log.includes(
          `Phase arguments (JSON array): ${JSON.stringify([f.report, "example-widen.md"])}`,
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
      assert.equal(
        log.includes(join(f.repoRoot, ".agents/skills/brief/SKILL.md")),
        !ruling,
      )
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
              ? "audit, rebut: gpt-6-astra high\nvet: claude-fable-5-1 high\nfix: chosen-model high"
              : "audit, rebut: claude-fable-5-1 high\nvet: gpt-6-astra high\nfix: chosen-model high",
          auditor: auditor === "codex" ? "oth" : "ath",
        },
      )
      if (ruling) {
        assert.ok(
          log.includes(
            join(f.repoRoot, ".agents/skills/fix/references/ruling.md"),
          ),
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
          /-(?:0-round\.[ao][btu][lmhx]\.(?:md|log)|claim\.md)$/.test(name),
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
      const transcript = join(outputRoot, "example-01-0-round.oth.md")
      await writeFile(transcript, "# Planning round\n")
      const argument =
        working === owner
          ? "example-01-0-round.oth.md"
          : `../${owner}/example-01-0-round.oth.md`
      assert.equal(
        await runCommand(["brief", argument], f.runtime, f.options),
        0,
        f.errors.join("\n"),
      )
      const log = await readFile(
        join(outputRoot, "example-01-5-brief.oul.log"),
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
          `Phase arguments (JSON array): ${JSON.stringify([transcript, f.brief])}`,
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
      if (missing) {
        f.phases[phase] = {
          ...(f.phases[phase] as object),
          document: undefined,
        }
        await f.configure({ phases: f.phases })
      } else await writeFile(file, "Malformed evidence")
      assert.equal(await runCommand(["example.md"], f.runtime, f.options), 1)
      const { log } = await f.records()
      assert.ok(log.includes(`[${phase}] failed:`))
      assert.ok(log.includes(`${phase}-session`))
      assert.doesNotMatch(log, /\[fix\] starting/)
    })
  }
}

for (const phase of [
  "audit",
  "vet",
  "rebut",
  "fix",
  "brief",
  "watch",
  "watch-edit",
] as const) {
  test(`an empty ${phase} output cannot complete its phase`, async (t) => {
    const ruling = phase === "fix"
    const f = await roundFixture(t, "codex", "repo-edu", ruling, null, !ruling)
    f.phases[phase] = {
      ...(f.phases[phase] as object),
      document: { text: " \n" },
    }
    await f.configure({ phases: f.phases })
    assert.equal(await runCommand(["example.md"], f.runtime, f.options), 1)
    const { log } = await f.records()
    assert.ok(log.includes(`[${phase}] failed: Phase output is empty:`))
    assert.ok(
      log.includes(`Session: ${phase === "rebut" ? "audit" : phase}-session`),
    )
  })
}

test("a fix cannot request a ruling without writing its supplied document", async (t) => {
  const f = await roundFixture(t, "codex", "repo-edu", true)
  f.phases.fix = { ...(f.phases.fix as object), document: undefined }
  await f.configure({ phases: f.phases })
  assert.equal(await runCommand(["example.md"], f.runtime, f.options), 1)
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

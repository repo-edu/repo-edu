import assert from "node:assert/strict"
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { test } from "node:test"
import { runCommand, testSettings } from "./configured-runner.js"
import { phaseStream } from "./helpers.js"
import { roundFixture } from "./round-fixture.js"

test("a ruling resumes the fix and the remaining auditor sequence without replaying internal prompts", async (t) => {
  const f = await roundFixture(t, "codex", "repo-edu", true)
  const reply = "Choose option 1.\nKeep the existing range."
  let requests = 0
  const code = await runCommand(
    ["example.md", "1", "--auditor", "codex,claude", "--no-watch", "--brief"],
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
                    "example/impl-audit-1 oth growth-none c1 fix(audit-round): apply ruling",
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
  assert.equal(f.visible.filter((text) => text === "Written brief").length, 2)
  assert.ok(
    visible.indexOf("Applied the ruling") < visible.indexOf("Written brief"),
  )
  assert.doesNotMatch(
    visible,
    /Run the .* phase|Phase arguments|SKILL\.md|OpenAI Codex/,
  )
  assert.match(visible, /Next round: claude; 1 auditor entries remain\./)
  assert.match(visible, /Auditor sequence finished after 2 rounds\./)
  assert.doesNotMatch(visible, /Auditor sequence stopped/)
  const stored = JSON.parse(
    await readFile(join(f.planRoot, "example-impl-rounds.json"), "utf8"),
  ) as { auditor: { chosenBy: string } }[]
  assert.deepEqual(
    stored.map((entry) => entry.auditor.chosenBy),
    ["--auditor", "--auditor"],
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
  const roundFiles = await f.roundFiles()
  assert.equal(roundFiles.length, 4)
  const firstMarkdown = roundFiles.find((name) =>
    /-01-1-round\..+\.md$/.test(name),
  )
  const firstLog = roundFiles.find((name) => /-01-1-round\..+\.log$/.test(name))
  assert.ok(firstMarkdown)
  assert.ok(firstLog)
  const markdown = await readFile(join(f.planRoot, firstMarkdown), "utf8")
  const log = await readFile(join(f.planRoot, firstLog), "utf8")
  assert.ok(markdown.includes(`## User ruling\n\n${reply}`))
  assert.ok(log.includes(reply))
  assert.match(log, /Run the fix phase .* resumed session/)
  assert.equal(log.match(/\[brief\] starting/g)?.length, 1)
  assert.match(log, /Written brief/)
  assert.doesNotMatch(markdown, /Written brief/)
})

/** The ruling pause lets a test act as the user editing the queue mid-round. */
async function finishFixOnReply(
  f: Awaited<ReturnType<typeof roundFixture>>,
  judgeAnswers?: readonly string[],
) {
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
              "example/impl-audit-1 oth growth-none c1 fix(audit-round): apply ruling",
          },
        ],
      },
      ...(judgeAnswers === undefined
        ? {}
        : { judge: await judgePhase(f, judgeAnswers) }),
    },
  })
}

for (const { auditors, seeded, edit, rounds } of [
  // Extending a single round.
  { auditors: "codex", seeded: "", edit: "claude\n", rounds: 2 },
  // Emptying the queue ends the sequence after this round.
  {
    auditors: "codex,claude,atx",
    seeded: "claude\natx\n",
    edit: "",
    rounds: 1,
  },
  // Deleting the file does the same.
  { auditors: "codex claude", seeded: "claude\n", edit: null, rounds: 1 },
  // Entries may share a line, as in --auditor.
  { auditors: "codex", seeded: "", edit: "claude, a\n", rounds: 3 },
]) {
  test(`the queue file seeded with ${JSON.stringify(seeded)} takes ${JSON.stringify(edit)} before the next round`, async (t) => {
    const f = await roundFixture(t, "codex", "repo-edu", true)
    const queue = join(f.planRoot, "example-impl-01..01-queue.md")
    const code = await runCommand(
      ["example.md", "1", "--auditor", auditors, "--no-watch"],
      f.runtime,
      {
        ...f.options,
        readReply: async () => {
          assert.equal(await readFile(queue, "utf8"), seeded)
          if (edit === null) await rm(queue)
          else await writeFile(queue, edit)
          await finishFixOnReply(f)
          return "Choose option 1."
        },
      },
    )
    assert.equal(code, 0, f.errors.join("\n"))
    assert.equal((await f.roundFiles()).length, rounds * 2)
    const visible = f.visible.join("\n")
    assert.ok(
      visible.includes(
        `Queued after this round: ${seeded.trim().split("\n").join(", ") || "none"}. Edit ${queue} to add or remove rounds.`,
      ),
    )
    assert.match(
      visible,
      new RegExp(
        `Auditor sequence finished after ${rounds} round${rounds === 1 ? "" : "s"}\\.`,
      ),
    )
    await assert.rejects(readFile(queue), { code: "ENOENT" })
  })
}

test("a malformed queue edit stops the sequence and names the entry", async (t) => {
  const f = await roundFixture(t, "codex", "repo-edu", true)
  const queue = join(f.planRoot, "example-impl-01..01-queue.md")
  const code = await runCommand(
    ["example.md", "1", "--auditor", "codex,claude", "--no-watch"],
    f.runtime,
    {
      ...f.options,
      readReply: async () => {
        await writeFile(queue, "claude\nclaud\n")
        await finishFixOnReply(f)
        return "Choose option 1."
      },
    },
  )
  assert.equal(code, 1)
  assert.ok(
    f.errors
      .join("\n")
      .includes(`${queue}: Auditor entry 2 (claud): expected claude, codex`),
  )
  assert.equal((await f.roundFiles()).length, 2)
  await assert.rejects(readFile(queue), { code: "ENOENT" })
})

test("a commit audit keeps no queue file", async (t) => {
  const f = await roundFixture(t)
  assert.equal(
    await runCommand(["HEAD", "--no-watch"], f.runtime, f.options),
    0,
    f.errors.join("\n"),
  )
  assert.doesNotMatch(
    f.visible.join("\n"),
    /Queued after this round|Auditor sequence/,
  )
})

async function judgePhase(
  f: Awaited<ReturnType<typeof roundFixture>>,
  answers: readonly string[],
): Promise<Record<string, unknown>> {
  const judge = f.phases.judge as Record<string, unknown>
  const streams = await Promise.all(
    answers.map((answer) =>
      phaseStream(
        "codex",
        `${answer}\n\nPHASE RESULT: {"status":"finished","reason":null}`,
        "judge-session",
      ),
    ),
  )
  return { ...judge, streams }
}

async function configureJudgeAnswers(
  f: Awaited<ReturnType<typeof roundFixture>>,
  answers: readonly string[],
) {
  await f.configure({
    phases: { ...f.phases, judge: await judgePhase(f, answers) },
  })
}

test("an automatic series follows the judged switch and ends on stop without a queue", async (t) => {
  const f = await roundFixture(
    t,
    "codex",
    "repo-edu",
    false,
    "c",
    false,
    "repo-edu",
    false,
    true,
  )
  await configureJudgeAnswers(f, [
    "Judge: continue with Claude. Claude should check the remaining concern.",
    "Judge: stop. The cross-check found no reason for another round.",
  ])

  assert.equal(
    await runCommand(["example.md", "1", "--no-watch"], f.runtime, f.options),
    0,
    `${f.errors.join("\n")}\n${f.visible.join("\n")}`,
  )
  const audits = (await f.prompts()).filter((call) =>
    call.prompt.startsWith("Run the audit phase "),
  )
  assert.deepEqual(
    audits.map((call) => call.assistant),
    ["codex", "claude"],
  )
  const visible = f.visible.join("\n")
  assert.match(visible, /Judge: continue with Claude\./)
  assert.match(visible, /Next round: claude, as judged;/)
  assert.match(visible, /Judge: stop\./)
  assert.match(
    visible,
    /Implementation audit of example, step 1: automatic auditor series stopped on the judge answer after 2 rounds\./,
  )
  const stored = JSON.parse(
    await readFile(join(f.planRoot, "example-impl-rounds.json"), "utf8"),
  ) as { status: string; judge: { answer: string } | null }[]
  assert.deepEqual(
    stored.map((entry) => ({
      status: entry.status,
      answer: entry.judge?.answer,
    })),
    [
      { status: "finished", answer: "claude" },
      { status: "finished", answer: "stop" },
    ],
  )
  await assert.rejects(
    readFile(join(f.planRoot, "example-impl-01..01-queue.md")),
    { code: "ENOENT" },
  )
})

test("an audit pair takes turns from a fixed first coin and keeps each rebuttal on that pick", async (t) => {
  const f = await roundFixture(
    t,
    "codex",
    "repo-edu",
    false,
    "b",
    false,
    "repo-edu",
    false,
    false,
    true,
  )
  const settings = structuredClone(testSettings)
  settings.maximumAutomaticRounds = 3
  settings.phases.audit.codex = [
    { model: "gpt-5.6-sol", effort: "medium" },
    { model: "gpt-6-astra", effort: "xhigh" },
  ]
  await configureJudgeAnswers(f, [
    "Judge: continue with Codex. Keep comparing the pair.",
    "Judge: continue with Codex. Keep comparing the pair.",
    "Judge: continue with Codex. Keep comparing the pair.",
  ])

  assert.equal(
    await runCommand(["example.md", "1", "--no-watch"], f.runtime, {
      ...f.options,
      settings,
      coin: () => 1,
    }),
    0,
    `${f.errors.join("\n")}\n${f.visible.join("\n")}`,
  )
  const prompts = await f.prompts()
  const expected = [
    ["gpt-6-astra", "model_reasoning_effort=xhigh"],
    ["gpt-5.6-sol", "model_reasoning_effort=medium"],
    ["gpt-6-astra", "model_reasoning_effort=xhigh"],
  ]
  for (const phase of ["audit", "rebut"]) {
    const calls = prompts.filter((call) =>
      call.prompt.startsWith(`Run the ${phase} phase `),
    )
    assert.equal(calls.length, 3)
    for (const [index, call] of calls.entries())
      for (const argument of expected[index])
        assert.ok(call.args.includes(argument), call.args.join(" "))
  }
  assert.match(
    f.visible.join("\n"),
    /Implementation audit of example, step 1: automatic auditor series reached its maximum of 3 rounds\./,
  )
})

test("an archived plan without --auditor is refused", async (t) => {
  const f = await roundFixture(
    t,
    "codex",
    "repo-edu",
    false,
    "c",
    false,
    "repo-edu",
    false,
    true,
  )
  const archive = join(f.planRoot, "archive/example")
  const archivedPlan = join(archive, "plan.md")
  await mkdir(archive, { recursive: true })
  await rm(join(f.planRoot, "example-widen.md"))
  await rename(join(f.planRoot, "example.md"), archivedPlan)

  assert.equal(
    await runCommand(["example.md", "1", "--no-watch"], f.runtime, f.options),
    1,
  )
  assert.match(f.errors.join("\n"), /Archived plans are not audit targets/)
  await assert.rejects(f.prompts())
})

test("a random default auditor opens the series on the coin and the series still follows judges", async (t) => {
  const f = await roundFixture(
    t,
    "claude",
    "repo-edu",
    false,
    "c",
    false,
    "repo-edu",
    false,
    true,
  )
  const settings = structuredClone(testSettings)
  settings.defaultAuditor = "random"
  await configureJudgeAnswers(f, [
    "Judge: continue with Codex. Codex should cross-check the first round.",
    "Judge: stop. The cross-check found no reason for another round.",
  ])

  assert.equal(
    await runCommand(["example.md", "1", "--no-watch"], f.runtime, {
      ...f.options,
      settings,
      coin: () => 0,
    }),
    0,
    `${f.errors.join("\n")}\n${f.visible.join("\n")}`,
  )
  const audits = (await f.prompts()).filter((call) =>
    call.prompt.startsWith("Run the audit phase "),
  )
  assert.deepEqual(
    audits.map((call) => call.assistant),
    ["claude", "codex"],
  )
  const stored = JSON.parse(
    await readFile(join(f.planRoot, "example-impl-rounds.json"), "utf8"),
  ) as { auditor: { assistant: string; chosenBy: string } }[]
  assert.deepEqual(
    stored.map((entry) => entry.auditor.chosenBy),
    ["settings", "settings"],
  )
})

test("an alternate default opens opposite the last completed opener and records its own", async (t) => {
  const series = async (stamp: string | null, coin: 0 | 1) => {
    const f = await roundFixture(
      t,
      "claude",
      "repo-edu",
      false,
      "c",
      false,
      "repo-edu",
      false,
      true,
    )
    if (stamp !== null)
      await writeFile(join(f.options.cacheRoot, "opener"), `${stamp}\n`)
    const settings = structuredClone(testSettings)
    settings.defaultAuditor = "alternate"
    await configureJudgeAnswers(f, [
      "Judge: stop. The first round found no reason for another round.",
    ])
    assert.equal(
      await runCommand(["example.md", "1", "--no-watch"], f.runtime, {
        ...f.options,
        settings,
        coin: () => coin,
      }),
      0,
      `${f.errors.join("\n")}\n${f.visible.join("\n")}`,
    )
    const audits = (await f.prompts()).filter((call) =>
      call.prompt.startsWith("Run the audit phase "),
    )
    return {
      opener: audits.map((call) => call.assistant),
      stamp: await readFile(join(f.options.cacheRoot, "opener"), "utf8"),
    }
  }
  // Without a stamp the coin opens, and the completed round records the opener.
  assert.deepEqual(await series(null, 0), {
    opener: ["claude"],
    stamp: "claude\n",
  })
  // A stamp outranks the coin, and the completed round replaces it.
  assert.deepEqual(await series("claude", 0), {
    opener: ["codex"],
    stamp: "codex\n",
  })
})

test("an alternate opener that fails before its commit leaves the stamp for a retry", async (t) => {
  const f = await roundFixture(t)
  await writeFile(join(f.options.cacheRoot, "opener"), "claude\n")
  await writeFile(f.report, "Malformed evidence")
  const settings = structuredClone(testSettings)
  settings.defaultAuditor = "alternate"
  assert.equal(
    await runCommand(["example.md", "1", "--no-watch"], f.runtime, {
      ...f.options,
      settings,
    }),
    1,
  )
  const audits = (await f.prompts()).filter((call) =>
    call.prompt.startsWith("Run the audit phase "),
  )
  assert.deepEqual(
    audits.map((call) => call.assistant),
    ["codex"],
  )
  assert.equal(
    await readFile(join(f.options.cacheRoot, "opener"), "utf8"),
    "claude\n",
  )
})

test("--first replaces the default auditor's first round and the series still follows judges", async (t) => {
  const f = await roundFixture(
    t,
    "codex",
    "repo-edu",
    false,
    "c",
    false,
    "repo-edu",
    false,
    true,
  )
  await configureJudgeAnswers(f, [
    "Judge: continue with Codex. Codex should check the first round.",
    "Judge: stop. The cross-check found no reason for another round.",
  ])

  assert.equal(
    await runCommand(
      ["example.md", "1", "--first", "atx", "--no-watch"],
      f.runtime,
      f.options,
    ),
    0,
    f.errors.join("\n"),
  )
  const audits = (await f.prompts()).filter((call) =>
    call.prompt.startsWith("Run the audit phase "),
  )
  assert.deepEqual(
    audits.map((call) => call.assistant),
    ["claude", "codex"],
  )
  const stored = JSON.parse(
    await readFile(join(f.planRoot, "example-impl-rounds.json"), "utf8"),
  ) as { auditor: { chosenBy: string } }[]
  assert.deepEqual(
    stored.map((entry) => entry.auditor.chosenBy),
    ["--first", "settings"],
  )
  // Only the first round carries the selection; the judged round names no tier.
  for (const argument of ["--model", "claude-fable-5-1", "--effort", "xhigh"])
    assert.ok(audits[0].args.includes(argument), audits[0].args.join(" "))
  for (const flag of ["-m", "-c"])
    assert.equal(audits[1].args.includes(flag), false)
  const firstLog = (await f.roundFiles()).find((name) =>
    /-01-1-round\..+\.log$/.test(name),
  )
  assert.ok(firstLog)
  assert.match(
    await readFile(join(f.planRoot, firstLog), "utf8"),
    /audit +claude +claude-fable-5-1 +extra high +--first/,
  )
  const visible = f.visible.join("\n")
  assert.match(visible, /Next round: codex, as judged;/)
  assert.match(
    visible,
    /Implementation audit of example, step 1: automatic auditor series stopped on the judge answer after 2 rounds\./,
  )
  await assert.rejects(
    readFile(join(f.planRoot, "example-impl-01..01-queue.md")),
    { code: "ENOENT" },
  )
})

test("an automatic series stops when its fix reopens the plan", async (t) => {
  const f = await roundFixture(
    t,
    "codex",
    "plan",
    true,
    "b",
    false,
    "plan",
    false,
    true,
    false,
  )
  const settled = join(f.planRoot, "example.md")
  const widening = join(f.planRoot, "example-widen.md")

  assert.equal(
    await runCommand(["example.md", "--no-watch"], f.runtime, {
      ...f.options,
      readReply: async () => {
        await rm(widening)
        await rename(settled, widening)
        await finishFixOnReply(f)
        return "Reopen the plan."
      },
    }),
    0,
    `${f.errors.join("\n")}\n${f.visible.join("\n")}`,
  )

  const audits = (await f.prompts()).filter((call) =>
    call.prompt.startsWith("Run the audit phase "),
  )
  assert.equal(audits.length, 1)
  assert.equal(
    (await f.prompts()).some((call) =>
      call.prompt.startsWith("Run the judge phase"),
    ),
    false,
  )
  assert.match(
    f.visible.join("\n"),
    /Plan audit of example: automatic auditor series stopped after 1 round because the plan is now widening\./,
  )
  const [stored] = JSON.parse(
    await readFile(join(f.planRoot, "example-plan-rounds.json"), "utf8"),
  ) as { status: string; judge: unknown }[]
  assert.deepEqual(
    { status: stored.status, judge: stored.judge },
    { status: "finished", judge: null },
  )
})

test("a manual queue follows a plan reopened by its fix", async (t) => {
  const f = await roundFixture(
    t,
    "codex",
    "plan",
    true,
    "b",
    false,
    "plan",
    false,
    true,
    false,
  )
  const reportSource = f.report
  const detailingReport = await readFile(reportSource, "utf8")
  const settled = join(f.planRoot, "example.md")
  const widening = join(f.planRoot, "example-widen.md")

  assert.equal(
    await runCommand(
      ["example.md", "--auditor", "codex,claude", "--no-watch"],
      f.runtime,
      {
        ...f.options,
        readReply: async () => {
          await rm(widening)
          await rename(settled, widening)
          await writeFile(
            reportSource,
            detailingReport.replace("Phase: detailing", "Phase: widening"),
          )
          await finishFixOnReply(f)
          return "Reopen the plan."
        },
      },
    ),
    0,
    f.errors.join("\n"),
  )

  const audits = (await f.prompts()).filter((call) =>
    call.prompt.startsWith("Run the audit phase "),
  )
  assert.equal(audits.length, 2)
  assert.ok(audits[1].prompt.includes(widening))
})

test("an automatic series stops at its configured maximum", async (t) => {
  const f = await roundFixture(
    t,
    "codex",
    "repo-edu",
    false,
    "b",
    false,
    "repo-edu",
    false,
    true,
  )
  await configureJudgeAnswers(f, [
    "Judge: continue with Claude. Cross-check the first result.",
    "Judge: continue with Codex. Continue after the cross-check.",
  ])
  const settings = structuredClone(testSettings)
  settings.maximumAutomaticRounds = 2

  assert.equal(
    await runCommand(["example.md", "1", "--no-watch"], f.runtime, {
      ...f.options,
      settings,
    }),
    0,
    f.errors.join("\n"),
  )
  assert.equal(
    (await f.prompts()).filter((call) =>
      call.prompt.startsWith("Run the audit phase "),
    ).length,
    2,
  )
  assert.match(
    f.visible.join("\n"),
    /Implementation audit of example, step 1: automatic auditor series reached its maximum of 2 rounds\./,
  )
})

test("a clean automatic audit follows its judge", async (t) => {
  const f = await roundFixture(
    t,
    "codex",
    "repo-edu",
    false,
    null,
    false,
    "repo-edu",
    true,
  )
  await configureJudgeAnswers(f, [
    "Judge: continue with Claude. Claude should confirm the clean audit.",
    "Judge: stop. The other assistant confirmed the clean audit.",
  ])

  assert.equal(
    await runCommand(["example.md", "1", "--no-watch"], f.runtime, f.options),
    0,
    f.errors.join("\n"),
  )
  const prompts = await f.prompts()
  assert.deepEqual(
    prompts
      .filter((call) => call.prompt.startsWith("Run the audit phase "))
      .map((call) => call.assistant),
    ["codex", "claude"],
  )
  assert.equal(
    prompts.some((call) => /^Run the (vet|rebut|fix) phase /.test(call.prompt)),
    false,
  )
})

test("a widening target without --auditor ends after one round", async (t) => {
  const f = await roundFixture(
    t,
    "codex",
    "plan",
    false,
    "b",
    false,
    "plan",
    false,
    true,
    false,
  )
  await rm(join(f.planRoot, "example.md"))
  await writeFile(
    f.report,
    (await readFile(f.report, "utf8")).replace(
      "Phase: detailing",
      "Phase: widening",
    ),
  )

  assert.equal(
    await runCommand(["example-widen.md", "--no-watch"], f.runtime, f.options),
    0,
    f.errors.join("\n"),
  )
  assert.equal(
    (await f.prompts()).filter((call) =>
      call.prompt.startsWith("Run the audit phase "),
    ).length,
    1,
  )
  assert.doesNotMatch(f.visible.join("\n"), /automatic auditor series/)
})

test("an automatic rebuttal round gives the fresh judge retained evidence", async (t) => {
  const f = await roundFixture(t, "codex", "repo-edu", false, "c")
  assert.equal(
    await runCommand(["example.md", "1", "--no-watch"], f.runtime, f.options),
    0,
    f.errors.join("\n"),
  )
  const judge = (await f.prompts()).find((call) =>
    call.prompt.startsWith("Run the judge phase"),
  )
  assert.ok(judge)
  assert.equal(judge.assistant, "codex")
  assert.equal(judge.args.includes("audit-session"), false)
  assert.match(judge.prompt, /"status": "in-progress"/)
  assert.match(judge.prompt, /"outcome": "dropped"/)
  assert.match(judge.prompt, /example\/impl-audit-1 oth growth-none c1/)
  const visible = f.visible.join("\n")
  assert.match(visible, /Judge: stop\. The retained evidence has converged\./)
  assert.match(
    visible,
    /Implementation audit of example, step 1: automatic auditor series stopped on the judge answer/,
  )
})

test("a configured Claude fixer starts and resumes the fix whoever audited", async (t) => {
  const f = await roundFixture(t, "claude", "repo-edu", true)
  const settings = structuredClone(testSettings)
  settings.phases.fix.assistant = "claude"
  const code = await runCommand(
    ["example.md", "1", "--auditor", "a", "--no-watch"],
    f.runtime,
    {
      ...f.options,
      settings,
      readReply: async () => {
        const stream = await phaseStream(
          "claude",
          'Applied the ruling.\nPHASE RESULT: {"status":"finished","reason":null}',
          "fix-session",
        )
        await f.configure({
          phases: {
            ...f.phases,
            fix: {
              ...(f.phases.fix as Record<string, unknown>),
              assistants: { claude: { stream } },
              commits: [
                {
                  cwd: f.repoRoot,
                  subject:
                    "example/impl-audit-1 ath growth-none c1 fix(audit-round): apply ruling",
                },
              ],
            },
          },
        })
        return "Choose option 1."
      },
    },
  )
  assert.equal(code, 0, f.errors.join("\n"))
  const fixes = (await f.prompts()).filter((call) =>
    /^Run the fix phase /.test(call.prompt),
  )
  assert.deepEqual(
    fixes.map((call) => [call.assistant, call.args.includes("--resume")]),
    [
      ["claude", false],
      ["claude", true],
    ],
  )
  const resumed = fixes[1].args
  assert.equal(resumed[resumed.indexOf("--resume") + 1], "fix-session")
  const { log } = await f.records()
  assert.ok(log.includes(join(f.planRoot, "home/claude/commands/fix.md")))
  assert.match(log, /fix +claude /)
})

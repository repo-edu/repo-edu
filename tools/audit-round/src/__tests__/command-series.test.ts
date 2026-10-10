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
    ["example.md", "all", "--auditor", "codex,claude", "--no-watch", "--brief"],
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
                    "example/impl-audit-all oth growth-none c1 fix(audit-round): apply ruling",
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
async function finishFixOnReply(f: Awaited<ReturnType<typeof roundFixture>>) {
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
              "example/impl-audit-all oth growth-none c1 fix(audit-round): apply ruling",
          },
        ],
      },
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
    const queue = join(f.planRoot, "example-impl-all-queue.md")
    const code = await runCommand(
      ["example.md", "all", "--auditor", auditors, "--no-watch"],
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
  const queue = join(f.planRoot, "example-impl-all-queue.md")
  const code = await runCommand(
    ["example.md", "all", "--auditor", "codex,claude", "--no-watch"],
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

async function configureAuditReports(
  f: Awaited<ReturnType<typeof roundFixture>>,
  reports: { readonly claude: string; readonly codex: string },
) {
  const audit = f.phases.audit as {
    readonly assistants: Record<string, Record<string, unknown>>
  }
  await f.configure({
    phases: {
      ...f.phases,
      audit: {
        ...audit,
        documents: {
          claude: { source: reports.claude },
          codex: { source: reports.codex },
        },
      },
    },
  })
}

test("an automatic series follows the recommended switch and ends on stop without a queue", async (t) => {
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
  const source = await readFile(f.report, "utf8")
  const codex = join(f.root, "codex-report.md")
  const claude = join(f.root, "claude-report.md")
  await writeFile(
    codex,
    source.replace(
      "Recommendation: continue with Codex. Another round is worth its cost.",
      "Recommendation: continue with Claude. Claude should check the remaining concern.",
    ),
  )
  await writeFile(
    claude,
    source.replace(
      "Recommendation: continue with Codex. Another round is worth its cost.",
      "Recommendation: stop. The cross-check found no reason for another round.",
    ),
  )
  await configureAuditReports(f, { claude, codex })

  assert.equal(
    await runCommand(["example.md", "all", "--no-watch"], f.runtime, f.options),
    0,
    f.errors.join("\n"),
  )
  const audits = (await f.prompts()).filter((call) =>
    call.prompt.startsWith("Run the audit phase "),
  )
  assert.deepEqual(
    audits.map((call) => call.assistant),
    ["codex", "claude"],
  )
  const visible = f.visible.join("\n")
  assert.match(visible, /Recommendation: continue with Claude\./)
  assert.match(visible, /Next round: claude, as recommended;/)
  assert.match(visible, /Recommendation: stop\./)
  assert.match(
    visible,
    /Automatic auditor series stopped on the round recommendation after 2 rounds\./,
  )
  await assert.rejects(
    readFile(join(f.planRoot, "example-impl-all-queue.md")),
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
  const recommendation = f.phases.recommendation as Record<string, unknown>
  const stream = await phaseStream(
    "codex",
    "Recommendation: continue with Codex. Keep comparing the pair.",
    "audit-session",
  )
  await f.configure({
    phases: {
      ...f.phases,
      recommendation: {
        ...recommendation,
        stream,
        assistants: { codex: { stream } },
      },
    },
  })

  assert.equal(
    await runCommand(["example.md", "all", "--no-watch"], f.runtime, {
      ...f.options,
      settings,
      coin: () => 1,
    }),
    0,
    f.errors.join("\n"),
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
    /Automatic auditor series reached its maximum of 3 rounds\./,
  )
})

test("an automatic series continues on an archived plan", async (t) => {
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
  const source = await readFile(f.report, "utf8")
  const codex = join(f.root, "codex-report.md")
  const claude = join(f.root, "claude-report.md")
  await writeFile(
    codex,
    source.replace(
      "Recommendation: continue with Codex. Another round is worth its cost.",
      "Recommendation: continue with Claude. Claude should check the archived plan.",
    ),
  )
  await writeFile(
    claude,
    source.replace(
      "Recommendation: continue with Codex. Another round is worth its cost.",
      "Recommendation: stop. The archived plan needs no further round.",
    ),
  )
  await configureAuditReports(f, { claude, codex })
  const archive = join(f.planRoot, "archive/example")
  const archivedPlan = join(archive, "plan.md")
  await mkdir(archive, { recursive: true })
  await rm(join(f.planRoot, "example-widen.md"))
  await rename(join(f.planRoot, "example.md"), archivedPlan)

  assert.equal(
    await runCommand(["example.md", "all", "--no-watch"], f.runtime, f.options),
    0,
    f.errors.join("\n"),
  )
  const audits = (await f.prompts()).filter((call) =>
    call.prompt.startsWith("Run the audit phase "),
  )
  assert.deepEqual(
    audits.map((call) => call.assistant),
    ["codex", "claude"],
  )
  assert.ok(audits.every((call) => call.prompt.includes(archivedPlan)))
})

test("--first replaces the default auditor's first round and the series still follows recommendations", async (t) => {
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
  const source = await readFile(f.report, "utf8")
  const codex = join(f.root, "codex-report.md")
  await writeFile(
    codex,
    source.replace(
      "Recommendation: continue with Codex. Another round is worth its cost.",
      "Recommendation: stop. The cross-check found no reason for another round.",
    ),
  )
  await configureAuditReports(f, { claude: f.report, codex })

  assert.equal(
    await runCommand(
      ["example.md", "all", "--first", "atx", "--no-watch"],
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
  // Only the first round carries the selection; the recommended round names no tier.
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
  assert.match(visible, /Next round: codex, as recommended;/)
  assert.match(
    visible,
    /Automatic auditor series stopped on the round recommendation after 2 rounds\./,
  )
  await assert.rejects(
    readFile(join(f.planRoot, "example-impl-all-queue.md")),
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
    f.errors.join("\n"),
  )

  const audits = (await f.prompts()).filter((call) =>
    call.prompt.startsWith("Run the audit phase "),
  )
  assert.equal(audits.length, 1)
  assert.match(
    f.visible.join("\n"),
    /Automatic auditor series stopped after 1 round: .*example-widen\.md is now widening\./,
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
            detailingReport
              .replace("Phase: detailing", "Phase: widening")
              .replace(
                "Recommendation: continue with Codex. Another round is worth its cost.",
                "Settling recommendation: keep widening. The shape still has an open question.",
              ),
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
  const source = await readFile(f.report, "utf8")
  const codex = join(f.root, "codex-report.md")
  const claude = join(f.root, "claude-report.md")
  await writeFile(
    codex,
    source.replace("continue with Codex", "continue with Claude"),
  )
  await writeFile(
    claude,
    source.replace("continue with Codex", "continue with Codex"),
  )
  await configureAuditReports(f, { claude, codex })
  const settings = structuredClone(testSettings)
  settings.maximumAutomaticRounds = 2

  assert.equal(
    await runCommand(["example.md", "all", "--no-watch"], f.runtime, {
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
    /Automatic auditor series reached its maximum of 2 rounds\./,
  )
})

test("a clean automatic audit follows its recommendation", async (t) => {
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
  const source = await readFile(f.report, "utf8")
  const codex = join(f.root, "codex-report.md")
  const claude = join(f.root, "claude-report.md")
  await writeFile(
    codex,
    source.replace("continue with Codex", "continue with Claude"),
  )
  await writeFile(
    claude,
    source.replace(
      "Recommendation: continue with Codex. Another round is worth its cost.",
      "Recommendation: stop. The other assistant confirmed the clean audit.",
    ),
  )
  await configureAuditReports(f, { claude, codex })

  assert.equal(
    await runCommand(["example.md", "all", "--no-watch"], f.runtime, f.options),
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
    (await readFile(f.report, "utf8"))
      .replace("Phase: detailing", "Phase: widening")
      .replace(
        "Recommendation: continue with Codex. Another round is worth its cost.",
        "Settling recommendation: keep widening. The shape still has an open question.",
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
  assert.doesNotMatch(f.visible.join("\n"), /Automatic auditor series/)
})

test("an automatic rebuttal round logs the resumed auditor's final recommendation", async (t) => {
  const f = await roundFixture(t, "codex", "repo-edu", false, "b")
  assert.equal(
    await runCommand(["example.md", "all", "--no-watch"], f.runtime, f.options),
    0,
    f.errors.join("\n"),
  )
  const recommendation = (await f.prompts()).find((call) =>
    call.prompt.startsWith(
      "Resume the audit session for the final recommendation",
    ),
  )
  assert.ok(recommendation)
  assert.equal(recommendation.assistant, "codex")
  assert.ok(recommendation.args.includes("audit-session"))
  assert.match(recommendation.prompt, /1\. \[B\] Revise/)
  assert.match(recommendation.prompt, /Written rebut/)
  assert.match(
    recommendation.prompt,
    /example\/impl-audit-all oth growth-none b1/,
  )
  const visible = f.visible.join("\n")
  assert.match(
    visible,
    /Recommendation: stop\. The reconciled round has converged\.\nAudit round finished\.\n═{72}\n/,
  )
  assert.equal(
    visible.match(
      /Recommendation: stop\. The reconciled round has converged\./g,
    )?.length,
    1,
    "the resumed auditor's reply is not echoed beside the round's own print",
  )
})

test("a configured Claude fixer starts and resumes the fix whoever audited", async (t) => {
  const f = await roundFixture(t, "claude", "repo-edu", true)
  const settings = structuredClone(testSettings)
  settings.phases.fix.assistant = "claude"
  const code = await runCommand(
    ["example.md", "all", "--auditor", "a", "--no-watch"],
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
                    "example/impl-audit-all ath growth-none c1 fix(audit-round): apply ruling",
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

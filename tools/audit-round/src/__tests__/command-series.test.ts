import assert from "node:assert/strict"
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { test } from "node:test"
import { execa } from "execa"
import { runCommand, testSettings } from "./configured-runner.js"
import { phaseStream } from "./helpers.js"
import { roundFixture, shortCommit } from "./round-fixture.js"

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
    await readFile(join(f.activeRoot, "example-impl-rounds.json"), "utf8"),
  ) as { rounds: { auditor: { chosenBy: string } }[] }
  assert.deepEqual(
    stored.rounds.map((entry) => entry.auditor.chosenBy),
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
  const markdown = await readFile(join(f.activeRoot, firstMarkdown), "utf8")
  const log = await readFile(join(f.activeRoot, firstLog), "utf8")
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
  /** The settling line a widening fix that follows the resumed one must end with. */
  settling?: string,
) {
  const stream = await phaseStream(
    "codex",
    'Applied the ruling.\nPHASE RESULT: {"status":"finished","reason":null}',
    "fix-session",
  )
  const streams =
    settling === undefined
      ? undefined
      : [
          stream,
          await phaseStream(
            "codex",
            `Applied the corrections.\n${settling}\nPHASE RESULT: {"status":"finished","reason":null}`,
            "fix-session",
          ),
        ]
  await f.configure({
    phases: {
      ...f.phases,
      fix: {
        ...(f.phases.fix as Record<string, unknown>),
        assistants: { codex: { stream } },
        ...(streams === undefined ? {} : { streams }),
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
    const queue = join(f.activeRoot, "example-impl-01..01-queue.md")
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
  const queue = join(f.activeRoot, "example-impl-01..01-queue.md")
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

/** A widening fix ends on its settling line, so the fixture's fix response carries one. */
async function configureWideningSeries(
  f: Awaited<ReturnType<typeof roundFixture>>,
  settling: string,
  answers: readonly string[],
) {
  const stream = await phaseStream(
    "codex",
    `Applied the corrections.\n${settling}\nPHASE RESULT: {"status":"finished","reason":null}`,
    "fix-session",
  )
  await f.configure({
    phases: {
      ...f.phases,
      fix: {
        ...(f.phases.fix as Record<string, unknown>),
        stream,
        assistants: { claude: { stream }, codex: { stream } },
      },
      judge: await judgePhase(f, answers),
    },
  })
}

const deferralRatings =
  "[growth-pattern:none] [reach:developer] [complexity:none]"

function implementationDeferralReport(head: string): string {
  return `Implementation audit workflow
Target: example.md 1
Judged repos: repo-edu@${head}

## Findings

### 1. C: Decide the plan correction

[plan:../plan/example.md#decisions] ${deferralRatings}

The plan needs the deferred decision.
`
}

function cleanImplementationReport(head: string): string {
  return `Implementation audit workflow
Target: example.md 1
Judged repos: repo-edu@${head}

## Findings

No findings.
`
}

function planningDeferralReport(head: string, clean: boolean): string {
  return `Planning round workflow
Target: example.md
Judged repos: plan@${head}

## Excess functionality

No excess findings.

## Missing functionality

${
  clean
    ? "No missing findings."
    : `### 1. B: Apply the deferred decision

[field:missing] [section:decisions] ${deferralRatings}

Apply the correction admitted by the implementation audit.`
}
`
}

async function commitWithBody(
  cwd: string,
  subject: string,
  body: string,
): Promise<string> {
  await execa(
    "git",
    [
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.test",
      "-c",
      "core.hooksPath=/dev/null",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "--allow-empty",
      "-q",
      "-m",
      subject,
      "-m",
      body,
    ],
    { cwd },
  )
  return (await execa("git", ["rev-parse", "HEAD"], { cwd })).stdout
}

async function seedPlanDeferral(
  f: Awaited<ReturnType<typeof roundFixture>>,
): Promise<string> {
  return commitWithBody(
    f.repoRoot,
    "example/impl-audit-1 oth c1: defer the plan decision",
    `- [C] [plan:../plan/example.md#decisions] ${deferralRatings} Plan decision: the plan needs a decision.`,
  )
}

async function seedRepoEduDeferral(
  f: Awaited<ReturnType<typeof roundFixture>>,
): Promise<string> {
  return commitWithBody(
    f.planRoot,
    "example/plan-audit oth growth-none c1: defer the runner correction",
    `- C [field:missing] [area:tool-audit-round] ${deferralRatings} Runner correction: the runner needs a correction.`,
  )
}

async function auditStreams(
  reports: readonly string[],
): Promise<readonly string[]> {
  return Promise.all(
    reports.map((report) =>
      phaseStream(
        "codex",
        `${report.trimEnd()}\nPHASE RESULT: {"status":"finished","reason":null}`,
        "audit-session",
      ),
    ),
  )
}

test("an implementation audit receives open deferrals into Repo Edu", async (t) => {
  const f = await roundFixture(t)
  const sha = await seedRepoEduDeferral(f)

  assert.equal(
    await runCommand(
      ["example.md", "1", "--auditor", "codex", "--no-watch"],
      f.runtime,
      f.options,
    ),
    0,
    `${f.errors.join("\n")}\n${f.visible.join("\n")}`,
  )

  const audit = (await f.prompts()).find((call) =>
    call.prompt.startsWith("Run the audit phase "),
  )
  assert.ok(audit)
  const args = JSON.parse(
    /^Phase arguments \(JSON array\): (.+)$/m.exec(audit.prompt)?.[1] ?? "[]",
  ) as unknown[]
  assert.deepEqual(args.at(-1), {
    deferrals: [
      {
        deferringRepository: "plan",
        sha,
        position: 1,
        tier: "c",
        destination: "tool-audit-round",
        title: "Runner correction",
      },
    ],
  })
})

test("an implementation deferral chains a clean planning round before the judge", async (t) => {
  const f = await roundFixture(t, "codex", "repo-edu", false, "c")
  await f.configure({
    phases: {
      ...f.phases,
      audit: {
        ...(f.phases.audit as Record<string, unknown>),
        document: undefined,
        streams: await auditStreams([
          implementationDeferralReport(f.heads["repo-edu"]),
          planningDeferralReport(f.heads.plan, true),
        ]),
      },
      vet: {
        ...(f.phases.vet as Record<string, unknown>),
        document: { text: "1. [C] Accept\n" },
      },
      fix: {
        ...(f.phases.fix as Record<string, unknown>),
        commits: [
          {
            cwd: f.repoRoot,
            subject: "example/impl-audit-1 oth c1: defer the plan decision",
            body: `- [C] [finding:1] [plan:../plan/example.md#decisions] ${deferralRatings} Plan decision: the plan needs a decision.`,
          },
        ],
      },
    },
  })

  assert.equal(
    await runCommand(["example.md", "1", "--no-watch"], f.runtime, f.options),
    0,
    `${f.errors.join("\n")}\n${f.visible.join("\n")}`,
  )
  const prompts = await f.prompts()
  assert.deepEqual(
    prompts
      .filter((call) => call.prompt.startsWith("Run the audit phase "))
      .map((call) => [
        call.assistant,
        call.prompt.match(/unattended (.+?) round/)?.[1],
      ]),
    [
      ["codex", "implementation-audit"],
      ["codex", "planning"],
    ],
  )
  const judge = prompts.find((call) =>
    call.prompt.startsWith("Run the judge phase"),
  )
  assert.ok(judge)
  const planBody = (
    await execa("git", ["show", "-s", "--format=%B", "HEAD"], {
      cwd: f.planRoot,
    })
  ).stdout
  assert.match(planBody, /- \[applies:[0-9a-f]{40}\/1\] The plan stands\./)
  assert.match(f.visible.join("\n"), /No deferrals are open for example\./)
})

test("a red implementation watch leaves a new plan deferral open", async (t) => {
  const f = await roundFixture(t, "codex", "repo-edu", false, "c", true)
  await f.configure({
    phases: {
      ...f.phases,
      audit: {
        ...(f.phases.audit as Record<string, unknown>),
        document: undefined,
        streams: await auditStreams([
          implementationDeferralReport(f.heads["repo-edu"]),
          planningDeferralReport(f.heads.plan, true),
        ]),
      },
      vet: {
        ...(f.phases.vet as Record<string, unknown>),
        document: { text: "1. [C] Accept\n" },
      },
      fix: {
        ...(f.phases.fix as Record<string, unknown>),
        commits: [
          {
            cwd: f.repoRoot,
            subject: "example/impl-audit-1 oth c1: defer the plan decision",
            body: `- [C] [finding:1] [plan:../plan/example.md#decisions] ${deferralRatings} Plan decision: the plan needs a decision.`,
          },
        ],
      },
    },
  })

  assert.equal(
    await runCommand(["example.md", "1"], f.runtime, f.options),
    0,
    `${f.errors.join("\n")}\n${f.visible.join("\n")}`,
  )
  const prompts = await f.prompts()
  assert.equal(
    prompts.filter((call) => call.prompt.startsWith("Run the audit phase "))
      .length,
    1,
  )
  assert.equal(
    prompts.some((call) => call.prompt.startsWith("Run the judge phase")),
    false,
  )
  const visible = f.visible.join("\n")
  assert.match(visible, /Auditor sequence stopped: the watch graded red\./)
  assert.match(visible, /Open deferrals for example:/)
})

test("an automatic series opens with a chained deferral round", async (t) => {
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
  await seedPlanDeferral(f)
  const repoHead = await shortCommit(f.repoRoot, "HEAD")
  await f.configure({
    phases: {
      ...f.phases,
      audit: {
        ...(f.phases.audit as Record<string, unknown>),
        document: undefined,
        streams: await auditStreams([
          planningDeferralReport(f.heads.plan, true),
          cleanImplementationReport(repoHead),
        ]),
      },
    },
  })

  assert.equal(
    await runCommand(["example.md", "1", "--no-watch"], f.runtime, f.options),
    0,
    `${f.errors.join("\n")}\n${f.visible.join("\n")}`,
  )
  const audits = (await f.prompts()).filter((call) =>
    call.prompt.startsWith("Run the audit phase "),
  )
  assert.match(audits[0].prompt, /unattended planning round/)
  assert.match(audits[1].prompt, /unattended implementation-audit round/)
  const args = JSON.parse(
    /^Phase arguments \(JSON array\): (.+)$/m.exec(audits[0].prompt)?.[1] ??
      "[]",
  ) as unknown[]
  assert.equal((args[2] as { deferrals: unknown[] }).deferrals.length, 1)
})

test("a ruling in the chained deferral round stops the implementation series", async (t) => {
  const f = await roundFixture(t)
  await seedPlanDeferral(f)
  await f.configure({
    phases: {
      ...f.phases,
      audit: {
        ...(f.phases.audit as Record<string, unknown>),
        document: undefined,
        streams: await auditStreams([
          planningDeferralReport(f.heads.plan, false),
        ]),
      },
      fix: {
        ...(f.phases.fix as Record<string, unknown>),
        document: { text: "Choose whether to change the plan." },
        streams: [
          await phaseStream(
            "codex",
            'Choose whether to change the plan.\nPHASE RESULT: {"status":"needs-ruling","reason":null}',
            "fix-session",
          ),
        ],
      },
    },
  })

  assert.equal(
    await runCommand(["example.md", "1", "--no-watch"], f.runtime, f.options),
    0,
    f.errors.join("\n"),
  )
  const prompts = await f.prompts()
  assert.equal(
    prompts.filter((call) => call.prompt.startsWith("Run the audit phase "))
      .length,
    1,
  )
  assert.equal(
    prompts.some((call) => call.prompt.startsWith("Run the judge phase")),
    false,
  )
  const visible = f.visible.join("\n")
  assert.match(visible, /chained deferral round ended with awaiting ruling/)
  assert.match(visible, /Open deferrals for example:/)
})

test("an applied deferral does not start a chained planning round", async (t) => {
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
  const deferral = await seedPlanDeferral(f)
  await commitWithBody(
    f.planRoot,
    "example/plan-audit oth clean: record that the plan stands",
    `- [applies:${deferral}/1] The plan stands.`,
  )
  const repoHead = await shortCommit(f.repoRoot, "HEAD")
  await f.configure({
    phases: {
      ...f.phases,
      audit: {
        ...(f.phases.audit as Record<string, unknown>),
        document: undefined,
        streams: await auditStreams([cleanImplementationReport(repoHead)]),
      },
    },
  })

  assert.equal(
    await runCommand(["example.md", "1", "--no-watch"], f.runtime, f.options),
    0,
    f.errors.join("\n"),
  )
  const audits = (await f.prompts()).filter((call) =>
    call.prompt.startsWith("Run the audit phase "),
  )
  assert.equal(audits.length, 1)
  assert.match(audits[0].prompt, /unattended implementation-audit round/)
})

test("a vet-dropped deferral lands an untiered citation", async (t) => {
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
  const deferral = await seedPlanDeferral(f)
  const repoHead = await shortCommit(f.repoRoot, "HEAD")
  await f.configure({
    phases: {
      ...f.phases,
      audit: {
        ...(f.phases.audit as Record<string, unknown>),
        document: undefined,
        streams: await auditStreams([
          planningDeferralReport(f.heads.plan, false),
          cleanImplementationReport(repoHead),
        ]),
      },
      vet: {
        ...(f.phases.vet as Record<string, unknown>),
        document: { text: "1. [B] Drop\nThe plan already stands.\n" },
      },
      fix: {
        ...(f.phases.fix as Record<string, unknown>),
        commits: [
          {
            cwd: f.planRoot,
            subject:
              "example/plan-audit oth clean: record that the plan stands",
            body: `- [applies:${deferral}/1] The plan stands.`,
          },
        ],
      },
    },
  })

  assert.equal(
    await runCommand(["example.md", "1", "--no-watch"], f.runtime, f.options),
    0,
    `${f.errors.join("\n")}\n${f.visible.join("\n")}`,
  )
  const planBody = (
    await execa("git", ["show", "-s", "--format=%B", "HEAD"], {
      cwd: f.planRoot,
    })
  ).stdout
  assert.match(planBody, new RegExp(`\\[applies:${deferral}/1\\]`))
  assert.match(f.visible.join("\n"), /No deferrals are open for example\./)
})

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
    "Judge: continue with claude opus high. Claude should check the remaining concern.",
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
  assert.match(visible, /Judge: continue with claude opus high\./)
  assert.match(
    visible,
    /Next round: claude opus high, as judged; \d+ rounds remain before the maximum\. Claude should check the remaining concern\./,
  )
  assert.match(visible, /Judge: stop\./)
  assert.match(
    visible,
    /Implementation audit of example, step 1: automatic auditor series stopped on the judge answer after 2 rounds\. The cross-check found no reason for another round\./,
  )
  const transcripts = (await f.roundFiles()).filter((name) =>
    /-1-round\..+\.md$/.test(name),
  )
  assert.equal(transcripts.length, 2)
  for (const transcript of transcripts)
    assert.match(
      await readFile(join(f.activeRoot, transcript), "utf8"),
      /\n## judge \(\w+, fresh\)\n[\s\S]*\nJudge: (continue with claude opus high|stop)\. /,
    )
  const stored = JSON.parse(
    await readFile(join(f.activeRoot, "example-impl-rounds.json"), "utf8"),
  ) as {
    rounds: { status: string; judge: { answer: unknown } | null }[]
  }
  assert.deepEqual(
    stored.rounds.map((entry) => ({
      status: entry.status,
      answer: entry.judge?.answer,
    })),
    [
      {
        status: "finished",
        answer: { assistant: "claude", model: "opus", effort: "high" },
      },
      { status: "finished", answer: "stop" },
    ],
  )
  await assert.rejects(
    readFile(join(f.activeRoot, "example-impl-01..01-queue.md")),
    { code: "ENOENT" },
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
  await rm(join(f.activeRoot, "example-widen.md"))
  await rename(join(f.activeRoot, "example.md"), archivedPlan)

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
    "Judge: continue with codex gpt-5.6-sol high. Codex should cross-check the first round.",
    "Judge: stop. The cross-check found no reason for another round.",
  ])
  const counts: number[] = []

  assert.equal(
    await runCommand(["example.md", "1", "--no-watch"], f.runtime, {
      ...f.options,
      settings,
      coin: (count) => {
        counts.push(count)
        return 1
      },
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
  // The coin picks one entry of the whole list, once for the scope's series.
  assert.deepEqual(counts, [settings.auditors.length])
  const stored = JSON.parse(
    await readFile(join(f.activeRoot, "example-impl-rounds.json"), "utf8"),
  ) as {
    rounds: { auditor: { assistant: string; chosenBy: string } }[]
  }
  assert.deepEqual(
    stored.rounds.map((entry) => entry.auditor.chosenBy),
    ["settings", "settings"],
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
    "Judge: continue with codex gpt-5.6-sol high. Codex should check the first round.",
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
    await readFile(join(f.activeRoot, "example-impl-rounds.json"), "utf8"),
  ) as { rounds: { auditor: { chosenBy: string } }[] }
  assert.deepEqual(
    stored.rounds.map((entry) => entry.auditor.chosenBy),
    ["--first", "settings"],
  )
  // Claude has a listed entry, so the selection runs only the first round and
  // the judge chooses among the listed auditors.
  for (const argument of ["--model", "claude-fable-5-1", "--effort", "xhigh"])
    assert.ok(audits[0].args.includes(argument), audits[0].args.join(" "))
  for (const argument of [
    "-m",
    "gpt-5.6-sol",
    "-c",
    "model_reasoning_effort=high",
  ])
    assert.ok(audits[1].args.includes(argument), audits[1].args.join(" "))
  const firstLog = (await f.roundFiles()).find((name) =>
    /-01-1-round\..+\.log$/.test(name),
  )
  assert.ok(firstLog)
  assert.match(
    await readFile(join(f.activeRoot, firstLog), "utf8"),
    /audit +claude +claude-fable-5-1 +extra high +--first/,
  )
  const judgePrompt = (await f.prompts()).find((call) =>
    call.prompt.startsWith("Run the judge phase "),
  )
  assert.match(
    judgePrompt?.prompt ?? "",
    /Permitted judge options: (stop, )?codex gpt-5\.6-sol high or claude opus high\./,
  )
  const visible = f.visible.join("\n")
  assert.match(visible, /Next round: codex gpt-5\.6-sol high, as judged;/)
  assert.match(
    visible,
    /Implementation audit of example, step 1: automatic auditor series stopped on the judge answer after 2 rounds\./,
  )
  await assert.rejects(
    readFile(join(f.activeRoot, "example-impl-01..01-queue.md")),
    { code: "ENOENT" },
  )
})

test("an automatic series switches between two listed models of one vendor", async (t) => {
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
  settings.auditors = [
    { assistant: "claude", model: "claude-fable-5-1", effort: "high" },
    { assistant: "claude", model: "opus", effort: "xhigh" },
  ]
  // The alias resolves to a release at startup. The round data names each
  // round's auditor by that release, so the pool offers it under that name.
  await f.configure({
    phases: {
      ...f.phases,
      judge: await judgePhase(f, [
        "Judge: continue with claude claude-opus-5-5 xhigh. Opus has not read the scope yet.",
        "Judge: stop. Both Claude models agree.",
      ]),
    },
    releases: { opus: "claude-opus-5-5" },
  })

  assert.equal(
    await runCommand(["example.md", "1", "--no-watch"], f.runtime, {
      ...f.options,
      settings,
    }),
    0,
    `${f.errors.join("\n")}\n${f.visible.join("\n")}`,
  )
  const prompts = await f.prompts()
  const audits = prompts.filter((call) =>
    call.prompt.startsWith("Run the audit phase "),
  )
  assert.deepEqual(
    audits.map((call) => call.assistant),
    ["claude", "claude"],
  )
  for (const argument of ["--model", "claude-fable-5-1", "--effort", "high"])
    assert.ok(audits[0].args.includes(argument), audits[0].args.join(" "))
  for (const argument of ["--model", "opus", "--effort", "xhigh"])
    assert.ok(audits[1].args.includes(argument), audits[1].args.join(" "))
  // The vet stays with the other vendor whichever Claude model audited.
  assert.deepEqual(
    prompts
      .filter((call) => call.prompt.startsWith("Run the vet phase "))
      .map((call) => call.assistant),
    ["codex", "codex"],
  )
  // A Claude-only pool offers no Codex continuation.
  const judgePrompt = prompts.find((call) =>
    call.prompt.startsWith("Run the judge phase "),
  )
  assert.match(
    judgePrompt?.prompt ?? "",
    /Permitted judge options: stop, claude claude-fable-5-1 high or claude claude-opus-5-5 xhigh\./,
  )
  const secondLog = (await f.roundFiles()).find((name) =>
    /-02-1-round\..+\.log$/.test(name),
  )
  assert.ok(secondLog)
  assert.match(
    await readFile(join(f.activeRoot, secondLog), "utf8"),
    /audit +claude +claude-opus-5-5 +extra high +audit-round auditors/,
  )
  assert.match(
    f.visible.join("\n"),
    /Next round: claude claude-opus-5-5 xhigh, as judged;/,
  )
  // The stored answer names the release, as every round's auditor does.
  const stored = JSON.parse(
    await readFile(join(f.activeRoot, "example-impl-rounds.json"), "utf8"),
  ) as { rounds: { judge: { answer: unknown } | null }[] }
  assert.deepEqual(stored.rounds[0].judge?.answer, {
    assistant: "claude",
    model: "claude-opus-5-5",
    effort: "xhigh",
  })
})

test("a --first selection whose assistant the list lacks joins the series pool", async (t) => {
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
  settings.auditors = [
    { assistant: "codex", model: "gpt-5.6-sol", effort: "high" },
  ]
  await configureJudgeAnswers(f, [
    "Judge: continue with codex gpt-5.6-sol high. Codex has no settled read.",
    "Judge: continue with claude claude-fable-5-1 xhigh. Fable should confirm the Codex read.",
    "Judge: stop. Both vendors have read the scope.",
  ])

  assert.equal(
    await runCommand(
      ["example.md", "1", "--first", "atx", "--no-watch"],
      f.runtime,
      { ...f.options, settings },
    ),
    0,
    `${f.errors.join("\n")}\n${f.visible.join("\n")}`,
  )
  const prompts = await f.prompts()
  const audits = prompts.filter((call) =>
    call.prompt.startsWith("Run the audit phase "),
  )
  assert.deepEqual(
    audits.map((call) => call.assistant),
    ["claude", "codex", "claude"],
  )
  for (const index of [0, 2])
    for (const argument of ["--model", "claude-fable-5-1", "--effort", "xhigh"])
      assert.ok(
        audits[index].args.includes(argument),
        audits[index].args.join(" "),
      )
  const judgePrompt = prompts.find((call) =>
    call.prompt.startsWith("Run the judge phase "),
  )
  assert.match(
    judgePrompt?.prompt ?? "",
    /Permitted judge options: (stop, )?codex gpt-5\.6-sol high or claude claude-fable-5-1 xhigh\./,
  )
  const stored = JSON.parse(
    await readFile(join(f.activeRoot, "example-impl-rounds.json"), "utf8"),
  ) as { rounds: { auditor: { chosenBy: string } }[] }
  assert.deepEqual(
    stored.rounds.map((entry) => entry.auditor.chosenBy),
    ["--first", "settings", "settings"],
  )
  // The judged round reruns the selection the option resolved, so the option names it.
  const thirdLog = (await f.roundFiles()).find((name) =>
    /-03-1-round\..+\.log$/.test(name),
  )
  assert.ok(thirdLog)
  assert.match(
    await readFile(join(f.activeRoot, thirdLog), "utf8"),
    /audit +claude +claude-fable-5-1 +extra high +--first/,
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
  const settled = join(f.activeRoot, "example.md")
  const widening = join(f.activeRoot, "example-widen.md")

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
    /Plan audit of example: automatic auditor series stopped after 1 round because the plan changed from detailing to widening\./,
  )
  const {
    rounds: [stored],
  } = JSON.parse(
    await readFile(join(f.activeRoot, "example-plan-rounds.json"), "utf8"),
  ) as { rounds: { status: string; judge: unknown }[] }
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
  const settled = join(f.activeRoot, "example.md")
  const widening = join(f.activeRoot, "example-widen.md")

  assert.equal(
    await runCommand(
      ["example.md", "--auditor", "codex,claude", "--no-watch"],
      f.runtime,
      {
        ...f.options,
        readReply: async () => {
          await rm(widening)
          await rename(settled, widening)
          // The reopened plan's next audit reads a widening report, which
          // ends on its settling line.
          await writeFile(
            reportSource,
            `${detailingReport}\nSettling: keep open. The reopened decision still needs evidence.\n`,
          )
          await finishFixOnReply(
            f,
            undefined,
            "Settling: keep open. The reopened decision still needs evidence.",
          )
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
  const argumentsLine = /^Phase arguments \(JSON array\): (.+)$/m.exec(
    audits[1].prompt,
  )
  assert.ok(argumentsLine)
  assert.equal((JSON.parse(argumentsLine[1]) as string[])[1], widening)
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
    "Judge: continue with claude opus high. Cross-check the first result.",
    "Judge: continue with codex gpt-5.6-sol high. Continue after the cross-check.",
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
    "Judge: continue with claude opus high. Claude should confirm the clean audit.",
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

test("a widening series ends on the judge's settle recommendation", async (t) => {
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
  await rm(join(f.activeRoot, "example.md"))
  await writeFile(
    f.report,
    `${await readFile(f.report, "utf8")}\nSettling: keep open. Finding 1 must land before the shape can close.\n`,
  )
  await configureWideningSeries(
    f,
    "Settling: settle. Finding 1 landed and no shape question remains.",
    ["Judge: settle. No concrete shape question remains."],
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
  const judge = (await f.prompts()).find((call) =>
    call.prompt.startsWith("Run the judge phase"),
  )
  assert.ok(judge)
  assert.match(
    judge.prompt,
    /"settling": "settle\. Finding 1 landed and no shape question remains\."/,
  )
  const visible = f.visible.join("\n")
  assert.match(visible, /Judge: settle\. No concrete shape question remains\./)
  assert.match(
    visible,
    /Plan audit of example: automatic auditor series ended after 1 round\. The judge finds no open shape question\. Widening is done: run pnpm audit-round settle example\./,
  )
  assert.doesNotMatch(visible, /settle recommendation/)
  const {
    rounds: [stored],
  } = JSON.parse(
    await readFile(join(f.activeRoot, "example-plan-rounds.json"), "utf8"),
  ) as {
    rounds: {
      phase: string
      settling: string
      judge: { answer: string; reason: string } | null
    }[]
  }
  assert.equal(stored?.phase, "widening")
  assert.equal(
    stored?.settling,
    "settle. Finding 1 landed and no shape question remains.",
  )
  assert.deepEqual(stored?.judge, {
    answer: "settle",
    reason: "No concrete shape question remains.",
  })
})

test("a widening judge can stop the series without recommending settle", async (t) => {
  const f = await roundFixture(
    t,
    "codex",
    "plan",
    false,
    null,
    false,
    "plan",
    true,
    false,
    false,
  )
  await rm(join(f.activeRoot, "example.md"))
  await writeFile(
    f.report,
    `${await readFile(f.report, "utf8")}\nSettling: keep open. The shape question needs evidence only the user can supply.\n`,
  )
  await configureJudgeAnswers(f, [
    "Judge: stop. The shape question needs evidence only the user can supply.",
  ])

  assert.equal(
    await runCommand(["example-widen.md", "--no-watch"], f.runtime, f.options),
    0,
    f.errors.join("\n"),
  )
  // A clean audit runs no fix, so the report's closing line is the retained recommendation.
  const {
    rounds: [stored],
  } = JSON.parse(
    await readFile(join(f.activeRoot, "example-plan-rounds.json"), "utf8"),
  ) as { rounds: { settling: string }[] }
  assert.equal(
    stored?.settling,
    "keep open. The shape question needs evidence only the user can supply.",
  )
  const visible = f.visible.join("\n")
  assert.match(visible, /Judge: stop\. The shape question needs evidence/)
  assert.match(
    visible,
    /Plan audit of example: automatic auditor series stopped on the judge answer after 1 round\./,
  )
})

test("a detailing series ends on the judge's ready recommendation", async (t) => {
  const f = await roundFixture(
    t,
    "codex",
    "plan",
    false,
    null,
    false,
    "plan",
    true,
    false,
    false,
  )
  await rm(join(f.activeRoot, "example-widen.md"))
  await configureJudgeAnswers(f, [
    "Judge: ready. The clean read leaves no remaining real bug in the brief.",
  ])

  assert.equal(
    await runCommand(["example.md", "--no-watch"], f.runtime, f.options),
    0,
    f.errors.join("\n"),
  )
  const judge = (await f.prompts()).find((call) =>
    call.prompt.startsWith("Run the judge phase"),
  )
  assert.ok(judge)
  assert.match(judge.prompt, /Permitted judge options: ready, stop, /)
  const visible = f.visible.join("\n")
  assert.match(visible, /Judge: ready\. The clean read leaves no remaining/)
  assert.match(
    visible,
    /Plan audit of example: automatic auditor series ended after 1 round\. The judge finds the brief complete\. Detailing is done: run pnpm audit-round ready example\./,
  )
  const {
    rounds: [stored],
  } = JSON.parse(
    await readFile(join(f.activeRoot, "example-plan-rounds.json"), "utf8"),
  ) as {
    rounds: {
      phase: string
      judge: { answer: string; reason: string } | null
    }[]
  }
  assert.equal(stored?.phase, "detailing")
  assert.deepEqual(stored?.judge, {
    answer: "ready",
    reason: "The clean read leaves no remaining real bug in the brief.",
  })
})

test("a failed round stops a scope list before later scopes", async (t) => {
  const f = await roundFixture(t)
  await rm(join(f.activeRoot, "example.md"))
  await f.configure({
    phases: {
      ...f.phases,
      audit: {
        ...(f.phases.audit as object),
        assistants: undefined,
        stream: await phaseStream(
          "codex",
          'Audit failed.\nPHASE RESULT: {"status":"failed","reason":"Audit failure"}',
          "audit-session",
        ),
      },
    },
  })

  assert.equal(
    await runCommand(
      ["example-widen.md", "1,2", "--no-watch"],
      f.runtime,
      f.options,
    ),
    1,
  )
  assert.equal(
    (await f.prompts()).filter((call) =>
      call.prompt.startsWith("Run the audit phase "),
    ).length,
    1,
  )
  const visible = f.visible.join("\n")
  assert.match(visible, /Auditor sequence stopped: this round failed\./)
  assert.match(visible, /Scope list stopped before 2\./)
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
  settings.coders[0].assistant = "claude"
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

test("a scope list runs one automatic series per scope in list order", async (t) => {
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
  assert.equal(
    await runCommand(["example.md", "1,2", "--no-watch"], f.runtime, f.options),
    0,
    f.errors.join("\n"),
  )
  assert.equal(
    (await f.prompts()).filter((call) =>
      call.prompt.startsWith("Run the audit phase "),
    ).length,
    2,
  )
  const visible = f.visible.join("\n")
  assert.match(
    visible,
    /Implementation audit of example, step 1: automatic auditor series stopped on the judge answer after 1 round\./,
  )
  assert.match(
    visible,
    /Next scope: Implementation audit of example, step 2; 0 scopes remain after it\./,
  )
  assert.match(
    visible,
    /Implementation audit of example, step 2: automatic auditor series stopped on the judge answer after 1 round\./,
  )
  assert.doesNotMatch(visible, /Scope list stopped/)
  const stored = JSON.parse(
    await readFile(join(f.activeRoot, "example-impl-rounds.json"), "utf8"),
  ) as {
    rounds: { target: string; round: number; scope: string }[]
  }
  assert.deepEqual(
    stored.rounds.map((entry) => [entry.target, entry.round, entry.scope]),
    [
      ["example-impl-01..01", 1, "1"],
      ["example-impl-02..02", 1, "2"],
    ],
  )
})

test("a ruling left unanswered stops the scope list before its later scopes", async (t) => {
  const f = await roundFixture(t, "codex", "repo-edu", true)
  assert.equal(
    await runCommand(
      ["example.md", "1,2,3-4", "--no-watch"],
      f.runtime,
      f.options,
    ),
    0,
    f.errors.join("\n"),
  )
  assert.equal(
    (await f.prompts()).filter((call) =>
      call.prompt.startsWith("Run the audit phase "),
    ).length,
    1,
  )
  const visible = f.visible.join("\n")
  assert.match(
    visible,
    /Auditor sequence stopped: this round required your ruling\./,
  )
  assert.match(visible, /Scope list stopped before 2, 3-4\./)
})

test("a scope list is refused beside --auditor and for a hand-run claim", async (t) => {
  const f = await roundFixture(t)
  for (const argv of [
    ["example.md", "1,2", "--auditor", "codex"],
    ["name", "example.md", "1", "2", "--auditor", "oth"],
  ])
    assert.equal(await runCommand(argv, f.runtime, f.options), 2)
  const errors = f.errors.join("\n")
  assert.match(errors, /Use --auditor with one scope/)
  assert.match(errors, /claims one scope/)
  assert.deepEqual(await f.roundFiles(), [])
})

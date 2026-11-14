import assert from "node:assert/strict"
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { basename, join } from "node:path"
import { test } from "node:test"
import { execa } from "execa"
import { documentTag } from "../round-paths.js"
import { runCommand, testSettings } from "./configured-runner.js"
import { phaseStream } from "./helpers.js"
import { commitFixture, roundFixture, shortCommit } from "./round-fixture.js"

const singleAuditorSettings = {
  ...testSettings,
  planning: {
    ...testSettings.planning,
    auditors: [testSettings.planning.auditors[0]],
  },
  implementation: {
    ...testSettings.implementation,
    auditors: [testSettings.implementation.auditors[0]],
  },
}

const splitAuditorSettings = {
  ...testSettings,
  planning: {
    ...testSettings.planning,
    auditors: [testSettings.planning.auditors[1]],
  },
  implementation: {
    ...testSettings.implementation,
    auditors: [testSettings.implementation.auditors[0]],
  },
}

test("a ruling resumes the fix and the remaining auditor sequence without replaying internal prompts", async (t) => {
  const f = await roundFixture(t, "codex", "repo-edu", true)
  const reply = "Choose option 1.\nKeep the existing range."
  let requests = 0
  const code = await runCommand(
    ["round", "example.md", "1", "--auditor", "codex,claude", "--no-watch"],
    f.runtime,
    {
      ...f.options,
      awaitAnswer: async () => {
        requests++
        // The notice names the ruling; the chat, not the terminal, shows its text.
        assert.ok(
          f.visible.some((text) => text.includes("Your ruling is needed")),
        )
        assert.equal(
          f.visible.some((text) => text.includes("Written ruling by fix")),
          false,
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
        return { rulings: [], reply }
      },
    },
  )
  assert.equal(code, 0, f.errors.join("\n"))
  assert.equal(requests, 1)
  const visible = f.visible.join("\n")
  assert.match(visible, /Applied the ruling/)
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
})

test("a stopped serious contest re-enters the retained runner round", async (t) => {
  const f = await roundFixture(t, "codex", "repo-edu", true)
  await f.configure({
    phases: {
      ...f.phases,
      rebut: {
        ...(f.phases.rebut as Record<string, unknown>),
        document: {
          text: "1. [B] [<vet>] Contest\n\nThe report quotes the owning contract.\n",
        },
      },
    },
  })
  assert.equal(
    await runCommand(
      ["round", "example.md", "1", "--auditor", "codex", "--no-watch"],
      f.runtime,
      f.options,
    ),
    0,
    f.errors.join("\n"),
  )
  const report = f.report
  assert.match(
    f.visible.join("\n"),
    new RegExp(
      `pnpm audit-round resume-fix ${basename(report).replaceAll(".", "\\.")} fix-session`,
    ),
  )
  const priorCalls = (await f.calls()).length
  const priorPrompts = (await f.prompts()).length
  const stream = await phaseStream(
    "codex",
    'Applied the stored ruling.\nPHASE RESULT: {"status":"finished","reason":null}',
    "fix-session",
  )
  await f.configure({
    phases: {
      ...f.phases,
      fix: {
        ...(f.phases.fix as Record<string, unknown>),
        stream,
        assistants: { codex: { stream } },
        commits: [
          {
            cwd: f.repoRoot,
            subject:
              "example/impl-audit-1 obh growth-none b1 fix(audit-round): apply stored contest ruling",
            body: "- [B] [finding:1] [area:tool-audit-round] [growth-pattern:none] [reach:developer] [complexity:none] Fixture finding: The owning contract decides the correction.",
          },
        ],
      },
    },
  })

  assert.equal(
    await runCommand(
      ["resume-fix", basename(report), "fix-session"],
      f.runtime,
      {
        ...f.options,
        awaitAnswer: async (ruling) => {
          assert.deepEqual(ruling.findings, [1])
          return {
            rulings: [
              {
                finding: 1,
                winner: "report",
                reason: "The report quotes the owning contract.",
              },
            ],
            reply: "",
          }
        },
      },
    ),
    0,
    f.errors.join("\n"),
  )

  const recoveryCalls = (await f.calls()).slice(priorCalls)
  const phasePrompts = (await f.prompts())
    .slice(priorPrompts)
    .filter((call) => call.prompt.startsWith("Run the "))
  assert.equal(phasePrompts.length, 1)
  assert.match(phasePrompts[0]?.prompt ?? "", /^Run the fix phase /)
  const phaseCalls = recoveryCalls.filter(
    (call) => call.args.includes("fix-session") && call.openContests !== null,
  )
  assert.equal(phaseCalls.length, 1)
  assert.equal(phaseCalls[0]?.openContests, "")
  assert.ok(phaseCalls[0]?.args.includes("fix-session"))
  const stored = JSON.parse(
    await readFile(join(f.activeRoot, "example-impl-rounds.json"), "utf8"),
  ) as {
    rounds: {
      status: string
      findings: unknown[]
    }[]
  }
  assert.equal(stored.rounds.length, 1)
  assert.equal(stored.rounds[0]?.status, "finished")
  assert.deepEqual(stored.rounds[0]?.findings[0], {
    number: 1,
    title: "Fixture finding",
    tier: "B",
    reach: "developer",
    complexity: "none",
    growthPattern: "none",
    location: {
      kind: "repo-edu",
      area: "tool-audit-round",
      covers: [],
    },
    reviews: [
      { vet: documentTag(f.vet), verdict: "revise", answer: "contest" },
    ],
    ruling: {
      winner: "report",
      reason: "The report quotes the owning contract.",
    },
    outcome: "kept",
    finalTier: null,
    finalReach: null,
  })
  for (const path of [f.report, f.vet, f.rebut])
    await assert.rejects(readFile(path), { code: "ENOENT" })
  const { log, markdown } = await f.records()
  assert.equal(log.match(/^Started /gm)?.length, 2)
  assert.equal(markdown.match(/^Started /gm)?.length, 2)
})

test("a stopped panel split resumes its fix with every vet report and each vet's retained phase", async (t) => {
  const f = await roundFixture(t, "codex", "repo-edu", true)
  const settings = structuredClone(testSettings)
  settings.implementation.vetters = [
    { assistant: "claude", model: "opus", effort: "high" },
    { assistant: "codex", model: "gpt-5.6-sol", effort: "high" },
  ]
  const options = { ...f.options, settings }
  // Claude accepts the B finding and Codex, on the auditor's own model,
  // drops it, so the panel splits and the finding goes to the user.
  await f.configure({
    phases: {
      ...f.phases,
      vet: {
        ...(f.phases.vet as Record<string, unknown>),
        documents: {
          claude: { text: "1. [B] Accept\n" },
          codex: { text: "1. [B] Drop\n\nThe contract already holds.\n" },
        },
      },
      rebut: {
        ...(f.phases.rebut as Record<string, unknown>),
        document: { text: "1. [B] [obh] Contest\n\nThe contract is unmet.\n" },
      },
    },
  })
  assert.equal(
    await runCommand(
      ["round", "example.md", "1", "--auditor", "codex", "--no-watch"],
      f.runtime,
      options,
    ),
    0,
    `${f.errors.join("\n")}\n${f.visible.join("\n")}`,
  )
  const report = f.report
  const vets = ["abh", "obh"].map((tag) =>
    report.replace(/-2-audit\.[a-z]{3}\.md$/, `-3-vet.${tag}.md`),
  )
  for (const vet of vets) assert.ok((await readFile(vet, "utf8")).length > 0)
  assert.match(
    f.visible.join("\n"),
    new RegExp(
      `pnpm audit-round resume-fix ${basename(report).replaceAll(".", "\\.")} fix-session`,
    ),
  )
  const priorPrompts = (await f.prompts()).length
  const stream = await phaseStream(
    "codex",
    'Applied the stored ruling.\nPHASE RESULT: {"status":"finished","reason":null}',
    "fix-session",
  )
  await f.configure({
    phases: {
      ...f.phases,
      fix: {
        ...(f.phases.fix as Record<string, unknown>),
        stream,
        assistants: { codex: { stream } },
        commits: [
          {
            cwd: f.repoRoot,
            subject:
              "example/impl-audit-1 obh growth-none b1 fix(audit-round): apply stored split ruling",
            body: "- [B] [finding:1] [area:tool-audit-round] [growth-pattern:none] [reach:developer] [complexity:none] Fixture finding: The Claude vet was right.",
          },
        ],
      },
    },
  })

  assert.equal(
    await runCommand(
      ["resume-fix", basename(report), "fix-session"],
      f.runtime,
      {
        ...options,
        awaitAnswer: async (ruling) => {
          assert.deepEqual(ruling.findings, [1])
          assert.deepEqual(ruling.panel, ["abh", "obh"])
          return {
            rulings: [
              {
                finding: 1,
                winner: ["abh"],
                reason: "The finding holds as written.",
              },
            ],
            reply: "",
          }
        },
      },
    ),
    0,
    `${f.errors.join("\n")}\n${f.visible.join("\n")}`,
  )
  const resumed = (await f.prompts())
    .slice(priorPrompts)
    .filter((call) => call.prompt.startsWith("Run the fix phase "))
  assert.equal(resumed.length, 1)
  for (const vet of vets) assert.ok(resumed[0]?.prompt.includes(vet), vet)
  const stored = JSON.parse(
    await readFile(join(f.activeRoot, "example-impl-rounds.json"), "utf8"),
  ) as {
    rounds: {
      status: string
      phases: { phase: string; tag?: string; assistant: string }[]
      findings: { reviews: unknown[]; ruling?: unknown }[]
    }[]
  }
  assert.equal(stored.rounds.length, 1)
  assert.equal(stored.rounds[0]?.status, "finished")
  // The resumed round restored each vet's phase entry by its tag.
  assert.deepEqual(
    stored.rounds[0]?.phases
      .filter((phase) => phase.phase === "vet")
      .map(({ tag, assistant }) => ({ tag, assistant })),
    [
      { tag: "abh", assistant: "claude" },
      { tag: "obh", assistant: "codex" },
    ],
  )
  assert.deepEqual(stored.rounds[0]?.findings[0]?.reviews, [
    { vet: "abh", verdict: "accept", answer: null },
    { vet: "obh", verdict: "drop", answer: "contest" },
  ])
  assert.deepEqual(stored.rounds[0]?.findings[0]?.ruling, {
    winner: ["abh"],
    reason: "The finding holds as written.",
  })
  for (const path of [report, ...vets, f.rebut])
    await assert.rejects(readFile(path), { code: "ENOENT" })
})

/** The ruling pause lets a test act as the user editing the queue mid-round. */
async function finishFixOnReply(
  f: Awaited<ReturnType<typeof roundFixture>>,
  _judgeAnswers?: readonly string[],
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
    const queue = join(f.activeRoot, "example-impl-audit-01..01-queue.md")
    const code = await runCommand(
      ["round", "example.md", "1", "--auditor", auditors, "--no-watch"],
      f.runtime,
      {
        ...f.options,
        awaitAnswer: async () => {
          assert.equal(await readFile(queue, "utf8"), seeded)
          if (edit === null) await rm(queue)
          else await writeFile(queue, edit)
          await finishFixOnReply(f)
          return { rulings: [], reply: "Choose option 1." }
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
  const queue = join(f.activeRoot, "example-impl-audit-01..01-queue.md")
  const code = await runCommand(
    ["round", "example.md", "1", "--auditor", "codex,claude", "--no-watch"],
    f.runtime,
    {
      ...f.options,
      awaitAnswer: async () => {
        await writeFile(queue, "claude\nclaud\n")
        await finishFixOnReply(f)
        return { rulings: [], reply: "Choose option 1." }
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
    await runCommand(["round", "HEAD", "--no-watch"], f.runtime, f.options),
    0,
    f.errors.join("\n"),
  )
  assert.doesNotMatch(
    f.visible.join("\n"),
    /Queued after this round|Auditor sequence/,
  )
})

/** A widening fix ends on its settling line, so the fixture's fix response carries one. */
async function configureWideningSeries(
  f: Awaited<ReturnType<typeof roundFixture>>,
  settling: string,
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

test("one plan uses its planning and implementation auditor lists independently", async (t) => {
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
  await f.configure({
    phases: {
      ...f.phases,
      audit: {
        ...(f.phases.audit as Record<string, unknown>),
        document: undefined,
        streams: [
          await phaseStream(
            "claude",
            `${planningDeferralReport(f.heads.plan, true).trimEnd()}\nPHASE RESULT: {"status":"finished","reason":null}`,
            "audit-session",
          ),
          await phaseStream(
            "codex",
            `${cleanImplementationReport(f.heads["repo-edu"]).trimEnd()}\nPHASE RESULT: {"status":"finished","reason":null}`,
            "audit-session",
          ),
        ],
      },
    },
  })

  for (const args of [
    ["round", "example.md", "plan", "--no-watch"],
    ["round", "example.md", "1", "--no-watch"],
  ])
    assert.equal(
      await runCommand(args, f.runtime, {
        ...f.options,
        settings: splitAuditorSettings,
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
})

for (const target of [
  {
    name: "plan-repo commit target",
    args: ["plan@HEAD"],
    workClass: "planning",
    assistant: "claude",
  },
  {
    name: "Repo Edu commit target",
    args: ["HEAD"],
    workClass: "implementation",
    assistant: "codex",
  },
  {
    name: "two-repo commit target",
    args: ["HEAD", "plan@HEAD"],
    workClass: "implementation",
    assistant: "codex",
  },
] as const) {
  test(`${target.name} uses the ${target.workClass} auditor list`, async (t) => {
    const f = await roundFixture(
      t,
      target.assistant,
      target.args[0] === "plan@HEAD" ? "plan" : "repo-edu",
      false,
      null,
      false,
      "repo-edu",
      true,
    )
    const judgedRepos =
      target.args.length === 2
        ? `plan@${f.heads.plan}, repo-edu@${f.heads["repo-edu"]}`
        : target.args[0] === "plan@HEAD"
          ? `plan@${f.heads.plan}`
          : `repo-edu@${f.heads["repo-edu"]}`
    const report = `Implementation audit workflow
Target: ${target.args.join(" ")}
Judged repos: ${judgedRepos}

## Findings

No findings.
`
    await f.configure({
      phases: {
        ...f.phases,
        audit: {
          ...(f.phases.audit as Record<string, unknown>),
          document: undefined,
          streams: [
            await phaseStream(
              target.assistant,
              `${report.trimEnd()}\nPHASE RESULT: {"status":"finished","reason":null}`,
              "audit-session",
            ),
          ],
        },
      },
    })

    assert.equal(
      await runCommand(["round", ...target.args, "--no-watch"], f.runtime, {
        ...f.options,
        settings: splitAuditorSettings,
      }),
      0,
      `${f.errors.join("\n")}\n${f.visible.join("\n")}`,
    )
    const audit = (await f.prompts()).find((call) =>
      call.prompt.startsWith("Run the audit phase "),
    )
    assert.equal(audit?.assistant, target.assistant)
  })
}

test("an implementation audit receives open deferrals into Repo Edu", async (t) => {
  const f = await roundFixture(t)
  const sha = await seedRepoEduDeferral(f)

  assert.equal(
    await runCommand(
      ["round", "example.md", "1", "--auditor", "codex", "--no-watch"],
      f.runtime,
      { ...f.options, settings: singleAuditorSettings },
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

test("an implementation deferral chains a clean planning round before the series decision", async (t) => {
  const f = await roundFixture(t, "codex", "repo-edu", false, "c")
  await f.configure({
    phases: {
      ...f.phases,
      audit: {
        ...(f.phases.audit as Record<string, unknown>),
        document: undefined,
        streams: [
          await phaseStream(
            "codex",
            `${implementationDeferralReport(f.heads["repo-edu"]).trimEnd()}\nPHASE RESULT: {"status":"finished","reason":null}`,
            "audit-session",
          ),
          await phaseStream(
            "claude",
            `${planningDeferralReport(f.heads.plan, true).trimEnd()}\nPHASE RESULT: {"status":"finished","reason":null}`,
            "audit-session",
          ),
        ],
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
    await runCommand(["round", "example.md", "1", "--no-watch"], f.runtime, {
      ...f.options,
      settings: splitAuditorSettings,
    }),
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
      ["claude", "planning"],
    ],
  )
  assert.equal(
    prompts.some((call) => call.prompt.startsWith("Run the judge phase")),
    false,
  )
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
    await runCommand(["round", "example.md", "1"], f.runtime, f.options),
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
        streams: [
          await phaseStream(
            "claude",
            `${planningDeferralReport(f.heads.plan, true).trimEnd()}\nPHASE RESULT: {"status":"finished","reason":null}`,
            "audit-session",
          ),
          await phaseStream(
            "codex",
            `${cleanImplementationReport(repoHead).trimEnd()}\nPHASE RESULT: {"status":"finished","reason":null}`,
            "audit-session",
          ),
        ],
      },
    },
  })

  assert.equal(
    await runCommand(["round", "example.md", "1", "--no-watch"], f.runtime, {
      ...f.options,
      settings: splitAuditorSettings,
    }),
    0,
    `${f.errors.join("\n")}\n${f.visible.join("\n")}`,
  )
  const audits = (await f.prompts()).filter((call) =>
    call.prompt.startsWith("Run the audit phase "),
  )
  assert.match(audits[0].prompt, /unattended planning round/)
  assert.match(audits[1].prompt, /unattended implementation-audit round/)
  assert.deepEqual(
    audits.map((call) => call.assistant),
    ["claude", "codex"],
  )
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
    await runCommand(["round", "example.md", "1", "--no-watch"], f.runtime, {
      ...f.options,
      settings: singleAuditorSettings,
    }),
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
    await runCommand(["round", "example.md", "1", "--no-watch"], f.runtime, {
      ...f.options,
      settings: singleAuditorSettings,
    }),
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
    await runCommand(["round", "example.md", "1", "--no-watch"], f.runtime, {
      ...f.options,
      settings: singleAuditorSettings,
    }),
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

test("an automatic series follows the deterministic switch and stores its decision without a queue", async (t) => {
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
  assert.equal(
    await runCommand(
      ["round", "example.md", "1", "--no-watch"],
      f.runtime,
      f.options,
    ),
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
  assert.match(
    visible,
    /Next round: claude opus high; \d+ rounds remain before the maximum\. Rule 3: claude opus high has no current read and did not audit this round\./,
  )
  assert.match(
    visible,
    /Implementation audit of example, step 1: automatic auditor series stopped after 2 rounds\. Rule 2: every pool entry has a current read; the series stops\./,
  )
  const transcripts = (await f.roundFiles()).filter((name) =>
    /-1-round\..+\.md$/.test(name),
  )
  assert.equal(transcripts.length, 2)
  const stored = JSON.parse(
    await readFile(join(f.activeRoot, "example-impl-rounds.json"), "utf8"),
  ) as {
    rounds: {
      status: string
      pool?: unknown[]
      judge: { answer: unknown } | null
    }[]
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
  assert.deepEqual(stored.rounds[0].pool, [
    { assistant: "codex", model: "gpt-5.6-sol", effort: "high" },
    { assistant: "claude", model: "opus", effort: "high" },
  ])
  await assert.rejects(
    readFile(join(f.activeRoot, "example-impl-audit-01..01-queue.md")),
    { code: "ENOENT" },
  )
})

test("a commit series keeps its label while the next auditor reads the original commits and landed fix", async (t) => {
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
  await commitFixture(f.repoRoot, "Unrelated middle commit")
  await commitFixture(f.repoRoot, "Original newest commit")
  const original = await Promise.all(
    ["HEAD~2", "HEAD"].map(
      async (revision) =>
        (await execa("git", ["rev-parse", revision], { cwd: f.repoRoot }))
          .stdout,
    ),
  )
  const omitted = (
    await execa("git", ["rev-parse", "HEAD~1"], { cwd: f.repoRoot })
  ).stdout
  const label = `commit-${original[0].slice(0, 6)}..${original[1].slice(0, 6)}`
  const manualSubject =
    "obh growth-none c1 fix(audit-round): unrelated hand-run correction"
  await f.configure({
    phases: {
      ...f.phases,
      fix: {
        ...(f.phases.fix as Record<string, unknown>),
        commits: [
          ...((f.phases.fix as { commits: unknown[] }).commits ?? []),
          {
            cwd: f.repoRoot,
            subject: manualSubject,
            body: "gpt-5.6-sol high",
            roundStamp: false,
          },
        ],
      },
    },
  })

  assert.equal(
    await runCommand(
      ["round", "HEAD-2", "HEAD", "--no-watch"],
      f.runtime,
      f.options,
    ),
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
  const secondArguments = /^Phase arguments \(JSON array\): (.+)$/m.exec(
    audits[1].prompt,
  )
  assert.ok(secondArguments)
  const [, secondGroup] = JSON.parse(secondArguments[1]) as [
    string,
    {
      commits: string[]
      originalCommits: string[]
      references: string[]
      startingHead: string
    },
  ]
  assert.equal(secondGroup.commits.length, 3)
  assert.deepEqual(secondGroup.commits.slice(0, 2), original)
  assert.deepEqual(secondGroup.originalCommits, original)
  assert.equal(secondGroup.commits.includes(omitted), false)
  const manual = (
    await execa(
      "git",
      ["log", "--reverse", "--format=%H", "--grep", manualSubject],
      { cwd: f.repoRoot },
    )
  ).stdout.split("\n")
  assert.equal(manual.length, 2)
  assert.ok(manual.every((commit) => !secondGroup.commits.includes(commit)))
  assert.deepEqual(secondGroup.references, secondGroup.commits)
  assert.equal(secondGroup.startingHead, manual[0])

  const data = JSON.parse(
    await readFile(join(f.activeRoot, `${label}-rounds.json`), "utf8"),
  ) as {
    rounds: {
      target: string
      originalGroups: { commits: string[] }[]
      groups: { commits: string[] }[]
    }[]
  }
  assert.deepEqual(
    data.rounds.map((entry) => entry.target),
    [label, label],
  )
  assert.deepEqual(data.rounds[1].originalGroups[0].commits, original)
  assert.deepEqual(data.rounds[1].groups[0].commits, secondGroup.commits)
})

test("a rerun starts with fixes retained by the same commit-series label", async (t) => {
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
  await commitFixture(f.repoRoot, "Original newest commit")
  const original = await Promise.all(
    ["HEAD~1", "HEAD"].map(
      async (revision) =>
        (await execa("git", ["rev-parse", revision], { cwd: f.repoRoot }))
          .stdout,
    ),
  )
  const label = `commit-${original[0].slice(0, 6)}..${original[1].slice(0, 6)}`
  for (const expected of ["Rule 2", "Rule 2"]) {
    assert.equal(
      await runCommand(["round", ...original, "--no-watch"], f.runtime, {
        ...f.options,
        settings: singleAuditorSettings,
      }),
      0,
      `${f.errors.join("\n")}\n${f.visible.join("\n")}`,
    )
    assert.match(f.visible.at(-1) ?? "", new RegExp(expected))
  }

  const data = JSON.parse(
    await readFile(join(f.activeRoot, `${label}-rounds.json`), "utf8"),
  ) as {
    rounds: { commits: { repository: string; sha: string }[] }[]
  }
  const retainedFix = data.rounds[0].commits[0]
  assert.ok(retainedFix)
  const audits = (await f.prompts()).filter((call) =>
    call.prompt.startsWith("Run the audit phase "),
  )
  assert.equal(audits.length, 2)
  const secondArguments = /^Phase arguments \(JSON array\): (.+)$/m.exec(
    audits[1].prompt,
  )
  assert.ok(secondArguments)
  const [, secondGroup] = JSON.parse(secondArguments[1]) as [
    string,
    { commits: string[]; originalCommits: string[] },
  ]
  assert.deepEqual(secondGroup.originalCommits, original)
  assert.deepEqual(secondGroup.commits, [...original, retainedFix.sha])
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
    await runCommand(
      ["round", "example.md", "1", "--no-watch"],
      f.runtime,
      f.options,
    ),
    1,
  )
  assert.match(f.errors.join("\n"), /Archived plans are not audit targets/)
  await assert.rejects(f.prompts())
})

test("a random default auditor opens the series on the coin before deterministic selection", async (t) => {
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
  const counts: number[] = []

  assert.equal(
    await runCommand(["round", "example.md", "1", "--no-watch"], f.runtime, {
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
  assert.deepEqual(counts, [settings.implementation.auditors.length])
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

test("--first replaces the default auditor's first round before deterministic selection", async (t) => {
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
  assert.equal(
    await runCommand(
      ["round", "example.md", "1", "--first", "ab", "--no-watch"],
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
  // The selection names the listed Claude auditor, so it opens the series in
  // the configured first entry's place and the runner continues the list.
  for (const argument of ["--model", "opus", "--effort", "high"])
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
    /audit +claude +\S+ +high +--first/,
  )
  const visible = f.visible.join("\n")
  assert.match(visible, /Next round: codex gpt-5\.6-sol high;/)
  assert.match(
    visible,
    /Implementation audit of example, step 1: automatic auditor series stopped after 2 rounds\./,
  )
  await assert.rejects(
    readFile(join(f.activeRoot, "example-impl-audit-01..01-queue.md")),
    { code: "ENOENT" },
  )
})

test("an automatic series needs a current read from each listed model of one assistant", async (t) => {
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
  settings.implementation.auditors = [
    { assistant: "claude", model: "claude-fable-5-1", effort: "high" },
    { assistant: "claude", model: "opus", effort: "xhigh" },
  ]
  // The alias resolves to a release at startup. The round data names each
  // round's auditor by that release, so the pool offers it under that name.
  await f.configure({
    phases: f.phases,
    releases: { opus: "claude-opus-5-5" },
  })

  assert.equal(
    await runCommand(["round", "example.md", "1", "--no-watch"], f.runtime, {
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
  // The class's panel vets each round whichever Claude model audited.
  assert.deepEqual(
    prompts
      .filter((call) => call.prompt.startsWith("Run the vet phase "))
      .map((call) => call.assistant),
    ["claude", "claude"],
  )
  assert.match(
    f.visible.join("\n"),
    /automatic auditor series stopped after 2 rounds\. Rule 2:/,
  )
  const stored = JSON.parse(
    await readFile(join(f.activeRoot, "example-impl-rounds.json"), "utf8"),
  ) as { rounds: { pool?: unknown[]; judge: { answer: unknown } | null }[] }
  assert.deepEqual(stored.rounds[0].judge?.answer, {
    assistant: "claude",
    model: "claude-opus-5-5",
    effort: "xhigh",
  })
  assert.equal(stored.rounds[1].judge?.answer, "stop")
  assert.deepEqual(stored.rounds[0].pool, [
    { assistant: "claude", model: "claude-fable-5-1", effort: "high" },
    { assistant: "claude", model: "claude-opus-5-5", effort: "xhigh" },
  ])
})

test("a --first selection outside the target class's auditors list is refused before any round", async (t) => {
  const f = await roundFixture(
    t,
    "claude",
    "plan",
    false,
    null,
    false,
    "plan",
    true,
    true,
  )
  const settings = structuredClone(testSettings)
  settings.planning.auditors = [
    { assistant: "codex", model: "gpt-5.6-sol", effort: "high" },
  ]
  settings.implementation.auditors = [
    { assistant: "claude", model: "claude-fable-5-1", effort: "xhigh" },
  ]
  assert.equal(
    await runCommand(
      ["round", "example.md", "plan", "--first", "atx", "--no-watch"],
      f.runtime,
      { ...f.options, settings },
    ),
    2,
  )
  assert.match(
    f.errors.join("\n"),
    /--first atx resolves to claude claude-fable-5-1 xhigh, which the planning\.auditors list in settings\.json does not hold\. Name a listed auditor: codex gpt-5\.6-sol high\./,
  )
  await assert.rejects(f.prompts(), { code: "ENOENT" })
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
    await runCommand(["round", "example.md", "--no-watch"], f.runtime, {
      ...f.options,
      awaitAnswer: async () => {
        await rm(widening)
        await rename(settled, widening)
        await finishFixOnReply(f)
        return { rulings: [], reply: "Reopen the plan." }
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
      ["round", "example.md", "--auditor", "codex,claude", "--no-watch"],
      f.runtime,
      {
        ...f.options,
        awaitAnswer: async () => {
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
          return { rulings: [], reply: "Reopen the plan." }
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
  const settings = structuredClone(testSettings)
  settings.maximumAutomaticRounds = 1

  assert.equal(
    await runCommand(["round", "example.md", "1", "--no-watch"], f.runtime, {
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
    1,
  )
  assert.match(
    f.visible.join("\n"),
    /Implementation audit of example, step 1: automatic auditor series reached its maximum of 1 round\./,
  )
})

test("a clean automatic audit follows the deterministic selection", async (t) => {
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
    await runCommand(
      ["round", "example.md", "1", "--no-watch"],
      f.runtime,
      f.options,
    ),
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

test("a widening series ends on its settled recommendation", async (t) => {
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
  )

  assert.equal(
    await runCommand(["round", "example-widen.md", "--no-watch"], f.runtime, {
      ...f.options,
      settings: singleAuditorSettings,
    }),
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
    /Plan audit of example: automatic auditor series ended after 1 round\. Widening is done: run pnpm audit-round settle example\. Rule 2: every pool entry has a current read, and the widening recommendation is settle\./,
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
      pool?: unknown[]
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
    reason:
      "Rule 2: every pool entry has a current read, and the widening recommendation is settle.",
  })
  assert.deepEqual(stored?.pool, [
    { assistant: "codex", model: "gpt-5.6-sol", effort: "high" },
  ])
})

test("a widening keep-open recommendation stops the series without settling", async (t) => {
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
  assert.equal(
    await runCommand(["round", "example-widen.md", "--no-watch"], f.runtime, {
      ...f.options,
      settings: singleAuditorSettings,
    }),
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
  assert.match(
    visible,
    /Plan audit of example: automatic auditor series stopped after 1 round\. Rule 2: every pool entry has a current read; keep open\. The shape question needs evidence only the user can supply\./,
  )
})

test("a detailing series ends ready after every represented assistant has a current read", async (t) => {
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
  assert.equal(
    await runCommand(["round", "example.md", "--no-watch"], f.runtime, {
      ...f.options,
      settings: singleAuditorSettings,
    }),
    0,
    f.errors.join("\n"),
  )
  const visible = f.visible.join("\n")
  assert.match(
    visible,
    /Plan audit of example: automatic auditor series ended after 1 round\. Detailing is done: run pnpm audit-round ready example\. Rule 2: every pool entry has a current read; the detailing plan is ready\./,
  )
  const {
    rounds: [stored],
  } = JSON.parse(
    await readFile(join(f.activeRoot, "example-plan-rounds.json"), "utf8"),
  ) as {
    rounds: {
      phase: string
      pool?: unknown[]
      judge: { answer: string; reason: string } | null
    }[]
  }
  assert.equal(stored?.phase, "detailing")
  assert.deepEqual(stored?.judge, {
    answer: "ready",
    reason:
      "Rule 2: every pool entry has a current read; the detailing plan is ready.",
  })
  assert.deepEqual(stored?.pool, [
    { assistant: "codex", model: "gpt-5.6-sol", effort: "high" },
  ])
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
      ["round", "example-widen.md", "1,2", "--no-watch"],
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

test("a configured Claude fixer starts and resumes the fix whoever audited", async (t) => {
  const f = await roundFixture(t, "claude", "repo-edu", true)
  const settings = structuredClone(testSettings)
  settings.implementation.coders[0].assistant = "claude"
  const code = await runCommand(
    ["round", "example.md", "1", "--auditor", "a", "--no-watch"],
    f.runtime,
    {
      ...f.options,
      settings,
      awaitAnswer: async () => {
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
        return { rulings: [], reply: "Choose option 1." }
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
    await runCommand(["round", "example.md", "1,2", "--no-watch"], f.runtime, {
      ...f.options,
      settings: singleAuditorSettings,
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
  const visible = f.visible.join("\n")
  assert.match(
    visible,
    /Implementation audit of example, step 1: automatic auditor series stopped after 1 round\./,
  )
  assert.match(
    visible,
    /Next scope: Implementation audit of example, step 2; 0 scopes remain after it\./,
  )
  assert.match(
    visible,
    /Implementation audit of example, step 2: automatic auditor series stopped after 1 round\./,
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
      ["example-impl-audit-01..01", 1, "1"],
      ["example-impl-audit-02..02", 1, "2"],
    ],
  )
})

test("a ruling left unanswered stops the scope list before its later scopes", async (t) => {
  const f = await roundFixture(t, "codex", "repo-edu", true)
  assert.equal(
    await runCommand(
      ["round", "example.md", "1,2,3-4", "--no-watch"],
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
    ["round", "example.md", "1,2", "--auditor", "codex"],
    ["name", "example.md", "1", "2", "--auditor", "oth"],
  ])
    assert.equal(await runCommand(argv, f.runtime, f.options), 2)
  const errors = f.errors.join("\n")
  assert.match(errors, /Use --auditor with one scope/)
  assert.match(errors, /claims one scope/)
  assert.deepEqual(await f.roundFiles(), [])
})

test("a rerun opens on the assistant without a current read and names its claimed round", async (t) => {
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
  assert.equal(
    await runCommand(
      ["round", "example.md", "1", "--auditor", "a", "--no-watch"],
      f.runtime,
      f.options,
    ),
    0,
    `${f.errors.join("\n")}\n${f.visible.join("\n")}`,
  )
  const settings = structuredClone(testSettings)
  settings.defaultAuditor = "random"
  const counts: number[] = []
  assert.equal(
    await runCommand(["round", "example.md", "1", "--no-watch"], f.runtime, {
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
  // The retained claude read opens the rerun on codex; the coin is never thrown.
  assert.deepEqual(counts, [])
  const visible = f.visible.join("\n")
  assert.match(
    visible,
    /Opening round: codex gpt-5\.6-sol high\. Rule 3: codex gpt-5\.6-sol high has no current read\./,
  )
  assert.match(
    visible,
    /Implementation audit of example, step 1: automatic auditor series stopped after 1 round\. Rule 2: every pool entry has a current read; the series stops\./,
  )
  const transcripts = (await f.roundFiles()).filter((name) =>
    /-1-round\..+\.md$/.test(name),
  )
  assert.deepEqual(transcripts.toSorted(), [
    "example-impl-audit-01..01-01-1-round.abh.md",
    "example-impl-audit-01..01-02-1-round.obh.md",
  ])
  const second = await readFile(
    join(f.activeRoot, "example-impl-audit-01..01-02-1-round.obh.md"),
    "utf8",
  )
  assert.match(
    second,
    /^# Implementation audit of .*example\.md, step 1 \(round 2\)\n/,
  )
})

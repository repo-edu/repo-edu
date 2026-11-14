import assert from "node:assert/strict"
import { access, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { type TestContext, test } from "node:test"
import { execa } from "execa"
import { lifecycleStage } from "../default-target.js"
import {
  type ImplementationRoundData,
  roundDataFilename,
  writeRoundData,
} from "../round-data.js"
import { runCommand, testSettings } from "./configured-runner.js"
import { finishedText, phaseStream, recorded } from "./helpers.js"
import { commitFixture, roundFixture } from "./round-fixture.js"

type Fixture = Awaited<ReturnType<typeof roundFixture>>

/** A plan file the lifecycle commands preflight must be committed as it stands. */
async function commitPlan(f: Fixture, name: string) {
  await execa("git", ["add", join("active", name)], { cwd: f.planRoot })
  await commitFixture(f.planRoot, `example/init ath: add ${name}`)
}

/**
 * A random default opens each series on the entry the coin names, so each
 * series' auditor answers with its own report: the first entry is Codex and
 * the second Claude.
 */
function openers(...indexes: readonly number[]) {
  let call = 0
  return () => indexes[call++] ?? 0
}

async function configureRun(
  f: Fixture,
  documents: {
    readonly codex: string | readonly string[]
    readonly claude: string | readonly string[]
  },
) {
  const configured = (value: string | readonly string[]) =>
    typeof value === "string" ? { source: value } : { sources: value }
  await f.configure({
    phases: {
      ...f.phases,
      audit: {
        ...(f.phases.audit as Record<string, unknown>),
        documents: {
          codex: configured(documents.codex),
          claude: configured(documents.claude),
        },
      },
    },
  })
}

/** The recorded Codex stream reports xhigh, so the assigned coder runs on it. */
const runSettings = {
  ...testSettings,
  defaultAuditor: "first" as const,
  planning: {
    ...testSettings.planning,
    auditors: [testSettings.planning.auditors[0]],
  },
  implementation: {
    ...testSettings.implementation,
    auditors: [testSettings.implementation.auditors[0]],
    coders: [
      {
        assistant: "codex" as const,
        model: "gpt-5.6-sol",
        effort: "xhigh" as const,
      },
    ],
  },
}

test("run marks a detailing plan ready, implements it, audits its ranges and closes it", async (t) => {
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
  await commitPlan(f, "example.md")
  const implementation = join(f.activeRoot, "implementation-source.md")
  await writeFile(
    implementation,
    `Implementation audit workflow\nTarget: <arguments>\nJudged repos: repo-edu@${f.heads["repo-edu"]}\n\n## Findings\n\nNo findings.\n`,
  )
  f.phases.implement = {
    commits: [
      {
        cwd: f.repoRoot,
        subject: "example/impl-1 obx feat(audit-round): implement fixture",
      },
    ],
    stream: await phaseStream("codex", finishedText, "implementation-session"),
    usage: {
      path: `${f.root}/rollout-implementation-session.jsonl`,
      text: await recorded("codex-rollout.jsonl"),
    },
  }
  await configureRun(f, {
    codex: [f.report, implementation],
    claude: [f.report, implementation],
  })

  assert.equal(
    await runCommand(["example"], f.runtime, {
      ...f.options,
      settings: runSettings,
      coin: openers(0, 1),
    }),
    0,
    [...f.errors, ...f.visible].join("\n"),
  )
  const planSubjects = (
    await execa("git", ["log", "--format=%s"], { cwd: f.planRoot })
  ).stdout.split("\n")
  assert.ok(
    planSubjects.includes(
      "example/ready: declare the plan ready for implementation",
    ),
  )
  const repoEduSubjects = (
    await execa("git", ["log", "--format=%s"], { cwd: f.repoRoot })
  ).stdout.split("\n")
  assert.deepEqual(repoEduSubjects.slice(0, 3), [
    "example/impl-audit-1 obx clean: record audit with no findings",
    "example/implemented obx: complete the Repo Edu share",
    "example/impl-1 obx feat(audit-round): implement fixture",
  ])
  const phases = (await f.prompts()).flatMap((call) => {
    const phase = /^Run the (\w+) phase/.exec(call.prompt)?.[1]
    return phase === undefined ? [] : [phase]
  })
  assert.deepEqual(phases, ["audit", "implement", "audit", "close"])
  await assert.rejects(access(join(f.activeRoot, "example.md")), {
    code: "ENOENT",
  })
  const visible = f.visible.join("\n")
  for (const stage of [
    "detailing series",
    "implementation",
    "audit range series",
    "close",
  ])
    assert.match(
      visible,
      new RegExp(`Run of example: starting the ${stage}\\.`),
    )
  assert.match(
    visible,
    /Committed [0-9a-f]+: example\/ready: declare the plan ready/,
  )
  assert.match(
    visible,
    /Run of example finished: the plan is closed\. Run time \d\d:\d\d\./,
  )
})

test("a whole-life recovery resumes the failed worker and continues through markers, ranges and close", async (t) => {
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
  await commitPlan(f, "example.md")
  await commitFixture(
    f.planRoot,
    "example/ready: declare the plan ready for implementation\n\nCoder: codex gpt-5.6-sol xhigh",
  )
  const usage = {
    path: `${f.root}/rollout-implementation-session.jsonl`,
    text: await recorded("codex-rollout.jsonl"),
  }
  f.phases.implement = {
    stream: await phaseStream(
      "codex",
      'Lost the stream.\nPHASE RESULT: {"status":"failed","reason":"The stream disconnected."}',
      "implementation-session",
    ),
    usage,
  }
  await f.configure({ phases: f.phases })
  assert.equal(
    await runCommand(["example"], f.runtime, {
      ...f.options,
      settings: runSettings,
    }),
    1,
  )
  assert.match(
    f.visible.join("\n"),
    /^Resume: pnpm audit-round example --resume 1:implementation-session$/m,
  )

  const implementation = join(f.activeRoot, "implementation-source.md")
  await writeFile(
    implementation,
    `Implementation audit workflow\nTarget: <arguments>\nJudged repos: repo-edu@${f.heads["repo-edu"]}\n\n## Findings\n\nNo findings.\n`,
  )
  f.phases.implement = {
    commits: [
      {
        cwd: f.repoRoot,
        subject: "example/impl-1 obx feat(audit-round): implement fixture",
      },
    ],
    stream: await phaseStream("codex", finishedText, "implementation-session"),
    usage,
  }
  await configureRun(f, { codex: implementation, claude: implementation })
  assert.equal(
    await runCommand(
      ["example", "--resume", "1:implementation-session"],
      f.runtime,
      { ...f.options, settings: runSettings },
    ),
    0,
    [...f.errors, ...f.visible].join("\n"),
  )
  const calls = (await f.prompts()).flatMap((call) => {
    const phase = /^Run the (\w+) phase/.exec(call.prompt)?.[1]
    return phase === undefined ? [] : [{ phase, call }]
  })
  assert.deepEqual(
    calls.map(({ phase }) => phase),
    ["implement", "implement", "audit", "close"],
  )
  assert.ok(calls[1].call.args.includes("implementation-session"))
  const repoEduSubjects = (
    await execa("git", ["log", "--format=%s"], { cwd: f.repoRoot })
  ).stdout.split("\n")
  assert.deepEqual(repoEduSubjects.slice(1, 3), [
    "example/implemented obx: complete the Repo Edu share",
    "example/impl-1 obx feat(audit-round): implement fixture",
  ])
  assert.match(repoEduSubjects[0], /^example\/impl-audit-1 /)
  assert.match(
    f.visible.join("\n"),
    /Run of example finished: the plan is closed\./,
  )
})

test("a recovery whose plan has left the implementation leaves the session unused", async (t) => {
  const f = await roundFixture(t)
  await commitFixture(
    f.planRoot,
    "example/ready: declare the plan ready for implementation\n\nCoder: codex gpt-5.6-sol xhigh",
  )
  await commitFixture(
    f.repoRoot,
    "example/implemented obx: complete the Repo Edu share",
  )
  await configureRun(f, { codex: f.report, claude: f.report })
  await runCommand(["example", "--resume", "1:old-session"], f.runtime, {
    ...f.options,
    settings: runSettings,
  })
  assert.match(
    f.visible.join("\n"),
    /example starts in the audit range series, so session old-session stays unused\./,
  )
  const phases = (await f.prompts()).map(
    (call) => /^Run the (\w+) phase/.exec(call.prompt)?.[1],
  )
  assert.ok(!phases.includes("implement"))
})

test("run continues a plan reopened after ready from its state once it settles", async (t) => {
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
  await commitPlan(f, "example-widen.md")
  // The marker stands through the reopen, and every hosted share has landed.
  await commitFixture(
    f.planRoot,
    "example/ready: declare the plan ready for implementation\n\nCoder: codex gpt-5.6-sol xhigh",
  )
  await commitFixture(
    f.repoRoot,
    "example/impl-1 obx feat(audit-round): implement fixture",
  )
  await commitFixture(
    f.repoRoot,
    "example/implemented obx: complete the Repo Edu share",
  )
  const implementation = join(f.activeRoot, "implementation-source.md")
  await writeFile(
    implementation,
    `Implementation audit workflow\nTarget: <arguments>\nJudged repos: repo-edu@${f.heads["repo-edu"]}\n\n## Findings\n\nNo findings.\n`,
  )
  await writeFile(
    f.report,
    `${await readFile(f.report, "utf8")}\nSettling: settle. No shape question remains.\n`,
  )
  await configureRun(f, {
    codex: [f.report, implementation],
    claude: [f.report, implementation],
  })

  assert.equal(
    await runCommand(["example"], f.runtime, {
      ...f.options,
      settings: runSettings,
      coin: openers(0, 1),
    }),
    0,
    [...f.errors, ...f.visible].join("\n"),
  )
  const phases = (await f.prompts()).flatMap((call) => {
    const phase = /^Run the (\w+) phase/.exec(call.prompt)?.[1]
    return phase === undefined ? [] : [phase]
  })
  assert.deepEqual(phases, ["audit", "audit", "close"])
  const visible = f.visible.join("\n")
  assert.match(visible, /Committed [0-9a-f]+: example\/settle: settle/)
  assert.doesNotMatch(visible, /starting the detailing series/)
  assert.match(visible, /Run of example: starting the audit range series\./)
  assert.match(
    visible,
    /Run of example finished: the plan is closed\. Run time \d\d:\d\d\./,
  )
})

test("run refuses a plan without an active artifact before any assistant starts", async (t) => {
  const f = await roundFixture(t)
  // A trailing -v is the run's own option, so it reaches the plan lookup.
  for (const argv of [["missing"], ["missing", "-v"]])
    assert.equal(await runCommand(argv, f.runtime, f.options), 1)
  assert.match(
    f.errors.join("\n"),
    /No active plan named missing .+ The run command requires an active plan\./,
  )
  await assert.rejects(readFile(join(f.root, "calls.jsonl")), {
    code: "ENOENT",
  })
})

test("the plan's state names the stage a run starts at", async (t) => {
  const f = await roundFixture(t)
  const context = {
    repoEduRoot: f.repoRoot,
    planRoot: f.planRoot,
    activeRoot: f.activeRoot,
  }
  const settled = join(f.activeRoot, "example.md")
  assert.equal(
    await lifecycleStage(context, join(f.activeRoot, "example-widen.md")),
    "widening",
  )
  assert.equal(await lifecycleStage(context, settled), "detailing")
  await commitFixture(
    f.planRoot,
    "example/ready: declare the plan ready for implementation\n\nCoder: codex gpt-5.6-sol high",
  )
  // Step 1 has landed, but Repo Edu's implemented marker is still missing.
  assert.equal(await lifecycleStage(context, settled), "implement")
  await commitFixture(
    f.repoRoot,
    "example/implemented obh: complete the Repo Edu share",
  )
  assert.equal(await lifecycleStage(context, settled), "ranges")
})

/** One finished round on the fixture's full step range, as the runner retains it. */
function fullRangeRound(
  round: number,
  started: number,
  answer: NonNullable<ImplementationRoundData["judge"]>["answer"],
  commits: ImplementationRoundData["commits"] = [],
): ImplementationRoundData {
  return {
    target: "example-impl-audit-01..01",
    round,
    tag: "obx",
    started: new Date(started).toISOString(),
    status: "finished",
    settings: {
      vetters: [
        { assistant: "claude", model: "claude-opus-5", effort: "high" },
      ],
      fix: { assistant: "codex", model: "gpt-5.6-sol", effort: "high" },
    },
    auditor: {
      assistant: "codex",
      model: "gpt-5.6-sol",
      effort: "xhigh",
      chosenBy: "settings",
    },
    phases: [],
    commits,
    findings: [],
    judge: { answer, reason: "The fixture's reads have converged." },
    scope: "1",
    judgedRepos: ["repo-edu"],
  }
}

/** One file-changing commit at a fixed time, returned as its full commit ID. */
async function fileCommit(cwd: string, subject: string, at: number) {
  await writeFile(join(cwd, "change.md"), `${subject}\n`)
  await execa("git", ["add", "change.md"], { cwd })
  await commitFixture(cwd, subject, new Date(at).toISOString())
  return (await execa("git", ["rev-parse", "HEAD"], { cwd })).stdout
}

/** Ready and implemented, so the plan's state has left the implementation. */
async function implementedFixture(t: TestContext) {
  const f = await roundFixture(t)
  await commitFixture(
    f.planRoot,
    "example/ready: declare the plan ready for implementation\n\nCoder: codex gpt-5.6-sol xhigh",
  )
  await commitFixture(
    f.repoRoot,
    "example/implemented obx: complete the Repo Edu share",
  )
  return {
    ...f,
    roundData: join(
      f.activeRoot,
      roundDataFilename("example", "implementation"),
    ),
  }
}

test("a full range whose newest series stopped with no later plan change starts at the close", async (t) => {
  const f = await implementedFixture(t)
  const context = {
    repoEduRoot: f.repoRoot,
    planRoot: f.planRoot,
    activeRoot: f.activeRoot,
  }
  const plan = join(f.activeRoot, "example.md")
  const minute = 60_000
  const start = Date.now() + minute
  writeRoundData(
    f.roundData,
    fullRangeRound(1, start, {
      assistant: "claude",
      model: "claude-opus-5",
      effort: "high",
    }),
  )
  assert.equal(await lifecycleStage(context, plan), "ranges")
  // The stopping round's own fix lands after it starts and stays judged.
  const fix = await fileCommit(
    f.repoRoot,
    "example/impl-audit-1 abh growth-none c1 fix(audit-round): fixture",
    start + 11 * minute,
  )
  writeRoundData(
    f.roundData,
    fullRangeRound(2, start + 10 * minute, "stop", [
      { repository: "repo-edu", sha: fix },
    ]),
  )
  assert.equal(await lifecycleStage(context, plan), "close")
  // An empty clean record and a commit outside the plan change nothing it judged.
  await commitFixture(
    f.repoRoot,
    "example/impl-audit-1 abh clean: record audit with no findings",
    new Date(start + 20 * minute).toISOString(),
  )
  await fileCommit(
    f.repoRoot,
    "abh growth-none c1 fix(audit-round): unrelated",
    start + 21 * minute,
  )
  assert.equal(await lifecycleStage(context, plan), "close")
  await fileCommit(
    f.repoRoot,
    "example/impl-audit-1 abh growth-none c1 fix(audit-round): later",
    start + 30 * minute,
  )
  assert.equal(await lifecycleStage(context, plan), "ranges")
})

test("run closes a plan whose full range has settled without another audit", async (t) => {
  const f = await implementedFixture(t)
  writeRoundData(f.roundData, fullRangeRound(1, Date.now() + 60_000, "stop"))
  assert.equal(
    await runCommand(["example"], f.runtime, {
      ...f.options,
      settings: runSettings,
    }),
    0,
    [...f.errors, ...f.visible].join("\n"),
  )
  const phases = (await f.prompts()).map(
    (call) => /^Run the (\w+) phase/.exec(call.prompt)?.[1],
  )
  assert.deepEqual(phases, ["close"])
  const visible = f.visible.join("\n")
  assert.match(visible, /Run of example: starting the close\./)
  assert.match(visible, /Run of example finished: the plan is closed\./)
})

import assert from "node:assert/strict"
import { access, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { test } from "node:test"
import { execa } from "execa"
import { lifecycleStage } from "../default-target.js"
import { runCommand, testSettings } from "./configured-runner.js"
import { finishedText, phaseStream, recorded } from "./helpers.js"
import { commitFixture, roundFixture } from "./round-fixture.js"

type Fixture = Awaited<ReturnType<typeof roundFixture>>

/** A plan file the lifecycle commands preflight must be committed as it stands. */
async function commitPlan(f: Fixture, name: string) {
  await execa("git", ["add", name], { cwd: f.planRoot })
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
  documents: { readonly codex: string; readonly claude: string },
  judgeAnswers: readonly string[],
) {
  const judge = f.phases.judge as Record<string, unknown>
  await f.configure({
    phases: {
      ...f.phases,
      audit: {
        ...(f.phases.audit as Record<string, unknown>),
        documents: {
          codex: { source: documents.codex },
          claude: { source: documents.claude },
        },
      },
      judge: {
        ...judge,
        streams: await Promise.all(
          judgeAnswers.map((answer) =>
            phaseStream(
              "codex",
              `${answer}\n\nPHASE RESULT: {"status":"finished","reason":null}`,
              "judge-session",
            ),
          ),
        ),
      },
    },
  })
}

/** The recorded Codex stream reports xhigh, so the assigned coder runs on it. */
const runSettings = {
  ...testSettings,
  defaultAuditor: "random" as const,
  coders: [
    {
      assistant: "codex" as const,
      model: "gpt-5.6-sol",
      effort: "xhigh" as const,
    },
  ],
}

test("run settles on the widening judge's answer and ends where the detailing judge stops", async (t) => {
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
  await rm(join(f.planRoot, "example.md"))
  await commitPlan(f, "example-widen.md")
  const detailing = join(f.planRoot, "detailing-source.md")
  await writeFile(detailing, await readFile(f.report, "utf8"))
  await writeFile(
    f.report,
    `${await readFile(f.report, "utf8")}\nSettling: settle. No shape question remains.\n`,
  )
  await configureRun(f, { codex: f.report, claude: detailing }, [
    "Judge: settle. No concrete shape question remains.",
    "Judge: stop. The brief waits on evidence only the user can supply.",
  ])

  assert.equal(
    await runCommand(["run", "example"], f.runtime, {
      ...f.options,
      settings: runSettings,
      coin: openers(0, 1),
    }),
    0,
    [...f.errors, ...f.visible].join("\n"),
  )
  const subjects = (
    await execa("git", ["log", "--format=%s"], { cwd: f.planRoot })
  ).stdout.split("\n")
  assert.ok(subjects.includes("example/settle: settle the plan's shape"))
  assert.equal(
    subjects.some((subject) => subject.startsWith("example/ready")),
    false,
  )
  await access(join(f.planRoot, "example.md"))
  await assert.rejects(access(join(f.planRoot, "example-widen.md")), {
    code: "ENOENT",
  })
  const audits = (await f.prompts()).filter((call) =>
    call.prompt.startsWith("Run the audit phase "),
  )
  assert.deepEqual(
    audits.map((call) => call.assistant),
    ["codex", "claude"],
  )
  const visible = f.visible.join("\n")
  assert.match(visible, /Run of example: starting the widening series\./)
  assert.match(visible, /Committed [0-9a-f]+: example\/settle: settle/)
  assert.match(visible, /Run of example: starting the detailing series\./)
  assert.match(
    visible,
    /Plan audit of example: automatic auditor series stopped on the judge answer after 1 round\./,
  )
  assert.match(
    visible,
    /Run of example ended in the detailing series after the widening series, settle\. Once that ending is handled, pnpm audit-round run example continues from where the plan stands\. Run time \d\d:\d\d\./,
  )
  assert.doesNotMatch(visible, /starting the implementation/)
})

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
  await rm(join(f.planRoot, "example-widen.md"))
  await commitPlan(f, "example.md")
  const implementation = join(f.planRoot, "implementation-source.md")
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
  await configureRun(f, { codex: f.report, claude: implementation }, [
    "Judge: ready. The clean read leaves no remaining real bug in the brief.",
    "Judge: stop. The clean read leaves no remaining real bug in the range.",
  ])

  assert.equal(
    await runCommand(["run", "example"], f.runtime, {
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
    "example/impl-audit-1 abh clean: record audit with no findings",
    "example/implemented obx: complete the Repo Edu share",
    "example/impl-1 obx feat(audit-round): implement fixture",
  ])
  const phases = (await f.prompts()).flatMap((call) => {
    const phase = /^Run the (\w+) phase/.exec(call.prompt)?.[1]
    return phase === undefined ? [] : [phase]
  })
  assert.deepEqual(phases, [
    "audit",
    "judge",
    "implement",
    "audit",
    "judge",
    "close",
  ])
  await assert.rejects(access(join(f.planRoot, "example.md")), {
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
  await rm(join(f.planRoot, "example.md"))
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
  const implementation = join(f.planRoot, "implementation-source.md")
  await writeFile(
    implementation,
    `Implementation audit workflow\nTarget: <arguments>\nJudged repos: repo-edu@${f.heads["repo-edu"]}\n\n## Findings\n\nNo findings.\n`,
  )
  await writeFile(
    f.report,
    `${await readFile(f.report, "utf8")}\nSettling: settle. No shape question remains.\n`,
  )
  await configureRun(f, { codex: f.report, claude: implementation }, [
    "Judge: settle. No concrete shape question remains.",
    "Judge: stop. The clean read leaves no remaining real bug in the range.",
  ])

  assert.equal(
    await runCommand(["run", "example"], f.runtime, {
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
  assert.deepEqual(phases, ["audit", "judge", "audit", "judge", "close"])
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
  for (const argv of [
    ["run", "missing"],
    ["run", "missing", "-v"],
  ])
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
  const context = { repoEduRoot: f.repoRoot, planRoot: f.planRoot }
  const settled = join(f.planRoot, "example.md")
  assert.equal(
    await lifecycleStage(context, join(f.planRoot, "example-widen.md")),
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

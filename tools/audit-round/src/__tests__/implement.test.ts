import assert from "node:assert/strict"
import { readdir } from "node:fs/promises"
import { test } from "node:test"
import { execa } from "execa"
import {
  type ImplementationProgress,
  implementationProgress,
} from "../default-target.js"
import type { LogCommit } from "../episode-log.js"
import {
  type ImplementationDependencies,
  prepareImplementation,
  runImplementation,
} from "../implement.js"
import { implementationPhase, type PhaseInput } from "../phase.js"
import type { PlanStep } from "../plan-steps.js"
import { phasePrompt, recoveryCommand } from "../requests.js"
import type { Coder } from "../settings.js"
import type { Repository } from "../subject.js"
import { runCommand } from "./configured-runner.js"
import {
  finishedText,
  fixture,
  phaseStream,
  recorded,
  testContext,
} from "./helpers.js"
import { commitFixture, roundFixture } from "./round-fixture.js"

const coder: Coder = {
  assistant: "codex",
  model: "gpt-6.1-sol",
  effort: "xhigh",
}

function commit(subject: string, index: number): LogCommit {
  return {
    sha: String(index).padStart(40, "0"),
    committedAt: new Date(index * 1000).toISOString(),
    subject,
    body: "",
    files: [],
    renames: [],
  }
}

function mutableProgress(steps: readonly PlanStep[]) {
  const logs: Record<Repository, LogCommit[]> = { plan: [], "repo-edu": [] }
  let next = 1
  const read = (): ImplementationProgress =>
    implementationProgress(logs, "example", steps)
  const land = (repository: Repository, step: number) => {
    logs[repository].unshift(
      commit(`example/impl-${step} obx feat(audit-round): fixture`, next++),
    )
  }
  return { logs, read, land }
}

function input(steps: readonly PlanStep[]) {
  const context = testContext("/repo-edu")
  return {
    ...context,
    plan: `${context.planRoot}/example.md`,
    stem: "example",
    steps,
    selectedSteps: steps,
    coder,
    phaseRun: implementationPhase(coder),
    release: coder.model,
    effort: coder.effort,
  }
}

test("implementation requires an assigned ready marker before workers start", async (t) => {
  const f = await roundFixture(t)
  const context = {
    ...f.runtime,
    repoEduRoot: f.repoRoot,
    planRoot: f.planRoot,
  }
  await assert.rejects(
    prepareImplementation(context, "example"),
    /has no ready marker/,
  )
  await commitFixture(
    f.planRoot,
    "example/ready: declare the plan ready for implementation",
  )
  await assert.rejects(
    prepareImplementation(context, "example"),
    /ready marker without a coder assignment/,
  )
  await commitFixture(
    f.planRoot,
    "example/ready: assign the coder\n\nCoder: codex gpt-6.1-sol xhigh",
  )
  const prepared = await prepareImplementation(context, "example", "1")
  assert.deepEqual(prepared.coder, coder)
  assert.deepEqual(prepared.selectedSteps, [
    { number: 1, repositories: ["repo-edu"] },
  ])
})

test("landed-share scans keep the two repository histories independent", () => {
  const steps: PlanStep[] = [{ number: 1, repositories: ["plan", "repo-edu"] }]
  const progress = implementationProgress(
    {
      plan: [],
      "repo-edu": [
        commit("example/impl-1 obx feat(audit-round): Repo Edu share", 1),
      ],
    },
    "example",
    steps,
  )
  assert.deepEqual(progress.repositories, [
    {
      repository: "repo-edu",
      name: "Repo Edu",
      pending: [],
      marker: "missing",
    },
    {
      repository: "plan",
      name: "the plan repo",
      pending: [1],
      marker: "missing",
    },
  ])
})

test("remaining shares run in step order and markers follow the last hosted share", async () => {
  const steps: PlanStep[] = [
    { number: 1, repositories: ["plan", "repo-edu"] },
    { number: 2, repositories: ["repo-edu"] },
  ]
  const history = mutableProgress(steps)
  history.land("repo-edu", 1)
  const workers: PhaseInput<"implement">[] = []
  const markers: Repository[] = []
  const result = await runImplementation(input(steps), {
    readProgress: async () => history.read(),
    openStep: async () => ({ rulingFile: "/ruling.md" }),
    runWorker: async (phase) => {
      workers.push(phase)
      for (const repository of phase.arguments[2])
        history.land(repository, phase.arguments[1])
      return {
        status: "finished",
        sessionId: `step-${phase.arguments[1]}`,
      }
    },
    checkFile: async () => {},
    requestRuling: async () => null,
    markImplemented: async (repository) => {
      markers.push(repository)
      return {
        sha: `${repository}-marker`,
        subject: `example/implemented obx: ${repository}`,
      }
    },
    message: async () => {},
  })
  assert.equal(result.status, "finished")
  assert.deepEqual(
    workers.map((worker) => [
      worker.arguments[1],
      worker.arguments[2],
      worker.sessionId,
    ]),
    [
      [1, ["plan"], null],
      [2, ["repo-edu"], null],
    ],
  )
  assert.deepEqual(markers, ["repo-edu", "plan"])
})

test("a failed worker stops before the next step and retains its recovery command", async () => {
  const steps: PlanStep[] = [
    { number: 1, repositories: ["repo-edu"] },
    { number: 2, repositories: ["repo-edu"] },
  ]
  const history = mutableProgress(steps)
  let calls = 0
  const result = await runImplementation(input(steps), {
    readProgress: async () => history.read(),
    openStep: async () => ({ rulingFile: "/ruling.md" }),
    runWorker: async () => {
      calls += 1
      return {
        status: "failed",
        sessionId: "failed-session",
        reason: "worker failed",
      }
    },
    checkFile: async () => {},
    requestRuling: async () => null,
    markImplemented: async () => {
      throw new Error("marker must not be written")
    },
    message: async () => {},
  })
  assert.equal(calls, 1)
  assert.equal(result.status, "failed")
  if (result.status !== "failed") throw new Error("Expected a failed result")
  assert.equal(result.step, 1)
  assert.equal(result.reason, "worker failed")
  assert.ok(result.session)
  assert.match(
    recoveryCommand(result.session),
    /codex .*resume.*failed-session/,
  )
})

test("a finished worker without every requested share stops the sequence", async () => {
  const steps: PlanStep[] = [
    { number: 1, repositories: ["plan", "repo-edu"] },
    { number: 2, repositories: ["repo-edu"] },
  ]
  const history = mutableProgress(steps)
  let calls = 0
  const result = await runImplementation(input(steps), {
    readProgress: async () => history.read(),
    openStep: async () => ({ rulingFile: "/ruling.md" }),
    runWorker: async () => {
      calls += 1
      history.land("repo-edu", 1)
      return { status: "finished", sessionId: "incomplete-session" }
    },
    checkFile: async () => {},
    requestRuling: async () => null,
    markImplemented: async () => {
      throw new Error("marker must not be written")
    },
    message: async () => {},
  })
  assert.equal(calls, 1)
  assert.deepEqual(result, {
    status: "failed",
    step: 1,
    reason: "Worker finished without landing step 1 in the plan repo.",
    session: {
      ...testContext("/repo-edu"),
      ...implementationPhase(coder),
      sessionId: "incomplete-session",
    },
  })
})

test("a ruling reply resumes the same worker without adding a time argument", async () => {
  const steps: PlanStep[] = [{ number: 1, repositories: ["repo-edu"] }]
  const history = mutableProgress(steps)
  const calls: PhaseInput<"implement">[] = []
  let checked = false
  const dependencies: ImplementationDependencies = {
    readProgress: async () => history.read(),
    openStep: async () => ({ rulingFile: "/implementation-ruling.md" }),
    runWorker: async (phase) => {
      calls.push(phase)
      if (calls.length === 1)
        return { status: "needs-ruling", sessionId: "ruling-session" }
      history.land("repo-edu", 1)
      return { status: "finished", sessionId: "ruling-session" }
    },
    checkFile: async (file) => {
      assert.equal(file, "/implementation-ruling.md")
      checked = true
    },
    requestRuling: async () => "Use the existing parser.",
    markImplemented: async () => ({
      sha: "marker",
      subject: "example/implemented obx: Repo Edu",
    }),
    message: async () => {},
  }
  assert.equal(
    (await runImplementation(input(steps), dependencies)).status,
    "finished",
  )
  assert.equal(checked, true)
  assert.equal(calls.length, 2)
  assert.equal(calls[0].sessionId, null)
  assert.equal(calls[1].sessionId, "ruling-session")
  assert.equal(calls[1].rulingReply, "Use the existing parser.")
  assert.deepEqual(calls[1].arguments, calls[0].arguments)
  assert.equal(calls[1].arguments.length, 5)
})

test("the implement phase uses Repo Edu's worker workflow without a chat launcher", async (t) => {
  const f = await fixture(t)
  const context = testContext(f.root)
  const phase: PhaseInput<"implement"> = {
    ...context,
    ...implementationPhase(coder),
    phase: "implement",
    sessionId: null,
    arguments: [
      `${context.planRoot}/example.md`,
      3,
      ["plan", "repo-edu"],
      coder.model,
      coder.effort,
    ],
    rulingFile: `${context.planRoot}/ruling.md`,
  }
  const prompt = phasePrompt(phase).text
  assert.match(prompt, /\.agents\/skills\/implement\/references\/workflow\.md/)
  assert.doesNotMatch(prompt, /launcher|SKILL\.md/)
  assert.ok(prompt.includes(JSON.stringify(phase.arguments)))
  const resumed = phasePrompt({
    ...phase,
    sessionId: "implementation-session",
    rulingReply: "Use the existing parser.",
  }).text
  assert.match(resumed, /Continue this implement session/)
  assert.doesNotMatch(resumed, /Source file:/)
})

test("the command launches the assigned worker, verifies its share and writes the marker", async (t) => {
  const f = await roundFixture(
    t,
    "codex",
    "repo-edu",
    false,
    null,
    false,
    "repo-edu",
    false,
    false,
    false,
  )
  await commitFixture(
    f.planRoot,
    "example/ready: assign the coder\n\nCoder: codex gpt-5.6-sol xhigh",
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
  await f.configure({ phases: f.phases })

  assert.equal(
    await runCommand(["implement", "example"], f.runtime, f.options),
    0,
    [...f.errors, ...f.visible].join("\n"),
  )
  const worker = (await f.prompts()).find((call) =>
    call.prompt.startsWith("Run the implement phase"),
  )
  assert.ok(worker)
  assert.equal(worker.assistant, "codex")
  assert.ok(worker.args.includes("gpt-5.6-sol"))
  assert.ok(worker.args.some((argument: string) => argument.includes("xhigh")))
  assert.ok(
    worker.prompt.includes(
      `Phase arguments (JSON array): ${JSON.stringify([
        `${f.planRoot}/example.md`,
        1,
        ["repo-edu"],
        "gpt-5.6-sol",
        "xhigh",
      ])}`,
    ),
  )
  const subjects = (
    await execa("git", ["log", "-2", "--format=%s"], { cwd: f.repoRoot })
  ).stdout.split("\n")
  assert.deepEqual(subjects, [
    "example/implemented obx: complete the Repo Edu share",
    "example/impl-1 obx feat(audit-round): implement fixture",
  ])
  assert.equal(
    (
      await execa("git", ["show", "-s", "--format=%b", "HEAD"], {
        cwd: f.repoRoot,
      })
    ).stdout.trimEnd(),
    "gpt-5.6-sol xhigh",
  )
  assert.deepEqual(
    (await readdir(f.planRoot)).filter((name) =>
      name.endsWith("-implement.obx.log"),
    ),
    ["example-impl-01-implement.obx.log"],
  )
})

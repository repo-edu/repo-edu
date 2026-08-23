import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { writeFileSync } from "node:fs"
import { readFile, writeFile } from "node:fs/promises"
import { basename, dirname, join } from "node:path"
import { afterEach, describe, it } from "node:test"
import type { PlanImplementationEvent } from "../contracts.js"
import { readCommittedImplementationPlan } from "../plan-reader.js"
import { createPlanStepCommitMessage } from "../plan-record.js"
import { runPlanImplementation } from "../plan-runner.js"
import type { StepCommand, StepCommandRequest } from "../step-checks.js"
import {
  cleanupTestRepositories,
  codingAdapter,
  createPlan,
  createRepoEdu,
  git,
  planMarkdown,
  settledChildren,
  succeededResult,
  successfulCommands,
} from "./plan-runner-test-harness.js"

afterEach(cleanupTestRepositories)

describe("runPlanImplementation", () => {
  it("commits each admitted step before starting the next clean context", async () => {
    const planPath = await createPlan()
    const repoEduRoot = await createRepoEdu()
    const commandCalls: StepCommandRequest[] = []
    const announced: StepCommand[] = []
    const codingSteps: number[] = []

    const result = await runPlanImplementation(
      { repoEduRoot, planPath, run: { mode: "complete" } },
      {
        coding: codingAdapter(async (request) => {
          codingSteps.push(request.activeStep)
          assert.equal(
            (await git(repoEduRoot, ["status", "--porcelain"])).stdout,
            "",
          )
          await writeFile(
            join(repoEduRoot, `step-${request.activeStep}.txt`),
            `step ${request.activeStep}\n`,
          )
          return succeededResult(request.activeStep)
        }),
        commands: successfulCommands(commandCalls),
        ownedChildren: settledChildren,
        presentation: {
          event(event) {
            if (event.kind === "command-started") {
              announced.push({
                id: event.commandId,
                label: event.label,
                program: event.program,
                arguments: event.arguments,
              })
            }
          },
          close() {},
        },
      },
    )

    assert.equal(result.mode, "complete")
    assert.equal(result.resolvedCeiling, 2)
    assert.match(result.transcriptPath, /\.jsonl$/)
    assert.equal(result.outcome, "completed")
    assert.deepEqual(codingSteps, [1, 2])
    assert.deepEqual(
      commandCalls.map((command) => command.id),
      [
        "git-diff-check",
        "workspace-projects",
        "repository-check",
        "repository-test",
        "machine-proof-1",
        "git-diff-check",
        "repository-check",
        "repository-test",
      ],
    )
    assert.deepEqual(
      announced,
      commandCalls.map(({ cwd: _cwd, ...command }) => command),
    )
    assert.equal((await git(repoEduRoot, ["status", "--porcelain"])).stdout, "")
    assert.deepEqual(
      (await git(repoEduRoot, ["log", "-3", "--format=%s"])).stdout
        .trim()
        .split("\n"),
      [
        "example/completed: record completed implementation",
        "example/step-2-A1: redesign(plan-implementation): admit step 2",
        "example/step-1-A1: redesign(plan-implementation): admit step 1",
      ],
    )
    const events = (await readFile(result.transcriptPath, "utf8"))
      .trimEnd()
      .split("\n")
      .map((line) => JSON.parse(line) as PlanImplementationEvent)
    assert.deepEqual(
      events
        .filter((event) => event.kind === "step-started")
        .map((event) => event.step),
      [1, 2],
    )
    assert.deepEqual(
      events
        .filter((event) => event.kind === "step-committed")
        .map((event) => event.step),
      [1, 2],
    )
    assert.equal(
      events.filter((event) => event.kind === "command-started").length,
      commandCalls.length,
    )
    assert.equal(
      events.filter(
        (event) =>
          event.kind === "command-finished" && event.status === "succeeded",
      ).length,
      commandCalls.length,
    )
    assert.deepEqual(events.at(-1), {
      timestamp: events.at(-1)?.timestamp,
      kind: "run-finished",
      result,
    })
  })

  it("adds a missing completion marker without running another step", async () => {
    const planPath = await createPlan()
    const repoEduRoot = await createRepoEdu()
    const plan = await readCommittedImplementationPlan(planPath)
    for (const step of [1, 2]) {
      const result = succeededResult(step)
      if (result.status !== "succeeded") {
        throw new Error("The test coding result must succeed.")
      }
      const message = createPlanStepCommitMessage(
        plan.source,
        step,
        result.commit,
      )
      await git(repoEduRoot, [
        "commit",
        "--quiet",
        "--allow-empty",
        "--message",
        message.subject,
        "--message",
        message.body,
      ])
    }
    let codingStarted = false
    const commandCalls: StepCommandRequest[] = []

    const result = await runPlanImplementation(
      { repoEduRoot, planPath, run: { mode: "complete" } },
      {
        coding: codingAdapter(async () => {
          codingStarted = true
          return succeededResult(3)
        }),
        commands: successfulCommands(commandCalls),
        ownedChildren: settledChildren,
      },
    )

    assert.equal(result.outcome, "completed")
    assert.equal(codingStarted, false)
    assert.deepEqual(commandCalls, [])
    assert.equal(
      (await git(repoEduRoot, ["log", "-1", "--format=%s"])).stdout.trim(),
      "example/completed: record completed implementation",
    )
  })

  it("records a stopped transcript for a committed plan-structure defect", async () => {
    const planPath = await createPlan()
    const repoEduRoot = await createRepoEdu()
    await writeFile(planPath, "# Invalid committed plan\n")
    await git(dirname(planPath), ["add", "--", basename(planPath)])
    await git(dirname(planPath), [
      "commit",
      "--quiet",
      "-m",
      "break plan structure",
    ])
    let codingStarted = false

    const result = await runPlanImplementation(
      { repoEduRoot, planPath, run: { mode: "complete" } },
      {
        coding: codingAdapter(async () => {
          codingStarted = true
          return succeededResult(1)
        }),
        commands: successfulCommands([]),
        ownedChildren: settledChildren,
      },
    )

    assert.equal(result.outcome, "stopped")
    assert.equal(result.resolvedCeiling, null)
    assert.equal(codingStarted, false)
    const events = (await readFile(result.transcriptPath, "utf8"))
      .trimEnd()
      .split("\n")
      .map((line) => JSON.parse(line) as PlanImplementationEvent)
    assert.deepEqual(
      events.map((event) => event.kind),
      ["run-started", "phase-changed", "run-finished"],
    )
    assert.equal(
      events[0]?.kind === "run-started" ? events[0].totalSteps : null,
      0,
    )
  })

  it("records a stopped transcript when repository preflight fails", async () => {
    const planPath = await createPlan()
    const repoEduRoot = await createRepoEdu()
    await writeFile(join(repoEduRoot, "unadmitted.txt"), "not admitted\n")
    let codingStarted = false

    const result = await runPlanImplementation(
      { repoEduRoot, planPath, run: { mode: "count", count: 1 } },
      {
        coding: codingAdapter(async () => {
          codingStarted = true
          return succeededResult(1)
        }),
        commands: successfulCommands([]),
        ownedChildren: settledChildren,
      },
    )

    assert.equal(result.outcome, "stopped")
    assert.equal(result.resolvedCeiling, null)
    assert.equal(codingStarted, false)
    assert.match(
      result.outcome === "stopped" ? result.reason : "",
      /requires no staged, unstaged or untracked files/,
    )
    const events = (await readFile(result.transcriptPath, "utf8"))
      .trimEnd()
      .split("\n")
      .map((line) => JSON.parse(line) as PlanImplementationEvent)
    assert.equal(events[0]?.kind, "run-started")
    assert.equal(
      events[0]?.kind === "run-started" ? events[0].resolvedCeiling : undefined,
      null,
    )
    assert.equal(events.at(-1)?.kind, "run-finished")
  })

  it("announces and repeats install before admitting a manifest diff", async () => {
    const planPath = await createPlan()
    const repoEduRoot = await createRepoEdu()
    await writeFile(join(repoEduRoot, "package.json"), '{"version":"1"}\n')
    await git(repoEduRoot, ["add", "--", "package.json"])
    await git(repoEduRoot, ["commit", "--quiet", "-m", "add package"])
    const commandCalls: StepCommandRequest[] = []

    const result = await runPlanImplementation(
      { repoEduRoot, planPath, run: { mode: "count", count: 1 } },
      {
        coding: codingAdapter(async () => {
          await writeFile(
            join(repoEduRoot, "package.json"),
            '{"version":"2"}\n',
          )
          return succeededResult(1)
        }),
        commands: successfulCommands(commandCalls),
        ownedChildren: settledChildren,
      },
    )

    assert.equal(result.outcome, "bound-reached")
    assert.deepEqual(
      commandCalls.map(({ program, arguments: arguments_ }) => [
        program,
        arguments_,
      ]),
      [
        ["pnpm", ["install"]],
        ["git", ["diff", "--check"]],
        ["pnpm", ["list", "--recursive", "--depth", "-1", "--json"]],
        ["pnpm", ["check"]],
        ["pnpm", ["test"]],
        ["node", ["proof.mjs", "--first"]],
      ],
    )
  })

  it("repeats install for outside work admitted before coding", async () => {
    const planPath = await createPlan()
    const repoEduRoot = await createRepoEdu()
    const commandCalls: StepCommandRequest[] = []
    let outsideWorkCommitted = false

    const result = await runPlanImplementation(
      { repoEduRoot, planPath, run: { mode: "count", count: 1 } },
      {
        coding: codingAdapter(async () => {
          await writeFile(join(repoEduRoot, "step-1.txt"), "step 1\n")
          return succeededResult(1)
        }),
        commands: successfulCommands(commandCalls),
        ownedChildren: settledChildren,
        presentation: {
          event(event) {
            if (event.kind !== "run-started" || outsideWorkCommitted) return
            outsideWorkCommitted = true
            writeFileSync(
              join(repoEduRoot, "package.json"),
              '{"private":true}\n',
            )
            execFileSync("git", ["add", "--", "package.json"], {
              cwd: repoEduRoot,
            })
            execFileSync("git", ["commit", "--quiet", "-m", "outside work"], {
              cwd: repoEduRoot,
            })
          },
          close() {},
        },
      },
    )

    assert.equal(result.outcome, "bound-reached")
    assert.deepEqual(
      commandCalls.map((command) => command.id),
      [
        "dependency-install",
        "git-diff-check",
        "workspace-projects",
        "repository-check",
        "repository-test",
        "machine-proof-1",
      ],
    )
  })

  it("stops on a blocked coding result and preserves its diff", async () => {
    const planPath = await createPlan()
    const repoEduRoot = await createRepoEdu()
    const headBefore = (await git(repoEduRoot, ["rev-parse", "HEAD"])).stdout
    const commandCalls: StepCommandRequest[] = []

    const result = await runPlanImplementation(
      { repoEduRoot, planPath, run: { mode: "complete" } },
      {
        coding: codingAdapter(async () => {
          await writeFile(join(repoEduRoot, "blocked.txt"), "inspect me\n")
          return {
            status: "blocked",
            reason: "A contract decision is missing.",
          }
        }),
        commands: successfulCommands(commandCalls),
        ownedChildren: settledChildren,
      },
    )

    assert.equal(result.outcome, "stopped")
    assert.equal(
      result.outcome === "stopped" ? result.reason : null,
      "A contract decision is missing.",
    )
    assert.equal(
      (await git(repoEduRoot, ["rev-parse", "HEAD"])).stdout,
      headBefore,
    )
    assert.match(
      (await git(repoEduRoot, ["status", "--porcelain"])).stdout,
      /blocked\.txt/,
    )
    assert.deepEqual(commandCalls, [])
  })

  it("does not let presentation callbacks move repository work", async () => {
    const planPath = await createPlan()
    const repoEduRoot = await createRepoEdu()
    const commandCalls: StepCommandRequest[] = []

    const result = await runPlanImplementation(
      { repoEduRoot, planPath, run: { mode: "count", count: 1 } },
      {
        coding: codingAdapter(async () => {
          await writeFile(join(repoEduRoot, "step-1.txt"), "step 1\n")
          return succeededResult(1)
        }),
        commands: successfulCommands(commandCalls),
        ownedChildren: settledChildren,
        presentation: {
          event() {
            throw new Error("display failed")
          },
          close() {
            throw new Error("display close failed")
          },
        },
      },
    )

    assert.equal(result.outcome, "bound-reached")
    assert.equal(commandCalls.length, 5)
  })

  it("stops after Codex index writes before any check starts", async () => {
    const planPath = await createPlan()
    const repoEduRoot = await createRepoEdu()
    const commandCalls: StepCommandRequest[] = []

    const result = await runPlanImplementation(
      { repoEduRoot, planPath, run: { mode: "count", count: 1 } },
      {
        coding: codingAdapter(async () => {
          await writeFile(join(repoEduRoot, "staged.txt"), "forbidden\n")
          await git(repoEduRoot, ["add", "--", "staged.txt"])
          return succeededResult(1)
        }),
        commands: successfulCommands(commandCalls),
        ownedChildren: settledChildren,
      },
    )
    assert.equal(result.outcome, "stopped")
    assert.match(
      result.outcome === "stopped" ? result.reason : "",
      /changed the Git index/,
    )
    assert.deepEqual(commandCalls, [])
  })

  it("admits outside work while Codex works", async () => {
    const planPath = await createPlan()
    const repoEduRoot = await createRepoEdu()
    const commandCalls: StepCommandRequest[] = []

    const result = await runPlanImplementation(
      { repoEduRoot, planPath, run: { mode: "count", count: 1 } },
      {
        coding: codingAdapter(async () => {
          await writeFile(join(repoEduRoot, "step-1.txt"), "step 1\n")
          await writeFile(
            join(repoEduRoot, "outside-work.txt"),
            "outside work\n",
          )
          await git(repoEduRoot, ["add", "--", "outside-work.txt"])
          await git(repoEduRoot, ["commit", "--quiet", "-m", "outside work"])
          return succeededResult(1)
        }),
        commands: successfulCommands(commandCalls),
        ownedChildren: settledChildren,
      },
    )

    assert.equal(result.outcome, "bound-reached")
    assert.deepEqual(
      commandCalls.map((command) => command.id),
      [
        "git-diff-check",
        "workspace-projects",
        "repository-check",
        "repository-test",
        "machine-proof-1",
      ],
    )
    assert.equal(
      (
        await git(repoEduRoot, ["log", "-1", "--format=%s", "HEAD^"])
      ).stdout.trim(),
      "outside work",
    )
  })

  it("rejects outside work that overlaps the active step", async () => {
    const planPath = await createPlan()
    const repoEduRoot = await createRepoEdu()
    const commandCalls: StepCommandRequest[] = []

    const result = await runPlanImplementation(
      { repoEduRoot, planPath, run: { mode: "count", count: 1 } },
      {
        coding: codingAdapter(async () => {
          await writeFile(join(repoEduRoot, "README.md"), "outside work\n")
          await git(repoEduRoot, ["add", "--", "README.md"])
          await writeFile(join(repoEduRoot, "README.md"), "active step\n")
          await git(repoEduRoot, ["commit", "--quiet", "-m", "outside work"])
          return succeededResult(1)
        }),
        commands: successfulCommands(commandCalls),
        ownedChildren: settledChildren,
      },
    )

    assert.equal(result.outcome, "stopped")
    assert.match(
      result.outcome === "stopped" ? result.reason : "",
      /Outside work overlaps the active step: README\.md/,
    )
    assert.deepEqual(commandCalls, [])
  })

  it("rejects outside work that moves the active plan cursor", async () => {
    const planPath = await createPlan()
    const repoEduRoot = await createRepoEdu()
    const commandCalls: StepCommandRequest[] = []

    const result = await runPlanImplementation(
      { repoEduRoot, planPath, run: { mode: "count", count: 1 } },
      {
        coding: codingAdapter(async (request) => {
          await writeFile(join(repoEduRoot, "step-1.txt"), "step 1\n")
          const codingResult = succeededResult(1)
          if (codingResult.status !== "succeeded") {
            throw new Error("The test coding result must succeed.")
          }
          const message = createPlanStepCommitMessage(
            request.plan.source,
            1,
            codingResult.commit,
          )
          await git(repoEduRoot, [
            "commit",
            "--quiet",
            "--allow-empty",
            "--message",
            message.subject,
            "--message",
            message.body,
          ])
          return codingResult
        }),
        commands: successfulCommands(commandCalls),
        ownedChildren: settledChildren,
      },
    )

    assert.equal(result.outcome, "stopped")
    assert.match(
      result.outcome === "stopped" ? result.reason : "",
      /plan cursor moved from step 1 to step 2/,
    )
    assert.deepEqual(commandCalls, [])
  })

  it("repeats final checks after admitting outside work during checking", async () => {
    const planPath = await createPlan()
    const repoEduRoot = await createRepoEdu()
    const commandCalls: StepCommandRequest[] = []
    let outsideWorkCommitted = false
    const commands = successfulCommands(commandCalls, async (command) => {
      if (command.id === "repository-check" && !outsideWorkCommitted) {
        outsideWorkCommitted = true
        await writeFile(join(repoEduRoot, "package.json"), '{"private":true}\n')
        await git(repoEduRoot, ["add", "--", "package.json"])
        await git(repoEduRoot, ["commit", "--quiet", "-m", "outside work"])
      }
    })

    const result = await runPlanImplementation(
      { repoEduRoot, planPath, run: { mode: "count", count: 1 } },
      {
        coding: codingAdapter(async () => {
          await writeFile(join(repoEduRoot, "step-1.txt"), "step 1\n")
          return succeededResult(1)
        }),
        commands,
        ownedChildren: settledChildren,
      },
    )

    assert.equal(result.outcome, "bound-reached")
    assert.deepEqual(
      commandCalls.map((command) => command.id),
      [
        "git-diff-check",
        "workspace-projects",
        "repository-check",
        "repository-test",
        "machine-proof-1",
        "dependency-install",
        "git-diff-check",
        "workspace-projects",
        "repository-check",
        "repository-test",
        "machine-proof-1",
      ],
    )
  })

  it("rechecks the fixed plan source before the commit", async () => {
    const planPath = await createPlan()
    const repoEduRoot = await createRepoEdu()
    const commandCalls: StepCommandRequest[] = []

    const result = await runPlanImplementation(
      { repoEduRoot, planPath, run: { mode: "count", count: 1 } },
      {
        coding: codingAdapter(async () => {
          await writeFile(join(repoEduRoot, "step-1.txt"), "step 1\n")
          return succeededResult(1)
        }),
        commands: successfulCommands(commandCalls, async (command) => {
          if (command.id === "repository-test") {
            await writeFile(planPath, `${planMarkdown}\nChanged externally.\n`)
          }
        }),
        ownedChildren: settledChildren,
      },
    )
    assert.equal(result.outcome, "stopped")
    assert.match(
      result.outcome === "stopped" ? result.reason : "",
      /plan source no longer matches the source fixed at launch/,
    )
    assert.equal(
      (await git(repoEduRoot, ["log", "-1", "--format=%s"])).stdout.trim(),
      "initial",
    )
  })
})

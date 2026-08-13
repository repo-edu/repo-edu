import assert from "node:assert/strict"
import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import { afterEach, describe, it } from "node:test"
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
        observer: {
          codingEvent() {},
          commandStarted(command) {
            announced.push(command)
          },
        },
      },
    )

    assert.deepEqual(result, {
      mode: "complete",
      resolvedCeiling: 2,
      transcriptPath: null,
      outcome: "completed",
    })
    assert.deepEqual(codingSteps, [1, 2])
    assert.deepEqual(
      commandCalls.map((command) => command.id),
      [
        "git-diff-check",
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
      (
        await git(repoEduRoot, ["log", "-2", "--format=%s%x00%b%x00"])
      ).stdout.match(/Plan-Step: [12]/g),
      ["Plan-Step: 2", "Plan-Step: 1"],
    )
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
        ["pnpm", ["check"]],
        ["pnpm", ["test"]],
        ["node", ["proof.mjs", "--first"]],
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
        observer: {
          codingEvent() {
            throw new Error("display failed")
          },
          commandStarted() {
            throw new Error("display failed")
          },
        },
      },
    )

    assert.equal(result.outcome, "bound-reached")
    assert.equal(commandCalls.length, 4)
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
            await writeFile(planPath, `${planMarkdown}\nChanged outside.\n`)
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

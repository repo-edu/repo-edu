import assert from "node:assert/strict"
import { readFile, writeFile } from "node:fs/promises"
import { basename, dirname, join } from "node:path"
import { afterEach, describe, it } from "node:test"
import type {
  PlanImplementationEvent,
  PlanImplementationFinalResult,
} from "../contracts.js"
import { runPlanImplementation } from "../plan-runner.js"
import {
  commitAdmittedRepositoryDiff,
  stageAdmittedRepositoryDiff,
} from "../repository-admission.js"
import type { StepCommandExecutor, StepCommandRequest } from "../step-checks.js"
import {
  cleanupTestRepositories,
  codingAdapter,
  createPlan,
  createRepoEdu,
  git,
  settledChildren,
  succeededResult,
  successfulCommands,
} from "./plan-runner-test-harness.js"

afterEach(cleanupTestRepositories)

async function readTranscript(
  result: PlanImplementationFinalResult,
): Promise<readonly PlanImplementationEvent[]> {
  assert.ok(result.transcriptPath)
  return (await readFile(result.transcriptPath, "utf8"))
    .trimEnd()
    .split("\n")
    .map((line) => JSON.parse(line) as PlanImplementationEvent)
}

describe("complete plan runner contract", () => {
  it("honors a through-step bound and commits the exact proposal bullets", async () => {
    const planPath = await createPlan()
    const repoEduRoot = await createRepoEdu()
    const codingSteps: number[] = []

    const result = await runPlanImplementation(
      {
        repoEduRoot,
        planPath,
        run: { mode: "through-step", throughStep: 1 },
      },
      {
        coding: codingAdapter(async (request) => {
          codingSteps.push(request.activeStep)
          await writeFile(join(repoEduRoot, "step-1.txt"), "step 1\n")
          return succeededResult(request.activeStep)
        }),
        commands: successfulCommands([]),
        ownedChildren: settledChildren,
      },
    )

    assert.deepEqual(result, {
      mode: "through-step",
      throughStep: 1,
      resolvedCeiling: 1,
      transcriptPath: result.transcriptPath,
      outcome: "bound-reached",
    })
    assert.deepEqual(codingSteps, [1])
    const { stdout: body } = await git(repoEduRoot, [
      "show",
      "-s",
      "--format=format:%b",
      "HEAD",
    ])
    assert.match(body, /Plan-Step: 1/)
    assert.match(
      body,
      /- Step 1 enters one independently checked runner-owned commit\./,
    )
  })

  it("refuses an authorised user action before starting Codex", async () => {
    const planPath = await createPlan()
    const planRoot = dirname(planPath)
    const repoEduRoot = await createRepoEdu()
    const markdown = (await readFile(planPath, "utf8")).replace(
      "2. **Second step.** Make the second change.",
      `2. **Second step.** Make the second change.

   \`\`\`repo-edu-proofs
   [{ "user-action": "Inspect the second step." }]
   \`\`\``,
    )
    await writeFile(planPath, markdown)
    await git(planRoot, ["add", "--", basename(planPath)])
    await git(planRoot, ["commit", "--quiet", "-m", "add user action"])
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
    assert.match(
      result.outcome === "stopped" ? result.reason : "",
      /step 2 requires user action: Inspect the second step\./,
    )
  })

  it("stops after a failed check and records the failed command", async () => {
    const planPath = await createPlan()
    const repoEduRoot = await createRepoEdu()
    const headBefore = (await git(repoEduRoot, ["rev-parse", "HEAD"])).stdout
    const commandCalls: StepCommandRequest[] = []
    const commands: StepCommandExecutor = {
      async run(request) {
        commandCalls.push(request)
        return request.id === "repository-check"
          ? {
              exitCode: 1,
              signal: null,
              stdout: "",
              stderr: "typecheck failed",
            }
          : { exitCode: 0, signal: null, stdout: "", stderr: "" }
      },
    }

    const result = await runPlanImplementation(
      { repoEduRoot, planPath, run: { mode: "complete" } },
      {
        coding: codingAdapter(async () => {
          await writeFile(join(repoEduRoot, "step-1.txt"), "step 1\n")
          return succeededResult(1)
        }),
        commands,
        ownedChildren: settledChildren,
      },
    )

    assert.equal(result.outcome, "stopped")
    assert.match(
      result.outcome === "stopped" ? result.reason : "",
      /Repository check failed.*typecheck failed/,
    )
    assert.deepEqual(
      commandCalls.map((command) => command.id),
      ["git-diff-check", "repository-check"],
    )
    assert.equal(
      (await git(repoEduRoot, ["rev-parse", "HEAD"])).stdout,
      headBefore,
    )
    const events = await readTranscript(result)
    assert.equal(
      events.some(
        (event) =>
          event.kind === "command-finished" &&
          event.commandId === "repository-check" &&
          event.status === "failed",
      ),
      true,
    )
  })

  it("stops when the plan changes after one commit and before the next context", async () => {
    const planPath = await createPlan()
    const planRoot = dirname(planPath)
    const repoEduRoot = await createRepoEdu()
    const codingSteps: number[] = []
    let committedSteps = 0

    const result = await runPlanImplementation(
      { repoEduRoot, planPath, run: { mode: "complete" } },
      {
        coding: codingAdapter(async (request) => {
          codingSteps.push(request.activeStep)
          await writeFile(
            join(repoEduRoot, `step-${request.activeStep}.txt`),
            `step ${request.activeStep}\n`,
          )
          return succeededResult(request.activeStep)
        }),
        commands: successfulCommands([]),
        ownedChildren: settledChildren,
        repositoryCommit: {
          stage: stageAdmittedRepositoryDiff,
          async commit(...arguments_) {
            const committed = await commitAdmittedRepositoryDiff(...arguments_)
            committedSteps += 1
            if (committedSteps === 1) {
              await writeFile(planPath, "# Changed plan\n")
              await git(planRoot, ["add", "--", basename(planPath)])
              await git(planRoot, [
                "commit",
                "--quiet",
                "-m",
                "change plan between steps",
              ])
            }
            return committed
          },
        },
      },
    )

    assert.equal(result.outcome, "stopped")
    assert.match(
      result.outcome === "stopped" ? result.reason : "",
      /plan source no longer matches the source fixed at launch/,
    )
    assert.deepEqual(codingSteps, [1])
    assert.match(
      (await git(repoEduRoot, ["log", "-1", "--format=%b"])).stdout,
      /Plan-Step: 1/,
    )
  })
})

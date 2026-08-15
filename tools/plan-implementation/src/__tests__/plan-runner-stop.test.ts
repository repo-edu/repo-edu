import assert from "node:assert/strict"
import { access, chmod, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { afterEach, describe, it } from "node:test"
import type { CodingResult, PlanImplementationEvent } from "../contracts.js"
import { runPlanImplementation } from "../plan-runner.js"
import {
  commitAdmittedRepositoryDiff,
  stageAdmittedRepositoryDiff,
} from "../repository-admission.js"
import type { StepCommandRequest, StepCommandResult } from "../step-checks.js"
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

async function waitForPath(path: string): Promise<void> {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    try {
      await access(path)
      return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
  }
  throw new Error(`Timed out waiting for ${path}.`)
}

afterEach(cleanupTestRepositories)

describe("runPlanImplementation stop paths", () => {
  it("stops an active coding helper before releasing runner admission", async () => {
    const planPath = await createPlan()
    const repoEduRoot = await createRepoEdu()
    const controller = new AbortController()
    const codingStarted = Promise.withResolvers<void>()
    const codingResult = Promise.withResolvers<CodingResult>()
    let codingAborted = false
    let childrenSettled = false
    let admissionReleased = false

    const run = runPlanImplementation(
      {
        repoEduRoot,
        planPath,
        run: { mode: "complete" },
        signal: controller.signal,
      },
      {
        coding: {
          async start() {
            await writeFile(join(repoEduRoot, "partial.txt"), "inspect me\n")
            codingStarted.resolve()
            return {
              events: (async function* () {})(),
              result: codingResult.promise,
              abort() {
                codingAborted = true
                codingResult.reject(
                  new DOMException("Coding was stopped.", "AbortError"),
                )
              },
            }
          },
        },
        commands: successfulCommands([]),
        ownedChildren: {
          async stopAndConfirm() {
            childrenSettled = true
          },
        },
        async claimAdmission() {
          return {
            status: "held" as const,
            release() {
              assert.equal(childrenSettled, true)
              admissionReleased = true
            },
          }
        },
      },
    )

    await codingStarted.promise
    controller.abort("Stop during implementation.")
    const result = await run

    assert.equal(result.outcome, "stopped")
    assert.equal(
      result.outcome === "stopped" ? result.reason : null,
      "Stop during implementation.",
    )
    assert.equal(codingAborted, true)
    assert.equal(childrenSettled, true)
    assert.equal(admissionReleased, true)
    assert.match(
      (await git(repoEduRoot, ["status", "--porcelain"])).stdout,
      /partial\.txt/,
    )
  })

  it("stops and confirms an active check before any later command", async () => {
    const planPath = await createPlan()
    const repoEduRoot = await createRepoEdu()
    const controller = new AbortController()
    const checkStarted = Promise.withResolvers<void>()
    const checkResult = Promise.withResolvers<StepCommandResult>()
    const commandCalls: StepCommandRequest[] = []

    const run = runPlanImplementation(
      {
        repoEduRoot,
        planPath,
        run: { mode: "complete" },
        signal: controller.signal,
      },
      {
        coding: codingAdapter(async () => {
          await writeFile(join(repoEduRoot, "step-1.txt"), "step 1\n")
          return succeededResult(1)
        }),
        commands: {
          async run(request) {
            commandCalls.push(request)
            checkStarted.resolve()
            return await checkResult.promise
          },
        },
        ownedChildren: {
          async stopAndConfirm() {
            checkResult.resolve({
              exitCode: null,
              signal: "SIGTERM",
              stdout: "",
              stderr: "",
            })
          },
        },
      },
    )

    await checkStarted.promise
    controller.abort("Stop during checks.")
    const result = await run

    assert.equal(result.outcome, "stopped")
    assert.equal(
      result.outcome === "stopped" ? result.reason : null,
      "Stop during checks.",
    )
    assert.deepEqual(
      commandCalls.map((command) => command.id),
      ["git-diff-check"],
    )
    assert.equal(
      (await git(repoEduRoot, ["log", "-1", "--format=%s"])).stdout.trim(),
      "initial",
    )
    assert.match(
      (await git(repoEduRoot, ["status", "--porcelain"])).stdout,
      /step-1\.txt/,
    )
    const events = (await readFile(result.transcriptPath, "utf8"))
      .trimEnd()
      .split("\n")
      .map((line) => JSON.parse(line) as PlanImplementationEvent)
    assert.equal(
      events.some((event) => event.kind === "stop-requested"),
      true,
    )
    assert.equal(
      events.some(
        (event) =>
          event.kind === "command-finished" && event.status === "stopped",
      ),
      true,
    )
    assert.equal(events.at(-1)?.kind, "run-finished")
  })

  it("stops during pre-commit admission and preserves the staged diff", async () => {
    const planPath = await createPlan()
    const repoEduRoot = await createRepoEdu()
    const controller = new AbortController()
    let commitStarted = false

    const result = await runPlanImplementation(
      {
        repoEduRoot,
        planPath,
        run: { mode: "complete" },
        signal: controller.signal,
      },
      {
        coding: codingAdapter(async () => {
          await writeFile(join(repoEduRoot, "step-1.txt"), "step 1\n")
          return succeededResult(1)
        }),
        commands: successfulCommands([]),
        ownedChildren: settledChildren,
        repositoryCommit: {
          async stage(admission, diff) {
            await stageAdmittedRepositoryDiff(admission, diff)
            controller.abort("Stop before Git commit.")
          },
          async commit() {
            commitStarted = true
            throw new Error("The commit must not start.")
          },
        },
      },
    )

    assert.equal(result.outcome, "stopped")
    assert.equal(commitStarted, false)
    assert.equal(
      (await git(repoEduRoot, ["log", "-1", "--format=%s"])).stdout.trim(),
      "initial",
    )
    assert.equal(
      (
        await git(repoEduRoot, ["diff", "--cached", "--name-only"])
      ).stdout.trim(),
      "step-1.txt",
    )
  })

  it("lets an in-flight Git commit settle and starts no later step", async () => {
    const planPath = await createPlan()
    const repoEduRoot = await createRepoEdu()
    const controller = new AbortController()
    const hookStartedPath = join(repoEduRoot, ".git", "hook-started")
    const hookReleasePath = join(repoEduRoot, ".git", "hook-release")
    const hookPath = join(repoEduRoot, ".git", "hooks", "pre-commit")
    const codingSteps: number[] = []
    let admissionReleased = false

    await writeFile(
      hookPath,
      `#!/usr/bin/env node
const { existsSync, writeFileSync } = require("node:fs")
writeFileSync(${JSON.stringify(hookStartedPath)}, "started")
const timer = setInterval(() => {
  if (existsSync(${JSON.stringify(hookReleasePath)})) {
    clearInterval(timer)
    process.exit(0)
  }
}, 10)
`,
    )
    await chmod(hookPath, 0o755)

    const run = runPlanImplementation(
      {
        repoEduRoot,
        planPath,
        run: { mode: "complete" },
        signal: controller.signal,
      },
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
        async claimAdmission() {
          return {
            status: "held" as const,
            release() {
              admissionReleased = true
            },
          }
        },
        repositoryCommit: {
          stage: stageAdmittedRepositoryDiff,
          commit: commitAdmittedRepositoryDiff,
        },
      },
    )

    await waitForPath(hookStartedPath)
    controller.abort("Stop during Git commit.")
    await new Promise((resolve) => setTimeout(resolve, 25))
    assert.equal(admissionReleased, false)
    await writeFile(hookReleasePath, "release\n")
    const result = await run

    assert.equal(result.outcome, "stopped")
    assert.equal(
      result.outcome === "stopped" ? result.reason : null,
      "Stop during Git commit.",
    )
    assert.deepEqual(codingSteps, [1])
    assert.match(
      (await git(repoEduRoot, ["log", "-1", "--format=%b"])).stdout,
      /Plan-Step: 1/,
    )
    assert.equal((await git(repoEduRoot, ["status", "--porcelain"])).stdout, "")
    assert.equal(admissionReleased, true)
  })
})

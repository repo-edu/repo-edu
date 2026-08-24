import assert from "node:assert/strict"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { afterEach, describe, it } from "node:test"
import type { CodingResult, PlanImplementationEvent } from "../contracts.js"
import { runPlanImplementation } from "../plan-runner.js"
import {
  commitAdmittedRepositoryDiff,
  commitPlanImplementationMarker,
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

afterEach(cleanupTestRepositories)

describe("runPlanImplementation stop paths", () => {
  it("stops an active Codex app-server before releasing runner admission", async () => {
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
          async start(_request, signal) {
            await writeFile(join(repoEduRoot, "partial.txt"), "inspect me\n")
            codingStarted.resolve()
            const abort = () => {
              codingAborted = true
              codingResult.reject(
                new DOMException("Coding was stopped.", "AbortError"),
              )
            }
            signal?.addEventListener("abort", abort, { once: true })
            if (signal?.aborted) abort()
            return {
              events: (async function* () {})(),
              result: codingResult.promise,
              abort,
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
            request.signal?.addEventListener(
              "abort",
              () => {
                checkResult.resolve({
                  exitCode: null,
                  signal: "SIGTERM",
                  stdout: "",
                  stderr: "",
                })
              },
              { once: true },
            )
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
          markImplemented: commitPlanImplementationMarker,
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
    const commitStarted = Promise.withResolvers<void>()
    const commitRelease = Promise.withResolvers<void>()
    const codingSteps: number[] = []
    let admissionReleased = false

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
          markImplemented: commitPlanImplementationMarker,
          async commit(admission, diff, source, step, proposal, stopSignal) {
            assert.equal(stopSignal?.aborted, false)
            commitStarted.resolve()
            await commitRelease.promise
            assert.equal(stopSignal?.aborted, true)
            // The barrier represents a commit that passed its one stop gate.
            // Its delayed Git work must therefore ignore the later signal.
            return await commitAdmittedRepositoryDiff(
              admission,
              diff,
              source,
              step,
              proposal,
            )
          },
        },
      },
    )

    await commitStarted.promise
    controller.abort("Stop during Git commit.")
    assert.equal(admissionReleased, false)
    commitRelease.resolve()
    const result = await run

    assert.equal(result.outcome, "stopped")
    assert.equal(
      result.outcome === "stopped" ? result.reason : null,
      "Stop during Git commit.",
    )
    assert.deepEqual(codingSteps, [1])
    assert.match(
      (await git(repoEduRoot, ["log", "-1", "--format=%s"])).stdout,
      /example\/step-1-A1:/,
    )
    assert.equal((await git(repoEduRoot, ["status", "--porcelain"])).stdout, "")
    assert.equal(admissionReleased, true)
  })
})

import assert from "node:assert/strict"
import { PassThrough } from "node:stream"
import { describe, it } from "node:test"
import type {
  ChildProcessLifetimeController,
  ChildProcessLifetimeLaunch,
  OwnedChildProcessTree,
} from "@repo-edu/host-node/child-process-lifetime"
import { createChildProcessLifetimeController } from "@repo-edu/host-node/child-process-lifetime"
import {
  createCodingAdapter,
  StepCodexSdkHostOutcomeUnknownError,
} from "../coding-adapter.js"
import type { CodingEvent, CodingResult } from "../contracts.js"
import { createStepCodexSdkHostCommand } from "../step-codex-sdk-host-command.js"
import type { StepCodexSdkHostProtocolFailure } from "../step-codex-sdk-host-protocol.js"
import {
  runStepCodexSdkHostServer,
  type StepCodexSdkHostRun,
} from "../step-codex-sdk-host-server.js"
import { testCodingRequest } from "./coding-test-plan.js"

type CodingReportedResult =
  | { readonly outcome: "completed"; readonly value: CodingResult }
  | {
      readonly message: string
      readonly outcome: "failed"
      readonly value: StepCodexSdkHostProtocolFailure
    }

type ReportedFact =
  | { readonly kind: "proof-lost"; readonly error: unknown }
  | { readonly kind: "result"; readonly result: CodingReportedResult }
  | { readonly kind: "work-started" }

function createControllerHarness(run: StepCodexSdkHostRun): {
  readonly controller: ChildProcessLifetimeController
  readonly facts: readonly ReportedFact[]
  readonly launches: readonly ChildProcessLifetimeLaunch[]
  readonly stopCount: () => number
} {
  const launches: ChildProcessLifetimeLaunch[] = []
  const facts: ReportedFact[] = []
  let stops = 0
  const controller: ChildProcessLifetimeController = {
    async launch<TCompleted, TFailed>(request: ChildProcessLifetimeLaunch) {
      launches.push(request)
      const hostToSdkHost = new PassThrough()
      const sdkHostToHost = new PassThrough()
      const stderr = new PassThrough()
      const server = runStepCodexSdkHostServer(hostToSdkHost, sdkHostToHost, {
        run,
      })
      const outcome = Promise.withResolvers<
        | { readonly outcome: "unknown" }
        | { readonly outcome: "cancelled" }
        | {
            readonly outcome: "completed"
            readonly targetResult: {
              readonly exitCode: 0
              readonly signal: null
            }
            readonly value: CodingResult
          }
        | {
            readonly outcome: "failed"
            readonly message: string
            readonly targetResult: {
              readonly exitCode: 0
              readonly signal: null
            }
            readonly value: StepCodexSdkHostProtocolFailure
          }
      >()
      let settled = false
      const finish = (reported: object): void => {
        if (settled) return
        settled = true
        stops += 1
        if (!hostToSdkHost.writableEnded) hostToSdkHost.end()
        void server.then(() => {
          stderr.end()
          outcome.resolve(reported as never)
        })
      }
      const owned: OwnedChildProcessTree<
        CodingResult,
        StepCodexSdkHostProtocolFailure
      > = {
        stdin: hostToSdkHost,
        stdout: sdkHostToHost,
        stderr,
        outcome: outcome.promise,
        requestCancellation() {
          finish({ outcome: "cancelled" })
        },
        reportFailure() {},
        reportProofLost(error) {
          facts.push({ error, kind: "proof-lost" })
          finish({ outcome: "unknown" })
        },
        reportResult(result) {
          facts.push({ kind: "result", result })
          finish({
            ...result,
            targetResult: { exitCode: 0, signal: null },
          })
        },
        reportWorkStarted() {
          facts.push({ kind: "work-started" })
        },
      }
      return owned as unknown as OwnedChildProcessTree<TCompleted, TFailed>
    },
    async stopAndConfirm() {},
  }
  return { controller, facts, launches, stopCount: () => stops }
}

async function collectEvents(events: AsyncIterable<CodingEvent>) {
  const collected: CodingEvent[] = []
  for await (const event of events) {
    collected.push(event)
  }
  return collected
}

describe("runner-owned plan-step Codex SDK host process", () => {
  it("runs the fixed plan-step Codex SDK host entry through the real platform adapter", {
    skip: process.platform !== "darwin" && process.platform !== "linux",
  }, async (context) => {
    const childProcessLifetimeController = createChildProcessLifetimeController(
      {
        diagnosticSink() {},
        onUnconfirmedTree(error): never {
          throw error
        },
      },
    )
    context.after(async () => {
      await childProcessLifetimeController.stopAndConfirm()
    })
    const run = await createCodingAdapter(childProcessLifetimeController).start(
      {
        ...testCodingRequest(3),
        repoEduRoot: process.cwd(),
      },
    )

    await assert.rejects(run.result, /does not contain implementation step 3/)
  })

  it("starts the fixed entry through the child-process lifetime controller", async () => {
    const harness = createControllerHarness(async ({ emit }) => {
      await emit({ kind: "thread-started", threadId: "fresh-thread" })
      await emit({ kind: "narrative", text: "Codex changed one file." })
      return {
        status: "succeeded",
        commit: {
          subject:
            "A1 redesign(plan-implementation): own plan-step Codex SDK host process",
          decisionBullets: ["The runner owns its coding request."],
        },
      }
    })
    const request = testCodingRequest()
    const run = await createCodingAdapter(harness.controller).start(request)
    const events = collectEvents(run.events)

    const result = await run.result
    assert.equal(result.status, "succeeded")
    assert.deepEqual(await events, [
      { kind: "thread-started", threadId: "fresh-thread" },
      { kind: "narrative", text: "Codex changed one file." },
    ])
    assert.equal(harness.launches.length, 1)
    assert.equal(harness.stopCount(), 1)
    assert.deepEqual(harness.facts, [
      { kind: "work-started" },
      { kind: "result", result: { outcome: "completed", value: result } },
    ])
    assert.deepEqual(harness.launches[0], {
      command: process.execPath,
      args: createStepCodexSdkHostCommand().arguments,
      cwd: request.repoEduRoot,
      env: { ...process.env },
      proof: "reported",
      shell: false,
    })
  })

  it("cancels the plan-step Codex SDK host request and confirms its owned tree", async () => {
    const started = Promise.withResolvers<void>()
    let observedAbort = false
    const harness = createControllerHarness(async ({ signal }) => {
      started.resolve()
      await new Promise<void>((resolve) => {
        signal.addEventListener(
          "abort",
          () => {
            observedAbort = true
            resolve()
          },
          { once: true },
        )
      })
      throw new DOMException("cancelled", "AbortError")
    })
    const controller = new AbortController()
    const run = await createCodingAdapter(harness.controller).start(
      testCodingRequest(),
      controller.signal,
    )

    await started.promise
    controller.abort()

    await assert.rejects(
      run.result,
      (error: unknown) =>
        error instanceof DOMException && error.name === "AbortError",
    )
    assert.equal(observedAbort, true)
    assert.equal(harness.stopCount(), 1)
    assert.equal(harness.launches[0]?.signal, controller.signal)
  })

  it("reports plan-step Codex SDK host loss before a result as unknown", async () => {
    const facts: ReportedFact[] = []
    const controller: ChildProcessLifetimeController = {
      async launch<TCompleted, TFailed>(_request: ChildProcessLifetimeLaunch) {
        const stdin = new PassThrough()
        const stdout = new PassThrough()
        const stderr = new PassThrough()
        const outcome = Promise.withResolvers<
          { readonly outcome: "unknown" } | { readonly outcome: "cancelled" }
        >()
        setImmediate(() => {
          stderr.end("Error: the Codex SDK could not start\n  at start\n")
          stdout.end()
          outcome.resolve({ outcome: "unknown" })
        })
        const owned = {
          stdin,
          stdout,
          stderr,
          outcome: outcome.promise,
          requestCancellation() {
            outcome.resolve({ outcome: "cancelled" })
          },
          reportFailure() {},
          reportProofLost(error: unknown) {
            facts.push({ error, kind: "proof-lost" })
            outcome.resolve({ outcome: "unknown" })
          },
          reportResult() {},
          reportWorkStarted() {
            facts.push({ kind: "work-started" })
          },
        }
        return owned as unknown as OwnedChildProcessTree<TCompleted, TFailed>
      },
      async stopAndConfirm() {},
    }
    const run = await createCodingAdapter(controller).start(testCodingRequest())

    await assert.rejects(
      run.result,
      (error: unknown) =>
        error instanceof StepCodexSdkHostOutcomeUnknownError &&
        error.message.includes(
          "Error: the Codex SDK could not start\n  at start",
        ),
    )
    assert.equal(facts[0]?.kind, "work-started")
    assert.equal(facts[1]?.kind, "proof-lost")
  })
})

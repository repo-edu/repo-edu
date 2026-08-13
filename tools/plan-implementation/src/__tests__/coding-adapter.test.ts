import assert from "node:assert/strict"
import { PassThrough } from "node:stream"
import { describe, it } from "node:test"
import type {
  ChildProcessLifetimeAdapter,
  ChildProcessLifetimeLaunch,
  OwnedChildProcess,
} from "@repo-edu/host-node/child-process-lifetime"
import { createChildProcessLifetimeAdapter } from "@repo-edu/host-node/child-process-lifetime"
import {
  CodingHelperOutcomeUnknownError,
  createCodingAdapter,
} from "../coding-adapter.js"
import { createCodingHelperCommand } from "../coding-helper-command.js"
import {
  type CodingHelperRun,
  runCodingHelperServer,
} from "../coding-helper-server.js"
import type { CodingEvent } from "../contracts.js"
import { testCodingRequest } from "./coding-test-plan.js"

function createLifetimeHarness(run: CodingHelperRun): {
  readonly adapter: ChildProcessLifetimeAdapter
  readonly launches: readonly ChildProcessLifetimeLaunch[]
  readonly stopCount: () => number
} {
  const launches: ChildProcessLifetimeLaunch[] = []
  let stops = 0
  const adapter: ChildProcessLifetimeAdapter = {
    async launch(request) {
      launches.push(request)
      const hostToHelper = new PassThrough()
      const helperToHost = new PassThrough()
      const stderr = new PassThrough()
      const server = runCodingHelperServer(hostToHelper, helperToHost, { run })
      const owned: OwnedChildProcess = {
        route: request.route,
        stdin: hostToHelper,
        stdout: helperToHost,
        stderr,
        result: server.then(() => ({ exitCode: 0, signal: null })),
        requestStop() {
          if (!hostToHelper.writableEnded) hostToHelper.end()
        },
        async stopAndConfirm() {
          stops += 1
          if (!hostToHelper.writableEnded) hostToHelper.end()
          await server
        },
      }
      return owned
    },
    async stopAndConfirm() {},
  }
  return { adapter, launches, stopCount: () => stops }
}

async function collectEvents(events: AsyncIterable<CodingEvent>) {
  const collected: CodingEvent[] = []
  for await (const event of events) {
    collected.push(event)
  }
  return collected
}

describe("runner-owned coding helper", () => {
  it("runs the fixed helper entry through the real shared adapter", {
    skip: process.platform !== "darwin" && process.platform !== "linux",
  }, async (context) => {
    const childLifetime = createChildProcessLifetimeAdapter()
    context.after(async () => {
      await childLifetime.stopAndConfirm()
    })
    const run = await createCodingAdapter(childLifetime).start({
      ...testCodingRequest(3),
      repoEduRoot: process.cwd(),
    })

    await assert.rejects(run.result, /does not contain implementation step 3/)
  })

  it("starts the fixed entry through the managed child-lifetime route", async () => {
    const harness = createLifetimeHarness(async ({ emit }) => {
      await emit({ kind: "thread-started", threadId: "fresh-thread" })
      await emit({ kind: "activity", label: "Codex changed one file." })
      return {
        status: "succeeded",
        commit: {
          subject: "A1 redesign(plan-implementation): own coding helper",
          decisionBullets: ["The runner owns its coding request."],
        },
      }
    })
    const request = testCodingRequest()
    const run = await createCodingAdapter(harness.adapter).start(request)
    const events = collectEvents(run.events)

    assert.equal((await run.result).status, "succeeded")
    assert.deepEqual(await events, [
      { kind: "thread-started", threadId: "fresh-thread" },
      { kind: "activity", label: "Codex changed one file." },
    ])
    assert.equal(harness.launches.length, 1)
    assert.deepEqual(harness.launches[0], {
      command: process.execPath,
      args: createCodingHelperCommand().arguments,
      cwd: request.repoEduRoot,
      env: { ...process.env },
      route: "managed-helper",
      shell: false,
    })
  })

  it("cancels the helper request and confirms its owned process tree", async () => {
    const started = Promise.withResolvers<void>()
    let observedAbort = false
    const harness = createLifetimeHarness(async ({ signal }) => {
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
    const run = await createCodingAdapter(harness.adapter).start(
      testCodingRequest(),
    )

    await started.promise
    run.abort()

    await assert.rejects(
      run.result,
      (error: unknown) =>
        error instanceof DOMException && error.name === "AbortError",
    )
    assert.equal(observedAbort, true)
    assert.equal(harness.stopCount(), 1)
  })

  it("reports helper loss before a result as an unknown outcome", async () => {
    const adapter: ChildProcessLifetimeAdapter = {
      async launch(request) {
        const stdin = new PassThrough()
        const stdout = new PassThrough()
        const stderr = new PassThrough()
        const result = new Promise<{ exitCode: number; signal: null }>(
          (resolve) => {
            stdin.once("data", () => {
              setImmediate(() => {
                stdout.end()
                resolve({ exitCode: 1, signal: null })
              })
            })
          },
        )
        return {
          route: request.route,
          stdin,
          stdout,
          stderr,
          result,
          requestStop() {},
          async stopAndConfirm() {
            if (!stdin.writableEnded) stdin.end()
            await result
          },
        }
      },
      async stopAndConfirm() {},
    }
    const run = await createCodingAdapter(adapter).start(testCodingRequest())

    await assert.rejects(
      run.result,
      (error: unknown) => error instanceof CodingHelperOutcomeUnknownError,
    )
  })
})

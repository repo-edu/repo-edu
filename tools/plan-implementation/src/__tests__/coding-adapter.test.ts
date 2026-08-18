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

function createControllerHarness(run: CodingHelperRun): {
  readonly controller: ChildProcessLifetimeController
  readonly launches: readonly ChildProcessLifetimeLaunch[]
  readonly stopCount: () => number
} {
  const launches: ChildProcessLifetimeLaunch[] = []
  let stops = 0
  const controller: ChildProcessLifetimeController = {
    async launch(request) {
      launches.push(request)
      const hostToHelper = new PassThrough()
      const helperToHost = new PassThrough()
      const stderr = new PassThrough()
      const server = runCodingHelperServer(hostToHelper, helperToHost, { run })
      const owned: OwnedChildProcessTree = {
        stdin: hostToHelper,
        stdout: helperToHost,
        stderr,
        result: server.then(() => ({ exitCode: 0, signal: null })),
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
  return { controller, launches, stopCount: () => stops }
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
    const childProcessLifetimeController =
      createChildProcessLifetimeController()
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

  it("starts the fixed entry through the managed child-lifetime route", async () => {
    const harness = createControllerHarness(async ({ emit }) => {
      await emit({ kind: "thread-started", threadId: "fresh-thread" })
      await emit({ kind: "narrative", text: "Codex changed one file." })
      return {
        status: "succeeded",
        commit: {
          subject: "A1 redesign(plan-implementation): own coding helper",
          decisionBullets: ["The runner owns its coding request."],
        },
      }
    })
    const request = testCodingRequest()
    const run = await createCodingAdapter(harness.controller).start(request)
    const events = collectEvents(run.events)

    assert.equal((await run.result).status, "succeeded")
    assert.deepEqual(await events, [
      { kind: "thread-started", threadId: "fresh-thread" },
      { kind: "narrative", text: "Codex changed one file." },
    ])
    assert.equal(harness.launches.length, 1)
    assert.equal(harness.stopCount(), 1)
    assert.deepEqual(harness.launches[0], {
      command: process.execPath,
      args: createCodingHelperCommand().arguments,
      cwd: request.repoEduRoot,
      env: { ...process.env },
      shell: false,
    })
  })

  it("starts bounded stop after a known result before waiting for process completion", {
    timeout: 1_000,
  }, async () => {
    let stops = 0
    const controller: ChildProcessLifetimeController = {
      async launch(_request) {
        const hostToHelper = new PassThrough()
        const helperToHost = new PassThrough()
        const stderr = new PassThrough()
        const server = runCodingHelperServer(hostToHelper, helperToHost, {
          run: async () => ({
            status: "succeeded",
            commit: {
              subject: "A1 redesign(plan-implementation): own helper shutdown",
              decisionBullets: ["The adapter owns helper shutdown."],
            },
          }),
        })
        const terminal = Promise.withResolvers<{
          exitCode: number
          signal: null
        }>()
        return {
          stdin: hostToHelper,
          stdout: helperToHost,
          stderr,
          result: terminal.promise,
          async stopAndConfirm() {
            stops += 1
            if (!hostToHelper.writableEnded) hostToHelper.end()
            await server
            terminal.resolve({ exitCode: 0, signal: null })
          },
        }
      },
      async stopAndConfirm() {},
    }
    const run = await createCodingAdapter(controller).start(testCodingRequest())

    assert.equal((await run.result).status, "succeeded")
    assert.equal(stops, 1)
  })

  it("cancels the helper request and confirms its owned process tree", async () => {
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

  it("reports helper loss before a result as an unknown outcome", async () => {
    const controller: ChildProcessLifetimeController = {
      async launch(_request) {
        const stdin = new PassThrough()
        const stdout = new PassThrough()
        const stderr = new PassThrough()
        const result = new Promise<{ exitCode: number; signal: null }>(
          (resolve) => {
            stdin.once("data", () => {
              stderr.end("Error: the Codex SDK could not start\n  at start\n")
              setImmediate(() => {
                stdout.end()
                resolve({ exitCode: 1, signal: null })
              })
            })
          },
        )
        return {
          stdin,
          stdout,
          stderr,
          result,
          async stopAndConfirm() {
            if (!stdin.writableEnded) stdin.end()
            await result
          },
        }
      },
      async stopAndConfirm() {},
    }
    const run = await createCodingAdapter(controller).start(testCodingRequest())

    await assert.rejects(
      run.result,
      (error: unknown) =>
        error instanceof CodingHelperOutcomeUnknownError &&
        error.message.includes(
          "Error: the Codex SDK could not start\n  at start",
        ),
    )
  })
})

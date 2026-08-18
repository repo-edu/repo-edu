import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { createDesktopShutdown } from "../shutdown"

function quitEvent(): {
  readonly event: { preventDefault(): void }
  readonly prevented: () => boolean
} {
  let prevented = false
  return {
    event: {
      preventDefault() {
        prevented = true
      },
    },
    prevented: () => prevented,
  }
}

async function nextTurn(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve))
}

describe("desktop shutdown", () => {
  it("waits for workflows and child processes before quitting", async () => {
    const workflowWait = Promise.withResolvers<void>()
    const childStop = Promise.withResolvers<void>()
    const calls: string[] = []
    let liveWindow = true
    const shutdown = createDesktopShutdown({
      abortWorkflows() {
        calls.push("abort workflows")
      },
      beginWindowClose() {
        calls.push("begin window close")
        return liveWindow
      },
      closeArchive() {
        calls.push("close archive")
      },
      fail(error) {
        assert.fail(error)
      },
      quit() {
        calls.push("quit")
      },
      stopAndConfirmChildProcesses() {
        calls.push("stop child processes")
        return childStop.promise
      },
      waitForWorkflows() {
        calls.push("wait for workflows")
        return workflowWait.promise
      },
    })

    const windowClose = quitEvent()
    shutdown.beforeQuit(windowClose.event)
    assert.equal(windowClose.prevented(), true)
    assert.deepEqual(calls, ["begin window close"])

    liveWindow = false
    const drain = quitEvent()
    shutdown.beforeQuit(drain.event)
    assert.equal(drain.prevented(), true)
    assert.deepEqual(calls, [
      "begin window close",
      "begin window close",
      "abort workflows",
      "wait for workflows",
    ])

    workflowWait.resolve()
    await nextTurn()
    assert.deepEqual(calls, [
      "begin window close",
      "begin window close",
      "abort workflows",
      "wait for workflows",
      "close archive",
      "stop child processes",
    ])

    const repeated = quitEvent()
    shutdown.beforeQuit(repeated.event)
    assert.equal(repeated.prevented(), true)
    assert.equal(calls.includes("quit"), false)

    childStop.resolve()
    await nextTurn()
    assert.equal(calls.at(-1), "quit")
  })

  it("uses the fatal path when child-process confirmation fails", async () => {
    const failure = new Error("child process still running")
    const failures: unknown[] = []
    let quitCalled = false
    const shutdown = createDesktopShutdown({
      abortWorkflows() {},
      beginWindowClose: () => false,
      closeArchive() {},
      fail(error) {
        failures.push(error)
      },
      quit() {
        quitCalled = true
      },
      async stopAndConfirmChildProcesses() {
        throw failure
      },
      async waitForWorkflows() {},
    })

    shutdown.beforeQuit(quitEvent().event)
    await nextTurn()

    assert.deepEqual(failures, [failure])
    assert.equal(quitCalled, false)
  })
})

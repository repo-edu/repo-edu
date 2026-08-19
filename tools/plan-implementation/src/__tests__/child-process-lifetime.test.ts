import assert from "node:assert/strict"
import { PassThrough } from "node:stream"
import { describe, it } from "node:test"
import {
  type ChildProcessLifetimePlatformAdapter,
  ChildProcessTreeUnconfirmedError,
  childProcessUnconfirmedTreeMessage,
} from "@repo-edu/host-node/child-process-lifetime"
import { createPlanImplementationChildProcessLifetimeController } from "../child-process-lifetime.js"

function platformAdapter(
  ...confirmationFailures: Array<Error | undefined>
): ChildProcessLifetimePlatformAdapter {
  let launchCount = 0
  return {
    async launch() {
      const confirmationFailure = confirmationFailures[launchCount]
      launchCount += 1
      const stdin = new PassThrough()
      const stdout = new PassThrough()
      const stderr = new PassThrough()
      const result = Promise.withResolvers<{
        readonly exitCode: number
        readonly signal: null
      }>()
      return {
        stdin,
        stdout,
        stderr,
        result: result.promise,
        async stopAndConfirm() {
          stdin.end()
          stdout.end()
          stderr.end()
          if (confirmationFailure !== undefined) {
            throw confirmationFailure
          }
          result.resolve({ exitCode: 0, signal: null })
        },
      }
    },
  }
}

function createHostController(
  adapter: ChildProcessLifetimePlatformAdapter,
  output: string[],
) {
  return createPlanImplementationChildProcessLifetimeController({
    runtimePlatform: "win32",
    windowsAdapter: adapter,
    writeStderr: (message) => output.push(message),
  })
}

describe("plan implementation child-process controller", () => {
  it("writes secondary failures through the runner error sink", async () => {
    const output: string[] = []
    const controller = createHostController(platformAdapter(), output)
    const tree = await controller.launch<string, string>({
      command: "codex-sdk-host",
      proof: "reported",
    })

    tree.reportWorkStarted()
    tree.reportFailure(new Error("error output failed"))
    tree.reportResult({ outcome: "completed", value: "done" })

    assert.equal((await tree.outcome).outcome, "completed")
    assert.deepEqual(output, [
      "implement-plan: child-process-secondary-failure codex-sdk-host: error output failed\n",
    ])
  })

  it("prints one warning, returns unknown and keeps the session alive", async () => {
    const output: string[] = []
    const failure = new ChildProcessTreeUnconfirmedError("tree still running")
    const controller = createHostController(
      platformAdapter(failure, undefined),
      output,
    )
    const tree = await controller.launch<string, string>({
      command: "codex-sdk-host",
      proof: "reported",
    })

    tree.reportWorkStarted()
    tree.reportResult({ outcome: "completed", value: "done" })

    assert.deepEqual(await tree.outcome, { outcome: "unknown" })
    const laterTree = await controller.launch<string, string>({
      command: "codex-sdk-host",
      proof: "reported",
    })
    laterTree.reportWorkStarted()
    laterTree.reportResult({ outcome: "completed", value: "later" })
    assert.equal((await laterTree.outcome).outcome, "completed")
    await controller.stopAndConfirm()

    assert.deepEqual(output, [
      "implement-plan: child-process-secondary-failure codex-sdk-host: tree still running\n",
      `${childProcessUnconfirmedTreeMessage}\n`,
    ])
  })
})

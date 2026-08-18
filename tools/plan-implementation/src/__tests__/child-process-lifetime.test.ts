import assert from "node:assert/strict"
import { PassThrough } from "node:stream"
import { describe, it } from "node:test"
import {
  type ChildProcessLifetimePlatformAdapter,
  ChildProcessTreeUnconfirmedError,
  childProcessUnconfirmedTreeMessage,
} from "@repo-edu/host-node/child-process-lifetime"
import { createPlanImplementationChildProcessLifetimeController } from "../child-process-lifetime.js"

class HostExit extends Error {
  constructor(readonly code: number) {
    super(`host exited with ${code}`)
  }
}

function platformAdapter(
  confirmationFailure?: Error,
): ChildProcessLifetimePlatformAdapter {
  return {
    async launch() {
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
    exit(code): never {
      throw new HostExit(code)
    },
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

  it("prints the fatal user message and exits without a run outcome", async () => {
    const output: string[] = []
    const controller = createHostController(
      platformAdapter(
        new ChildProcessTreeUnconfirmedError("tree still running"),
      ),
      output,
    )
    const tree = await controller.launch<string, string>({
      command: "codex-sdk-host",
      proof: "reported",
    })

    tree.reportWorkStarted()
    tree.reportResult({ outcome: "completed", value: "done" })

    await assert.rejects(
      tree.outcome,
      (error: unknown) => error instanceof HostExit && error.code === 1,
    )
    assert.deepEqual(output, [`${childProcessUnconfirmedTreeMessage}\n`])
  })
})

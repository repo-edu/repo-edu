import assert from "node:assert/strict"
import { PassThrough } from "node:stream"
import { describe, it } from "node:test"
import {
  type ChildProcessLifetimePlatformAdapter,
  ChildProcessTreeUnconfirmedError,
  childProcessUnconfirmedTreeMessage,
} from "@repo-edu/host-node/child-process-lifetime"
import { createDesktopChildProcessLifetimeController } from "../child-process-lifetime"

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
  errorBoxes: Array<{ readonly message: string; readonly title: string }>,
) {
  return createDesktopChildProcessLifetimeController({
    appName: "Repo Edu",
    exit(code): never {
      throw new HostExit(code)
    },
    runtimePlatform: "win32",
    showErrorBox(title, message) {
      errorBoxes.push({ message, title })
    },
    windowsAdapter: adapter,
    writeStderr: (message) => output.push(message),
  })
}

describe("desktop child-process controller", () => {
  it("writes secondary failures through the desktop error sink", async () => {
    const output: string[] = []
    const errorBoxes: Array<{
      readonly message: string
      readonly title: string
    }> = []
    const controller = createHostController(
      platformAdapter(),
      output,
      errorBoxes,
    )
    const tree = await controller.launch<string, string>({
      command: "claude",
      proof: "reported",
    })

    tree.reportWorkStarted()
    tree.reportFailure(new Error("error output failed"))
    tree.reportResult({ outcome: "completed", value: "done" })

    assert.equal((await tree.outcome).outcome, "completed")
    assert.equal(output.length, 1)
    assert.match(
      output[0] ?? "",
      /^\[desktop\] child-process-secondary-failure claude Error: error output failed/m,
    )
    assert.deepEqual(errorBoxes, [])
  })

  it("shows the fatal user message and exits without a run outcome", async () => {
    const output: string[] = []
    const errorBoxes: Array<{
      readonly message: string
      readonly title: string
    }> = []
    const controller = createHostController(
      platformAdapter(
        new ChildProcessTreeUnconfirmedError("tree still running"),
      ),
      output,
      errorBoxes,
    )
    const tree = await controller.launch<string, string>({
      command: "claude",
      proof: "reported",
    })

    tree.reportWorkStarted()
    tree.reportResult({ outcome: "completed", value: "done" })

    await assert.rejects(
      tree.outcome,
      (error: unknown) => error instanceof HostExit && error.code === 1,
    )
    assert.deepEqual(errorBoxes, [
      {
        message: childProcessUnconfirmedTreeMessage,
        title: "Repo Edu must close",
      },
    ])
    assert.deepEqual(output, [])
  })
})

import assert from "node:assert/strict"
import { PassThrough } from "node:stream"
import { describe, it } from "node:test"
import {
  type ChildProcessLifetimePlatformAdapter,
  ChildProcessTreeUnconfirmedError,
  childProcessUnconfirmedTreeMessage,
} from "@repo-edu/host-node/child-process-lifetime"
import { createDesktopChildProcessLifetimeController } from "../child-process-lifetime"

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
          return { outcome: "confirmed" }
        },
      }
    },
  }
}

function createHostController(
  adapter: ChildProcessLifetimePlatformAdapter,
  output: string[],
  warnings: Array<{ readonly message: string; readonly title: string }>,
) {
  return createDesktopChildProcessLifetimeController({
    appName: "Repo Edu",
    runtimePlatform: "win32",
    showWarning(title, message) {
      warnings.push({ message, title })
    },
    windowsAdapter: adapter,
    writeStderr: (message) => output.push(message),
  })
}

describe("desktop child-process controller", () => {
  it("writes secondary failures through the desktop error sink", async () => {
    const output: string[] = []
    const warnings: Array<{
      readonly message: string
      readonly title: string
    }> = []
    const controller = createHostController(platformAdapter(), output, warnings)
    const tree = await controller.launch<string, string>({
      command: "claude",
      proof: "reported",
    })

    tree.reportFailure(new Error("error output failed"))
    tree.reportResult({ outcome: "completed", value: "done" })

    assert.equal((await tree.outcome).outcome, "completed")
    assert.equal(output.length, 1)
    assert.match(
      output[0] ?? "",
      /^\[desktop\] child-process-secondary-failure claude Error: error output failed/m,
    )
    assert.deepEqual(warnings, [])
  })

  it("shows one warning, returns unknown and keeps the session alive", async () => {
    const output: string[] = []
    const warnings: Array<{
      readonly message: string
      readonly title: string
    }> = []
    const failure = new ChildProcessTreeUnconfirmedError("tree still running")
    const controller = createHostController(
      platformAdapter(failure, undefined),
      output,
      warnings,
    )
    const tree = await controller.launch<string, string>({
      command: "claude",
      proof: "reported",
    })

    tree.reportResult({ outcome: "completed", value: "done" })

    assert.deepEqual(await tree.outcome, { outcome: "unknown" })
    const laterTree = await controller.launch<string, string>({
      command: "claude",
      proof: "reported",
    })
    laterTree.reportResult({ outcome: "completed", value: "later" })
    assert.equal((await laterTree.outcome).outcome, "completed")
    await controller.stopAndConfirm()

    assert.deepEqual(warnings, [
      {
        message: childProcessUnconfirmedTreeMessage,
        title: "Repo Edu warning",
      },
    ])
    assert.equal(output.length, 1)
    assert.match(output[0] ?? "", /tree still running/)
  })
})

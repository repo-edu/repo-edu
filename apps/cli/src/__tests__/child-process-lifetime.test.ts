import assert from "node:assert/strict"
import { PassThrough } from "node:stream"
import { describe, it } from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"
import {
  type ChildProcessLifetimePlatformAdapter,
  ChildProcessTreeUnconfirmedError,
  childProcessUnconfirmedTreeMessage,
} from "@repo-edu/host-node/child-process-lifetime"
import { createCommandLineChildProcessLifetimeController } from "../child-process-lifetime.js"

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

function windowsModule(adapter: ChildProcessLifetimePlatformAdapter) {
  return {
    createWindowsChildProcessLifetimeAdapter() {
      return adapter
    },
    resolveWindowsChildProcessLifetimeLauncherEntryUrl() {
      return pathToFileURL("/host-node/windows-launcher.cjs")
    },
  }
}

const unusedWindowsAdapter: ChildProcessLifetimePlatformAdapter = {
  async launch() {
    throw new Error("The test Windows adapter must not launch a target.")
  },
}

const unusedWindowsModule = {
  createWindowsChildProcessLifetimeAdapter() {
    return unusedWindowsAdapter
  },
  resolveWindowsChildProcessLifetimeLauncherEntryUrl() {
    throw new Error("The test Windows module must not resolve its launcher.")
  },
}

describe("command-line child-process controller", () => {
  it("keeps the Windows module unloaded on macOS and Linux", async () => {
    let windowsModuleLoaded = false

    const controller = await createCommandLineChildProcessLifetimeController({
      runtimePlatform: "linux",
      async loadWindowsAdapterModule() {
        windowsModuleLoaded = true
        return unusedWindowsModule
      },
    })

    assert.equal(windowsModuleLoaded, false)
    await controller.stopAndConfirm()
  })

  it("builds the Windows adapter from the fixed launcher entry", async () => {
    const runtimes: {
      executablePath: string
      launcherEntryPath: string
      runAsNode: boolean
    }[] = []
    const executablePath = "C:\\Program Files\\nodejs\\node.exe"
    const launcherEntryUrl = pathToFileURL("/host-node/windows-launcher.cjs")

    const controller = await createCommandLineChildProcessLifetimeController({
      executablePath,
      runtimePlatform: "win32",
      async loadWindowsAdapterModule() {
        return {
          createWindowsChildProcessLifetimeAdapter(runtime) {
            runtimes.push(runtime)
            return unusedWindowsAdapter
          },
          resolveWindowsChildProcessLifetimeLauncherEntryUrl() {
            return launcherEntryUrl
          },
        }
      },
    })

    assert.deepEqual(runtimes, [
      {
        executablePath,
        launcherEntryPath: fileURLToPath(launcherEntryUrl),
        runAsNode: false,
      },
    ])
    await controller.stopAndConfirm()
  })

  it("accepts an explicit fixed launcher entry", async () => {
    const launcherEntryUrl = pathToFileURL("/fixed/windows-launcher.cjs")
    let launcherEntryPath = ""

    await createCommandLineChildProcessLifetimeController({
      launcherEntryUrl,
      runtimePlatform: "win32",
      async loadWindowsAdapterModule() {
        return {
          createWindowsChildProcessLifetimeAdapter(runtime) {
            launcherEntryPath = runtime.launcherEntryPath
            return unusedWindowsAdapter
          },
          resolveWindowsChildProcessLifetimeLauncherEntryUrl() {
            throw new Error("An explicit launcher entry must win.")
          },
        }
      },
    })

    assert.equal(launcherEntryPath, fileURLToPath(launcherEntryUrl))
  })

  it("writes secondary failures through the command-line error sink", async () => {
    const output: string[] = []
    const controller = await createCommandLineChildProcessLifetimeController({
      runtimePlatform: "win32",
      writeStderr: (message) => output.push(message),
      async loadWindowsAdapterModule() {
        return windowsModule(platformAdapter())
      },
    })
    const tree = await controller.launch<string, string>({
      command: "git",
      proof: "reported",
    })

    tree.reportWorkStarted()
    tree.reportFailure(new Error("error output failed"))
    tree.reportResult({ outcome: "completed", value: "done" })

    assert.deepEqual(await tree.outcome, {
      outcome: "completed",
      targetResult: { exitCode: 0, signal: null },
      value: "done",
    })
    assert.deepEqual(output, [
      "Child-process secondary failure for git: error output failed\n",
    ])
  })

  it("prints one warning, returns unknown and keeps the session alive", async () => {
    const output: string[] = []
    const failure = new ChildProcessTreeUnconfirmedError("tree still running")
    const controller = await createCommandLineChildProcessLifetimeController({
      runtimePlatform: "win32",
      writeStderr: (message) => output.push(message),
      async loadWindowsAdapterModule() {
        return windowsModule(platformAdapter(failure, undefined))
      },
    })
    const tree = await controller.launch<string, string>({
      command: "git",
      proof: "reported",
    })

    tree.reportWorkStarted()
    tree.reportResult({ outcome: "completed", value: "done" })

    assert.deepEqual(await tree.outcome, { outcome: "unknown" })
    const laterTree = await controller.launch<string, string>({
      command: "git",
      proof: "reported",
    })
    laterTree.reportWorkStarted()
    laterTree.reportResult({ outcome: "completed", value: "later" })
    assert.equal((await laterTree.outcome).outcome, "completed")
    await controller.stopAndConfirm()

    assert.deepEqual(output, [
      "Child-process secondary failure for git: tree still running\n",
      `${childProcessUnconfirmedTreeMessage}\n`,
    ])
  })
})

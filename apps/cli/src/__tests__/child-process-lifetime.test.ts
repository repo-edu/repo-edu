import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"
import type { ChildProcessLifetimePlatformAdapter } from "@repo-edu/host-node/child-process-lifetime"
import { createCommandLineChildProcessLifetimeController } from "../child-process-lifetime.js"

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
})

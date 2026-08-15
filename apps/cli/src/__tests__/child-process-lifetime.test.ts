import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"
import type { ChildProcessLifetimePlatform } from "@repo-edu/host-node/child-process-lifetime"
import { createCommandLineChildProcessLifetimeAdapter } from "../child-process-lifetime.js"

const unusedWindowsPlatform: ChildProcessLifetimePlatform = {
  async launch() {
    throw new Error("The test Windows platform must not launch a target.")
  },
}

const unusedWindowsModule = {
  createWindowsChildProcessLifetimePlatform() {
    return unusedWindowsPlatform
  },
  resolveWindowsChildLifetimeLauncherEntryUrl() {
    throw new Error("The test Windows module must not resolve its launcher.")
  },
}

describe("command-line child-process lifetime", () => {
  it("keeps the Windows module unloaded on macOS and Linux", async () => {
    let windowsModuleLoaded = false

    const adapter = await createCommandLineChildProcessLifetimeAdapter({
      runtimePlatform: "linux",
      async loadWindowsPlatform() {
        windowsModuleLoaded = true
        return unusedWindowsModule
      },
    })

    assert.equal(windowsModuleLoaded, false)
    await adapter.stopAndConfirm()
  })

  it("builds the Windows platform from the fixed launcher entry", async () => {
    const runtimes: {
      executablePath: string
      launcherEntryPath: string
      runAsNode: boolean
    }[] = []
    const executablePath = "C:\\Program Files\\nodejs\\node.exe"
    const launcherEntryUrl = pathToFileURL("/host-node/windows-launcher.cjs")

    const adapter = await createCommandLineChildProcessLifetimeAdapter({
      executablePath,
      runtimePlatform: "win32",
      async loadWindowsPlatform() {
        return {
          createWindowsChildProcessLifetimePlatform(runtime) {
            runtimes.push(runtime)
            return unusedWindowsPlatform
          },
          resolveWindowsChildLifetimeLauncherEntryUrl() {
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
    await adapter.stopAndConfirm()
  })

  it("accepts an explicit fixed launcher entry", async () => {
    const launcherEntryUrl = pathToFileURL("/fixed/windows-launcher.cjs")
    let launcherEntryPath = ""

    await createCommandLineChildProcessLifetimeAdapter({
      launcherEntryUrl,
      runtimePlatform: "win32",
      async loadWindowsPlatform() {
        return {
          createWindowsChildProcessLifetimePlatform(runtime) {
            launcherEntryPath = runtime.launcherEntryPath
            return unusedWindowsPlatform
          },
          resolveWindowsChildLifetimeLauncherEntryUrl() {
            throw new Error("An explicit launcher entry must win.")
          },
        }
      },
    })

    assert.equal(launcherEntryPath, fileURLToPath(launcherEntryUrl))
  })
})

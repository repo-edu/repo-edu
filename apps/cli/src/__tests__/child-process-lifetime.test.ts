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

describe("command-line child-process lifetime", () => {
  it("keeps the Windows module unloaded on macOS and Linux", async () => {
    let windowsModuleLoaded = false

    const adapter = await createCommandLineChildProcessLifetimeAdapter({
      runtimePlatform: "linux",
      async loadWindowsPlatform() {
        windowsModuleLoaded = true
        return unusedWindowsPlatform
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

    const adapter = await createCommandLineChildProcessLifetimeAdapter({
      executablePath,
      runtimePlatform: "win32",
      async loadWindowsPlatform(runtime) {
        runtimes.push(runtime)
        return unusedWindowsPlatform
      },
    })

    assert.deepEqual(runtimes, [
      {
        executablePath,
        launcherEntryPath: fileURLToPath(
          new URL(
            "../../../desktop/resources/host-child-lifetime/windows-launcher.cjs",
            import.meta.url,
          ),
        ),
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
      async loadWindowsPlatform(runtime) {
        launcherEntryPath = runtime.launcherEntryPath
        return unusedWindowsPlatform
      },
    })

    assert.equal(launcherEntryPath, fileURLToPath(launcherEntryUrl))
  })
})

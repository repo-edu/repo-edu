import assert from "node:assert/strict"
import { join } from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import { runWindowsChildLifetimeTarget } from "@repo-edu/host-node/windows-child-lifetime"
import { resolvePackagedWindowsChildLifetimeRuntime } from "../child-lifetime-artifact-probe.js"

const launcherEntryPath = fileURLToPath(
  new URL(
    "../../resources/host-child-lifetime/windows-launcher.cjs",
    import.meta.url,
  ),
)
const targetScript = [
  "process.stdin.setEncoding('utf8')",
  "let input = ''",
  "process.stdin.on('data', (chunk) => { input += chunk })",
  "process.stdin.on('end', () => { process.stdout.write(input.toUpperCase()) })",
].join("; ")

describe("packaged Windows child-lifetime runtime", () => {
  it("keeps the Electron executable and launcher entry host-owned", () => {
    const resourcesPath = join("root", "resources")
    const executablePath = join("root", "RepoEdu.exe")

    assert.deepEqual(
      resolvePackagedWindowsChildLifetimeRuntime(resourcesPath, executablePath),
      {
        executablePath,
        launcherEntryPath: join(
          resourcesPath,
          "host-child-lifetime",
          "windows-launcher.cjs",
        ),
      },
    )
  })

  it("exits the one-shot launcher after its target reports terminal state", {
    skip: process.platform !== "win32",
  }, async () => {
    const run = await runWindowsChildLifetimeTarget(
      {
        executablePath: process.execPath,
        launcherEntryPath,
      },
      {
        command: process.execPath,
        args: ["-e", targetScript],
        stdinText: "repo-edu",
      },
    )

    assert.deepEqual(run.result, {
      exitCode: 0,
      signal: null,
      stdout: "REPO-EDU",
      stderr: "",
    })
  })
})

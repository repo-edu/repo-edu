import assert from "node:assert/strict"
import { join } from "node:path"
import { describe, it } from "node:test"
import { resolvePackagedWindowsChildLifetimeRuntime } from "../child-lifetime-artifact-probe.js"

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
})

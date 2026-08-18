import assert from "node:assert/strict"
import { join } from "node:path"
import { describe, it } from "node:test"
import {
  createDesktopCodexSdkHostCommand,
  desktopCodexSdkHostFileName,
} from "../codex-sdk-host-command.js"

describe("createDesktopCodexSdkHostCommand", () => {
  it("uses the fixed bundled entry through Electron Node mode", () => {
    assert.deepEqual(
      createDesktopCodexSdkHostCommand({
        currentDir: "/fixed/out/main",
        executablePath: "/fixed/electron",
      }),
      {
        command: "/fixed/electron",
        args: [join("/fixed/out/main", desktopCodexSdkHostFileName)],
        runAsNode: true,
      },
    )
  })
})

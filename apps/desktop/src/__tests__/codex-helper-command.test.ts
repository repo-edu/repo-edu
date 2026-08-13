import assert from "node:assert/strict"
import { join } from "node:path"
import { describe, it } from "node:test"
import {
  createDesktopCodexHelperCommand,
  desktopCodexHelperFileName,
} from "../codex-helper-command.js"

describe("createDesktopCodexHelperCommand", () => {
  it("uses the fixed bundled entry through Electron Node mode", () => {
    assert.deepEqual(
      createDesktopCodexHelperCommand({
        currentDir: "/fixed/out/main",
        executablePath: "/fixed/electron",
      }),
      {
        command: "/fixed/electron",
        args: [join("/fixed/out/main", desktopCodexHelperFileName)],
        runAsNode: true,
      },
    )
  })
})

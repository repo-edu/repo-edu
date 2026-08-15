import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { buildWindowsLauncherEnvironment } from "../windows-child-lifetime-platform.js"
import {
  createWindowsLaunchCommand,
  parseWindowsLauncherMessage,
  windowsLauncherProtocolVersion,
} from "../windows-launcher-protocol.js"

describe("Windows launcher protocol", () => {
  it("sets Electron Node mode only for an Electron launcher", () => {
    assert.deepEqual(
      buildWindowsLauncherEnvironment(true, {
        ELECTRON_RUN_AS_NODE: "parent-value",
        SAFE: "present",
      }),
      { ELECTRON_RUN_AS_NODE: "1", SAFE: "present" },
    )
    assert.deepEqual(
      buildWindowsLauncherEnvironment(false, {
        ELECTRON_RUN_AS_NODE: "parent-value",
        SAFE: "present",
      }),
      { SAFE: "present" },
    )
  })

  it("serializes one complete target environment unchanged", () => {
    const command = createWindowsLaunchCommand({
      command: "target.exe",
      args: ["--flag"],
      cwd: "C:\\repo-edu",
      env: {
        ELECTRON_RUN_AS_NODE: "must-not-reach-target",
        REPO_EDU_PROTOCOL_TEST: "present",
      },
      shell: "cmd.exe",
    })

    assert.equal(command.kind, "launch")
    assert.equal(command.protocolVersion, windowsLauncherProtocolVersion)
    assert.deepEqual(command.target.args, ["--flag"])
    assert.equal(command.target.cwd, "C:\\repo-edu")
    assert.equal(
      command.target.env.ELECTRON_RUN_AS_NODE,
      "must-not-reach-target",
    )
    assert.equal(command.target.env.REPO_EDU_PROTOCOL_TEST, "present")
    assert.equal(command.target.shell, "cmd.exe")
  })

  it("accepts started and terminal messages but rejects invalid readiness", () => {
    assert.deepEqual(parseWindowsLauncherMessage('{"kind":"started"}'), {
      kind: "started",
    })
    assert.deepEqual(
      parseWindowsLauncherMessage(
        '{"kind":"terminal","exitCode":7,"signal":null}',
      ),
      { kind: "terminal", exitCode: 7, signal: null },
    )
    assert.throws(
      () =>
        parseWindowsLauncherMessage(
          '{"kind":"ready","protocolVersion":999,"runtime":"node"}',
        ),
      /invalid ready state/,
    )
  })
})

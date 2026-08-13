import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  createWindowsLaunchCommand,
  parseWindowsLauncherMessage,
  windowsLauncherProtocolVersion,
} from "../windows-launcher-protocol.js"

describe("Windows launcher protocol", () => {
  it("serializes one complete target without leaking Electron Node mode", () => {
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
    assert.equal(command.target.env.ELECTRON_RUN_AS_NODE, undefined)
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

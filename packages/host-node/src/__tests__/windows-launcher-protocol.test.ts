import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { access } from "node:fs/promises"
import { createInterface } from "node:readline"
import type { Readable, Writable } from "node:stream"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import { resolveWindowsChildLifetimeLauncherEntryUrl } from "../windows-child-lifetime.js"
import { buildWindowsLauncherEnvironment } from "../windows-child-process-lifetime-adapter.js"
import {
  createWindowsLaunchCommand,
  parseWindowsLauncherMessage,
  windowsLauncherProtocolVersion,
} from "../windows-launcher-protocol.js"

function delay(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs)
  })
}

describe("Windows launcher protocol", () => {
  it("resolves the fixed launcher from the host-node package", async () => {
    const launcherEntryUrl = resolveWindowsChildLifetimeLauncherEntryUrl()

    assert.equal(
      fileURLToPath(launcherEntryUrl),
      fileURLToPath(
        new URL(
          "../../resources/host-child-lifetime/windows-launcher.cjs",
          import.meta.url,
        ),
      ),
    )
    await access(launcherEntryUrl)
  })

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

  it("does not restore a host variable the caller removed", () => {
    const hostOnly = "REPO_EDU_PROTOCOL_HOST_ONLY"
    process.env[hostOnly] = "host"
    try {
      const supplied = { ...process.env }
      delete supplied[hostOnly]

      const command = createWindowsLaunchCommand({
        command: "target.exe",
        env: supplied,
      })

      assert.equal(command.target.env[hostOnly], undefined)
    } finally {
      delete process.env[hostOnly]
    }
  })

  it("accepts started, exited, and terminal messages but rejects invalid readiness", () => {
    assert.deepEqual(parseWindowsLauncherMessage('{"kind":"started"}'), {
      kind: "started",
    })
    assert.deepEqual(
      parseWindowsLauncherMessage(
        '{"kind":"exited","exitCode":7,"signal":null}',
      ),
      { kind: "exited", exitCode: 7, signal: null },
    )
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

  it("reports target exit before inherited output pipes close", {
    timeout: 5_000,
  }, async (context) => {
    const launcher = spawn(
      process.execPath,
      [fileURLToPath(resolveWindowsChildLifetimeLauncherEntryUrl())],
      { stdio: ["pipe", "pipe", "pipe", "pipe", "pipe"] },
    )
    context.after(() => {
      if (launcher.exitCode === null && launcher.signalCode === null) {
        launcher.kill()
      }
    })
    launcher.stdout?.resume()
    launcher.stderr?.resume()

    const commandInput = launcher.stdio[3] as Writable
    const controlOutput = launcher.stdio[4] as Readable
    const controlLines = createInterface({
      input: controlOutput,
      crlfDelay: Infinity,
    })[Symbol.asyncIterator]()
    const launcherClosed = once(launcher, "close")
    const nextMessage = async () => {
      const next = await controlLines.next()
      assert.equal(next.done, false)
      return parseWindowsLauncherMessage(next.value)
    }

    assert.equal((await nextMessage()).kind, "ready")
    const descendant = "setTimeout(() => {}, 1000)"
    const target = [
      'const { spawn } = require("node:child_process")',
      `spawn(process.execPath, ["-e", ${JSON.stringify(descendant)}], { stdio: ["ignore", "inherit", "inherit"] })`,
      "process.exit(27)",
    ].join("; ")
    commandInput.end(
      `${JSON.stringify(
        createWindowsLaunchCommand({
          command: process.execPath,
          args: ["-e", target],
        }),
      )}\n`,
    )
    launcher.stdin?.end()

    assert.equal((await nextMessage()).kind, "started")
    assert.deepEqual(await nextMessage(), {
      kind: "exited",
      exitCode: 27,
      signal: null,
    })
    assert.equal(
      await Promise.race([
        launcherClosed.then(() => true),
        delay(100).then(() => false),
      ]),
      false,
    )
    assert.deepEqual(await nextMessage(), {
      kind: "terminal",
      exitCode: 27,
      signal: null,
    })
    assert.deepEqual(await launcherClosed, [0, null])
  })
})

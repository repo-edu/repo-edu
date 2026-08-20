import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { access } from "node:fs/promises"
import { createInterface } from "node:readline"
import type { Readable, Writable } from "node:stream"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import { resolveWindowsChildProcessLifetimeLauncherEntryUrl } from "../windows-child-lifetime.js"
import { buildWindowsLauncherEnvironment } from "../windows-child-process-lifetime-adapter.js"
import {
  createWindowsLaunchCommand,
  parseWindowsLauncherMessage,
  windowsLauncherProtocolVersion,
} from "../windows-launcher-protocol.js"

describe("Windows launcher protocol", () => {
  it("resolves the fixed launcher from the host-node package", async () => {
    const launcherEntryUrl =
      resolveWindowsChildProcessLifetimeLauncherEntryUrl()

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

  it("serializes target argv and one complete environment unchanged", () => {
    const command = createWindowsLaunchCommand({
      command: "target.exe",
      args: ["--flag"],
      cwd: "C:\\repo-edu",
      env: {
        ELECTRON_RUN_AS_NODE: "must-not-reach-target",
        REPO_EDU_PROTOCOL_TEST: "present",
      },
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
    assert.equal("shell" in command.target, false)
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
      [fileURLToPath(resolveWindowsChildProcessLifetimeLauncherEntryUrl())],
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
    assert.deepEqual(await nextMessage(), {
      kind: "terminal",
      exitCode: 27,
      signal: null,
    })
    assert.deepEqual(await launcherClosed, [0, null])
  })

  it("keeps the target-exit report when the target exits without reading its input", {
    timeout: 10_000,
  }, async (context) => {
    const launcher = spawn(
      process.execPath,
      [fileURLToPath(resolveWindowsChildProcessLifetimeLauncherEntryUrl())],
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
    // The input-relay failure must reach this side of the pipe as the same
    // broken-pipe error a direct Node child delivers to its writer. Write
    // callbacks observe it; the error listener only keeps the emit handled.
    launcher.stdin?.on("error", () => {})
    const relayFailure = Promise.withResolvers<NodeJS.ErrnoException>()

    assert.equal((await nextMessage()).kind, "ready")
    // A descendant holds the output pipes after the target's exit, so the
    // launcher outlives the relay break instead of masking it by exiting.
    const descendant = "setTimeout(() => {}, 1500)"
    const target = [
      'const { spawn } = require("node:child_process")',
      `spawn(process.execPath, ["-e", ${JSON.stringify(descendant)}], { stdio: ["ignore", "inherit", "inherit"] })`,
      "process.exit(7)",
    ].join("; ")
    commandInput.end(
      `${JSON.stringify(
        createWindowsLaunchCommand({
          command: process.execPath,
          args: ["-e", target],
        }),
      )}\n`,
    )
    assert.equal((await nextMessage()).kind, "started")

    const unreadInput = Buffer.alloc(65_536, 97)
    const writer = setInterval(() => {
      launcher.stdin?.write(unreadInput, (error) => {
        if (error) {
          relayFailure.resolve(error as NodeJS.ErrnoException)
        }
      })
    }, 10)
    context.after(() => {
      clearInterval(writer)
    })

    assert.deepEqual(await nextMessage(), {
      kind: "exited",
      exitCode: 7,
      signal: null,
    })
    const failure = await relayFailure.promise
    clearInterval(writer)
    assert.match(String(failure.code), /^(EPIPE|EOF)$/)
    assert.deepEqual(await nextMessage(), {
      kind: "terminal",
      exitCode: 7,
      signal: null,
    })
    assert.deepEqual(await launcherClosed, [0, null])
  })
})

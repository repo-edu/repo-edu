import assert from "node:assert/strict"
import { once } from "node:events"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import type {
  ChildProcessLifetimeController,
  ChildProcessLifetimePlatformAdapter,
} from "../child-process-lifetime.js"
import {
  ChildProcessTreeUnconfirmedError,
  createChildProcessLifetimeController,
} from "../child-process-lifetime.js"
import { createPosixChildProcessLifetimeAdapter } from "../posix-child-process-lifetime-adapter.js"
import {
  createWindowsChildProcessLifetimeAdapter,
  resolveWindowsChildProcessLifetimeLauncherEntryUrl,
  runWindowsChildLifetimeTarget,
} from "../windows-child-lifetime.js"
import {
  launchAssignedTarget,
  type WindowsChildLifetimeAdapterOperations,
} from "../windows-child-process-lifetime-adapter.js"
import {
  createWindowsKillOnCloseJob,
  type WindowsKillOnCloseJob,
} from "../windows-job.js"

const windowsLauncherEntryPath = fileURLToPath(
  resolveWindowsChildProcessLifetimeLauncherEntryUrl(),
)
const supportsController =
  process.platform === "darwin" ||
  process.platform === "linux" ||
  process.platform === "win32"
const supportsProcessGroups =
  process.platform === "darwin" || process.platform === "linux"
const deadlineProofStopPolicy = {
  forcedStopConfirmationPeriodMs: 40,
  gracefulStopPeriodMs: 40,
}

class TerminalHostExit extends Error {
  override readonly name = "TerminalHostExit"

  constructor(readonly unconfirmedTree: ChildProcessTreeUnconfirmedError) {
    super("The terminal host exited for an unconfirmed child-process tree.")
  }
}

function createController(): ChildProcessLifetimeController {
  const windowsAdapter =
    process.platform === "win32"
      ? createWindowsChildProcessLifetimeAdapter({
          executablePath: process.execPath,
          launcherEntryPath: windowsLauncherEntryPath,
          runAsNode: false,
        })
      : undefined
  return createChildProcessLifetimeController({
    diagnosticSink() {},
    onUnconfirmedTree(error): never {
      throw error
    },
    windowsAdapter,
  })
}

function createTerminalController(
  adapter: ChildProcessLifetimePlatformAdapter,
): ChildProcessLifetimeController {
  return createChildProcessLifetimeController({
    diagnosticSink() {},
    onUnconfirmedTree(error): never {
      throw new TerminalHostExit(error)
    },
    runtimePlatform: "win32",
    windowsAdapter: adapter,
  })
}

function adapterWithDeadlineProofPolicy(
  adapter: ChildProcessLifetimePlatformAdapter,
): ChildProcessLifetimePlatformAdapter {
  return {
    async launch(request, pendingStopSignal) {
      return await adapter.launch(
        request,
        pendingStopSignal,
        deadlineProofStopPolicy,
      )
    },
  }
}

function signalRealProcessGroup(
  processGroupId: number,
  signal: "SIGKILL" | "SIGTERM",
): boolean {
  try {
    process.kill(-processGroupId, signal)
    return true
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ESRCH") {
      return false
    }
    throw error
  }
}

describe("child-process completion routes", {
  skip: !supportsController,
}, () => {
  it("returns unknown only after a lost proving connection stops the real owned tree", async (context) => {
    const controller = createController()
    context.after(async () => {
      await controller.stopAndConfirm()
    })
    const tree = await controller.launch({
      command: process.execPath,
      args: [
        "-e",
        "process.stdout.write('started'); setInterval(() => undefined, 1_000)",
      ],
      proof: "reported",
    })
    tree.reportWorkStarted()
    await once(tree.stdout, "data")

    tree.reportProofLost(new Error("proving connection lost"))

    assert.deepEqual(await tree.outcome, { outcome: "unknown" })
  })

  it("rejects a POSIX launch whose target cannot be spawned", {
    skip: !supportsProcessGroups,
  }, async (context) => {
    const controller = createController()
    context.after(async () => {
      await controller.stopAndConfirm()
    })

    await assert.rejects(
      controller.launch({
        command: "/repo-edu-tests/definitely-missing-command",
        proof: "target-exit",
      }),
      (error: unknown) =>
        error instanceof Error &&
        "code" in error &&
        (error as NodeJS.ErrnoException).code === "ENOENT",
    )
  })

  it("ends the terminal host when escaped descendants hold the output pipes", {
    skip: !supportsProcessGroups,
  }, async () => {
    const posixAdapter = createPosixChildProcessLifetimeAdapter()
    const controller = createTerminalController(
      adapterWithDeadlineProofPolicy(posixAdapter),
    )
    const tree = await controller.launch({
      command: process.execPath,
      args: [
        "-e",
        [
          'const { spawn } = require("node:child_process")',
          'spawn(process.execPath, ["-e", "setTimeout(() => undefined, 2_000)"], {',
          "  detached: true,",
          '  stdio: ["ignore", "inherit", "ignore"],',
          "}).unref()",
        ].join("\n"),
      ],
      proof: "target-exit",
    })
    tree.stdout.resume()
    tree.stderr.resume()

    const startedAt = Date.now()
    await assert.rejects(
      tree.outcome,
      (error: unknown) =>
        error instanceof TerminalHostExit &&
        error.unconfirmedTree instanceof ChildProcessTreeUnconfirmedError &&
        /output pipes stayed open/.test(error.unconfirmedTree.message),
    )
    // The pipe wait shares the forced-stop deadline instead of adding its own.
    assert.ok(Date.now() - startedAt < 1_500)
  })

  it("ends the terminal host when POSIX forced-stop confirmation expires", {
    skip: !supportsProcessGroups,
  }, async () => {
    const posixAdapter = createPosixChildProcessLifetimeAdapter({
      processGroupExists: () => true,
      signalProcessGroup: signalRealProcessGroup,
    })
    const controller = createTerminalController(
      adapterWithDeadlineProofPolicy(posixAdapter),
    )
    const tree = await controller.launch({
      command: process.execPath,
      args: ["-e", "setInterval(() => undefined, 1_000)"],
      proof: "target-exit",
    })

    tree.requestCancellation()

    await assert.rejects(
      tree.outcome,
      (error: unknown) =>
        error instanceof TerminalHostExit &&
        error.unconfirmedTree instanceof ChildProcessTreeUnconfirmedError,
    )
  })

  it("lets a Windows target run longer than the launcher handshake bound", {
    skip: process.platform !== "win32",
  }, async () => {
    const startedAt = Date.now()
    const run = await runWindowsChildLifetimeTarget(
      {
        executablePath: process.execPath,
        launcherEntryPath: windowsLauncherEntryPath,
        runAsNode: false,
      },
      {
        command: process.execPath,
        args: [
          "-e",
          "setTimeout(() => process.stdout.write('finished'), 30_100)",
        ],
      },
    )

    assert.equal(run.result.exitCode, 0)
    assert.equal(run.result.stdout, "finished")
    assert.ok(Date.now() - startedAt >= 30_000)
  })

  it("ends the terminal host when Windows forced-stop confirmation expires", {
    skip: process.platform !== "win32",
  }, async () => {
    let realJob: WindowsKillOnCloseJob | undefined
    const operations: WindowsChildLifetimeAdapterOperations = {
      async createJob() {
        realJob = await createWindowsKillOnCloseJob()
        return {
          ...realJob,
          hasActiveProcesses: () => true,
        }
      },
    }
    const adapter: ChildProcessLifetimePlatformAdapter = {
      async launch(request, pendingStopSignal) {
        return (
          await launchAssignedTarget(
            {
              executablePath: process.execPath,
              launcherEntryPath: windowsLauncherEntryPath,
              runAsNode: false,
            },
            {
              command: request.command,
              args: request.args,
              cwd: request.cwd,
              env: request.env,
              shell: request.shell,
              signal: request.signal,
            },
            deadlineProofStopPolicy,
            pendingStopSignal,
            operations,
          )
        ).tree
      },
    }
    const controller = createTerminalController(adapter)

    try {
      const tree = await controller.launch({
        command: process.execPath,
        args: ["-e", "setInterval(() => undefined, 1_000)"],
        proof: "target-exit",
      })

      tree.requestCancellation()

      await assert.rejects(
        tree.outcome,
        (error: unknown) =>
          error instanceof TerminalHostExit &&
          error.unconfirmedTree instanceof ChildProcessTreeUnconfirmedError,
      )
    } finally {
      realJob?.close()
    }
  })
})

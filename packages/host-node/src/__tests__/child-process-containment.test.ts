import assert from "node:assert/strict"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Readable } from "node:stream"
import { afterEach, describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import type {
  ChildProcessLifetimeController,
  ChildProcessLifetimeLaunch,
  OwnedChildProcessTree,
} from "../child-process-lifetime.js"
import {
  childProcessStopGracePeriodMs,
  createChildProcessLifetimeController,
} from "../child-process-lifetime.js"
import { createNodeProcessPort } from "../index.js"
import {
  createWindowsChildProcessLifetimeAdapter,
  proveWindowsLauncherReadiness,
  resolveWindowsChildProcessLifetimeLauncherEntryUrl,
  runWindowsChildLifetimeTarget,
} from "../windows-child-lifetime.js"

const fixturePath = fileURLToPath(
  new URL("./fixtures/child-process-tree.cjs", import.meta.url),
)
const windowsLauncherEntryPath = fileURLToPath(
  resolveWindowsChildProcessLifetimeLauncherEntryUrl(),
)
const stalledWindowsLauncherEntryPath = fileURLToPath(
  new URL("./fixtures/windows-launcher-stall.cjs", import.meta.url),
)
const windowsLauncherStallEnvironmentVariable =
  "REPO_EDU_WINDOWS_LAUNCHER_STALL"
const windowsLauncherStallMarkerEnvironmentVariable =
  "REPO_EDU_WINDOWS_LAUNCHER_STALL_MARKER"
const supportsController =
  process.platform === "darwin" ||
  process.platform === "linux" ||
  process.platform === "win32"
const supportsProcessGroups =
  process.platform === "darwin" || process.platform === "linux"
const temporaryRoots = new Set<string>()

function delay(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs)
  })
}

async function valueWithin<T>(
  promise: Promise<T>,
  durationMs: number,
): Promise<T> {
  let timeout: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          reject(new Error("Pending child-process shutdown timed out."))
        }, durationMs)
      }),
    ])
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout)
    }
  }
}

async function completeWithin(
  promise: Promise<void>,
  durationMs: number,
): Promise<void> {
  await valueWithin(promise, durationMs)
}

function restoreEnvironmentVariable(
  name: string,
  previous: string | undefined,
): void {
  if (previous === undefined) {
    delete process.env[name]
    return
  }
  process.env[name] = previous
}

async function markerPath(name: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "repo-edu-containment-"))
  temporaryRoots.add(root)
  return join(root, name)
}

async function readMarker(path: string): Promise<string> {
  return await readFile(path, "utf8")
}

async function waitForMarker(path: string, pattern: RegExp): Promise<string> {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    const content = await readFile(path, "utf8").catch(() => "")
    if (pattern.test(content)) {
      return content
    }
    await delay(20)
  }
  throw new Error(`Timed out waiting for marker ${pattern}.`)
}

async function assertMarkerStable(path: string): Promise<void> {
  const content = await readMarker(path)
  await delay(120)
  assert.equal(await readMarker(path), content)
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
    warnUnconfirmedTree(error): never {
      throw error
    },
    windowsAdapter,
  })
}

async function launchTree(
  controller: ChildProcessLifetimeController,
  mode: string,
  marker: string,
): Promise<OwnedChildProcessTree> {
  return await controller.launch({
    command: process.execPath,
    args: [fixturePath, mode, marker],
    proof: "target-exit",
  })
}

async function targetResult(tree: OwnedChildProcessTree): Promise<{
  readonly exitCode: number | null
  readonly signal: string | null
}> {
  const outcome = await tree.outcome
  if (outcome.outcome === "unknown" || outcome.outcome === "cancelled") {
    throw new Error(`The target ended ${outcome.outcome}.`)
  }
  return outcome.value
}

function processIds(content: string): number[] {
  return [...content.matchAll(/-pid:(\d+)/g)].map((match) => Number(match[1]))
}

function createLocalOutputFailure(
  controller: ChildProcessLifetimeController,
): ChildProcessLifetimeController {
  return {
    async launch<TCompleted, TFailed>(request: ChildProcessLifetimeLaunch) {
      const tree = await controller.launch<TCompleted, TFailed>(request)
      let reading = false
      const stdout = new Readable({
        read() {
          if (reading) {
            return
          }
          reading = true
          tree.stdout.once("data", () => {
            this.destroy(new Error("local output failure"))
          })
          tree.stdout.resume()
        },
      })
      return { ...tree, stdout }
    },
    stopAndConfirm: controller.stopAndConfirm,
  }
}

afterEach(async () => {
  await Promise.all(
    [...temporaryRoots].map(async (root) => {
      await rm(root, { force: true, recursive: true })
    }),
  )
  temporaryRoots.clear()
})

describe("child-process containment", { skip: !supportsController }, () => {
  it("freezes a changing descendant before reporting normal completion", async (context) => {
    const marker = await markerPath("normal-completion.txt")
    const controller = createController()
    context.after(async () => {
      await controller.stopAndConfirm()
    })

    const tree = await launchTree(controller, "tree-completes", marker)

    assert.deepEqual(await targetResult(tree), { exitCode: 0, signal: null })
    await assertMarkerStable(marker)
  })

  it("stops an outliving descendant that inherits target output", async (context) => {
    const marker = await markerPath("inherited-output.txt")
    const controller = createController()
    context.after(async () => {
      await controller.stopAndConfirm()
    })

    const tree = await launchTree(
      controller,
      "parent-exits-inherited-output",
      marker,
    )
    const result = await valueWithin(
      targetResult(tree),
      childProcessStopGracePeriodMs + 2_000,
    )
    const stopped = await readMarker(marker)

    assert.deepEqual(result, { exitCode: 25, signal: null })
    assert.match(stopped, /grandchild-started/)
    if (supportsProcessGroups) {
      assert.match(stopped, /grandchild-stopped/)
    }
    await assertMarkerStable(marker)
  })

  it("freezes a changing descendant after a requested stop", async (context) => {
    const marker = await markerPath("requested-stop.txt")
    const controller = createController()
    context.after(async () => {
      await controller.stopAndConfirm()
    })
    const tree = await launchTree(controller, "tree-waits", marker)
    await waitForMarker(marker, /grandchild-tick/)

    tree.requestCancellation()
    assert.deepEqual(await tree.outcome, { outcome: "cancelled" })

    await assertMarkerStable(marker)
  })

  it("forces an uncooperative changing tree to stop", async (context) => {
    const marker = await markerPath("forced-stop.txt")
    const controller = createController()
    context.after(async () => {
      await controller.stopAndConfirm()
    })
    const tree = await launchTree(controller, "tree-ignores-stop", marker)
    await waitForMarker(marker, /grandchild-ignores-stop-tick/)

    tree.requestCancellation()
    assert.deepEqual(await tree.outcome, { outcome: "cancelled" })

    await assertMarkerStable(marker)
  })

  it("stops a changing tree before returning unknown for a lost stream", async (context) => {
    const marker = await markerPath("local-failure.txt")
    const controller = createController()
    context.after(async () => {
      await controller.stopAndConfirm()
    })
    const processPort = createNodeProcessPort(
      createLocalOutputFailure(controller),
    )

    await assert.rejects(
      processPort.run({
        command: process.execPath,
        args: [fixturePath, "tree-waits", marker],
      }),
      (error) =>
        error instanceof Error &&
        error.message === "The command result could not be confirmed.",
    )

    await waitForMarker(marker, /grandchild-started/)
    await assertMarkerStable(marker)
  })

  for (const proof of [
    { label: "Git", mode: "tree-waits" },
    { label: "Claude", mode: "tree-waits" },
    {
      label: "Codex",
      mode: "codex-sdk-host-tree-waits",
    },
  ]) {
    it(`keeps every ${proof.label} descendant in its process group`, {
      skip: !supportsProcessGroups,
    }, async (context) => {
      const marker = await markerPath(`${proof.label.toLowerCase()}-group.txt`)
      const controller = createController()
      context.after(async () => {
        await controller.stopAndConfirm()
      })
      const tree = await launchTree(controller, proof.mode, marker)
      const content = await waitForMarker(
        marker,
        proof.label === "Codex" ? /tool-descendant-tick/ : /grandchild-tick/,
      )
      const ids = processIds(content)

      assert.equal(ids.length, proof.label === "Codex" ? 3 : 2)
      assert.doesNotThrow(() => {
        process.kill(-(ids[0] ?? 0), 0)
      })

      tree.requestCancellation()
      assert.deepEqual(await tree.outcome, { outcome: "cancelled" })
      const stopped = await readMarker(marker)
      assert.match(stopped, /parent-stopped/)
      if (proof.label === "Codex") {
        assert.match(stopped, /codex-process-stopped/)
        assert.match(stopped, /tool-descendant-stopped/)
      } else {
        assert.match(stopped, /grandchild-stopped/)
      }
      await assertMarkerStable(marker)
    })
  }

  it("exits the Windows launcher when control closes before target admission", {
    skip: process.platform !== "win32",
  }, async () => {
    const evidence = await proveWindowsLauncherReadiness({
      executablePath: process.execPath,
      launcherEntryPath: windowsLauncherEntryPath,
      runAsNode: false,
    })

    assert.equal(evidence.assignedToJob, true)
    assert.equal(evidence.identitySavedInSpawnTurn, true)
    assert.equal(evidence.jobHandleInherited, false)
    assert.equal(evidence.targetAdmittedAfterAssignment, false)
    assert.equal(evidence.exitCode, 0)
  })

  it("assigns the Windows launcher before changing descendant work starts", {
    skip: process.platform !== "win32",
  }, async () => {
    const marker = await markerPath("windows-assignment.txt")
    const run = await runWindowsChildLifetimeTarget(
      {
        executablePath: process.execPath,
        launcherEntryPath: windowsLauncherEntryPath,
        runAsNode: false,
      },
      {
        command: process.execPath,
        args: [fixturePath, "tree-completes", marker],
      },
    )

    assert.equal(run.evidence.assignedToJob, true)
    assert.equal(run.evidence.targetAdmittedAfterAssignment, true)
    assert.equal(run.evidence.jobHandleInherited, false)
    assert.deepEqual(run.result, {
      exitCode: 0,
      signal: null,
      stderr: "",
      stdout: "",
    })
    await assertMarkerStable(marker)
  })

  it("keeps caller cancellation distinct while Windows readiness is pending", {
    skip: process.platform !== "win32",
  }, async (context) => {
    const marker = await markerPath("caller-cancelled-readiness.txt")
    const previousMode = process.env[windowsLauncherStallEnvironmentVariable]
    const previousMarker =
      process.env[windowsLauncherStallMarkerEnvironmentVariable]
    process.env[windowsLauncherStallEnvironmentVariable] = "readiness"
    process.env[windowsLauncherStallMarkerEnvironmentVariable] = marker

    const controller = createChildProcessLifetimeController({
      diagnosticSink() {},
      warnUnconfirmedTree(error): never {
        throw error
      },
      windowsAdapter: createWindowsChildProcessLifetimeAdapter({
        executablePath: process.execPath,
        launcherEntryPath: stalledWindowsLauncherEntryPath,
        runAsNode: false,
      }),
    })
    context.after(async () => {
      await controller.stopAndConfirm()
    })

    try {
      const abortController = new AbortController()
      const launch = controller.launch({
        command: process.execPath,
        proof: "target-exit",
        signal: abortController.signal,
      })
      await waitForMarker(marker, /readiness-pending/)
      const launchRejected = assert.rejects(
        launch,
        (error) => error instanceof DOMException && error.name === "AbortError",
      )

      abortController.abort()

      await completeWithin(
        launchRejected,
        childProcessStopGracePeriodMs + 2_000,
      )
      await controller.stopAndConfirm()
    } finally {
      restoreEnvironmentVariable(
        windowsLauncherStallEnvironmentVariable,
        previousMode,
      )
      restoreEnvironmentVariable(
        windowsLauncherStallMarkerEnvironmentVariable,
        previousMarker,
      )
    }
  })

  it("directs caller cancellation at the Windows group while target start is pending", {
    skip: process.platform !== "win32",
  }, async (context) => {
    const marker = await markerPath("caller-cancelled-target-start.txt")
    const previousMode = process.env[windowsLauncherStallEnvironmentVariable]
    const previousMarker =
      process.env[windowsLauncherStallMarkerEnvironmentVariable]
    process.env[windowsLauncherStallEnvironmentVariable] = "target-start"
    process.env[windowsLauncherStallMarkerEnvironmentVariable] = marker

    const controller = createChildProcessLifetimeController({
      diagnosticSink() {},
      warnUnconfirmedTree(error): never {
        throw error
      },
      windowsAdapter: createWindowsChildProcessLifetimeAdapter({
        executablePath: process.execPath,
        launcherEntryPath: stalledWindowsLauncherEntryPath,
        runAsNode: false,
      }),
    })
    context.after(async () => {
      await controller.stopAndConfirm()
    })

    try {
      const abortController = new AbortController()
      const launch = controller.launch({
        command: process.execPath,
        proof: "target-exit",
        signal: abortController.signal,
      })
      await waitForMarker(marker, /target-start-pending/)
      abortController.abort()
      const tree = await valueWithin(
        launch,
        childProcessStopGracePeriodMs + 2_000,
      )
      assert.deepEqual(await tree.outcome, { outcome: "unknown" })
      await controller.stopAndConfirm()
    } finally {
      restoreEnvironmentVariable(
        windowsLauncherStallEnvironmentVariable,
        previousMode,
      )
      restoreEnvironmentVariable(
        windowsLauncherStallMarkerEnvironmentVariable,
        previousMarker,
      )
    }
  })

  for (const pendingPhase of [
    {
      mode: "readiness",
      marker: /readiness-pending/,
      expected: "rejected",
    },
    {
      mode: "target-start",
      marker: /target-start-pending/,
      expected: "unknown",
    },
  ] as const) {
    it(`stops Windows startup while ${pendingPhase.mode} is pending`, {
      skip: process.platform !== "win32",
    }, async (context) => {
      const marker = await markerPath(`${pendingPhase.mode}.txt`)
      const previousMode = process.env[windowsLauncherStallEnvironmentVariable]
      const previousMarker =
        process.env[windowsLauncherStallMarkerEnvironmentVariable]
      process.env[windowsLauncherStallEnvironmentVariable] = pendingPhase.mode
      process.env[windowsLauncherStallMarkerEnvironmentVariable] = marker

      const controller = createChildProcessLifetimeController({
        diagnosticSink() {},
        warnUnconfirmedTree(error): never {
          throw error
        },
        windowsAdapter: createWindowsChildProcessLifetimeAdapter({
          executablePath: process.execPath,
          launcherEntryPath: stalledWindowsLauncherEntryPath,
          runAsNode: false,
        }),
      })
      context.after(async () => {
        await controller.stopAndConfirm()
      })

      try {
        const launch = controller.launch({
          command: process.execPath,
          proof: "target-exit",
        })
        await waitForMarker(marker, pendingPhase.marker)
        const launchSettled =
          pendingPhase.expected === "rejected"
            ? assert.rejects(launch, /pending child-process launch was stopped/)
            : launch.then(async (tree) => {
                assert.deepEqual(await tree.outcome, { outcome: "unknown" })
              })

        await completeWithin(
          controller.stopAndConfirm(),
          childProcessStopGracePeriodMs + 2_000,
        )
        await launchSettled
      } finally {
        restoreEnvironmentVariable(
          windowsLauncherStallEnvironmentVariable,
          previousMode,
        )
        restoreEnvironmentVariable(
          windowsLauncherStallMarkerEnvironmentVariable,
          previousMarker,
        )
      }
    })
  }
})

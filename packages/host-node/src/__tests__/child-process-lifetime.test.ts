import assert from "node:assert/strict"
import { once } from "node:events"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { PassThrough } from "node:stream"
import { afterEach, describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import {
  pendingLaunchStoppedError,
  waitForLaunchStop,
} from "../child-process-launch-stop.js"
import {
  type ChildProcessLifetimePlatformAdapter,
  type ChildProcessLifetimeStopPolicy,
  childProcessStopGracePeriodMs,
  createChildProcessLifetimeController,
} from "../child-process-lifetime.js"
import {
  finishChildProcessLifetimeArtifactProbe,
  resolveChildProcessLifetimeArtifactProbeTarget,
  startChildProcessLifetimeArtifactProbe,
} from "../child-process-lifetime-artifact-probe.js"

const fixturePath = fileURLToPath(
  new URL("./fixtures/child-process-tree.cjs", import.meta.url),
)
const supportsProcessGroups =
  process.platform === "darwin" || process.platform === "linux"
const temporaryRoots = new Set<string>()

async function markerPath(name: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "repo-edu-child-lifetime-"))
  temporaryRoots.add(root)
  return join(root, name)
}

async function waitUntilReady(stdout: NodeJS.ReadableStream): Promise<void> {
  stdout.setEncoding("utf8")
  const [chunk] = await once(stdout, "data")
  if (!String(chunk).includes("ready")) {
    throw new Error("The child process returned an invalid ready message.")
  }
}

async function readMarker(path: string): Promise<string> {
  return await readFile(path, "utf8")
}

afterEach(async () => {
  await Promise.all(
    [...temporaryRoots].map(async (root) => {
      await rm(root, { recursive: true })
    }),
  )
  temporaryRoots.clear()
})

describe("pending child-process launches", () => {
  it("passes the controller-owned stop policy to its platform adapter", async () => {
    const platformDescriptor = Object.getOwnPropertyDescriptor(
      process,
      "platform",
    )
    let observedPolicy: ChildProcessLifetimeStopPolicy | undefined
    const windowsAdapter: ChildProcessLifetimePlatformAdapter = {
      async launch(_request, _stopSignal, stopPolicy) {
        observedPolicy = stopPolicy
        return {
          stdin: new PassThrough(),
          stdout: new PassThrough(),
          stderr: new PassThrough(),
          result: Promise.resolve({ exitCode: 0, signal: null }),
          async stopAndConfirm() {},
        }
      },
    }

    try {
      Object.defineProperty(process, "platform", {
        ...platformDescriptor,
        value: "win32",
      })
      const controller = createChildProcessLifetimeController({
        windowsAdapter,
      })
      const tree = await controller.launch({ command: "completed-target" })

      await tree.result
      await controller.stopAndConfirm()

      assert.deepEqual(observedPolicy, {
        gracefulStopPeriodMs: childProcessStopGracePeriodMs,
      })
    } finally {
      if (platformDescriptor) {
        Object.defineProperty(process, "platform", platformDescriptor)
      }
    }
  })

  it("interrupts a platform wait when pending startup stops", async () => {
    const pendingStop = new AbortController()
    const waiting = waitForLaunchStop(new Promise<never>(() => undefined), [
      pendingStop.signal,
    ])

    pendingStop.abort()

    await assert.rejects(waiting, /pending child-process launch was stopped/)
  })

  it("requests pending startup to stop before waiting for it", async () => {
    const platformDescriptor = Object.getOwnPropertyDescriptor(
      process,
      "platform",
    )
    let pendingStopSignal: AbortSignal | undefined
    const windowsAdapter: ChildProcessLifetimePlatformAdapter = {
      launch(_request, stopSignal) {
        pendingStopSignal = stopSignal
        return new Promise((_resolve, reject) => {
          stopSignal.addEventListener(
            "abort",
            () => {
              reject(pendingLaunchStoppedError(stopSignal))
            },
            { once: true },
          )
        })
      },
    }

    try {
      Object.defineProperty(process, "platform", {
        ...platformDescriptor,
        value: "win32",
      })
      const controller = createChildProcessLifetimeController({
        windowsAdapter,
      })
      const launch = controller.launch({
        command: "pending-target",
      })
      const launchRejected = assert.rejects(
        launch,
        /pending child-process launch was stopped/,
      )

      await controller.stopAndConfirm()

      assert.equal(pendingStopSignal?.aborted, true)
      await launchRejected
    } finally {
      if (platformDescriptor) {
        Object.defineProperty(process, "platform", platformDescriptor)
      }
    }
  })

  it("reports a pending launch whose cleanup was not confirmed", async () => {
    const platformDescriptor = Object.getOwnPropertyDescriptor(
      process,
      "platform",
    )
    const cleanupFailure = new Error("pending cleanup was not confirmed")
    const windowsAdapter: ChildProcessLifetimePlatformAdapter = {
      launch(_request, stopSignal) {
        return new Promise((_resolve, reject) => {
          stopSignal.addEventListener(
            "abort",
            () => {
              reject(cleanupFailure)
            },
            { once: true },
          )
        })
      },
    }

    try {
      Object.defineProperty(process, "platform", {
        ...platformDescriptor,
        value: "win32",
      })
      const controller = createChildProcessLifetimeController({
        windowsAdapter,
      })
      const launch = controller.launch({
        command: "pending-target",
      })
      const launchRejected = assert.rejects(
        launch,
        (error) => error === cleanupFailure,
      )

      await assert.rejects(
        controller.stopAndConfirm(),
        (error) => error === cleanupFailure,
      )
      await launchRejected
    } finally {
      if (platformDescriptor) {
        Object.defineProperty(process, "platform", platformDescriptor)
      }
    }
  })
})

describe("child-process cancellation", () => {
  it("starts bounded stop and holds the result until the tree is confirmed gone", async () => {
    const platformDescriptor = Object.getOwnPropertyDescriptor(
      process,
      "platform",
    )
    const terminal = Promise.withResolvers<{
      exitCode: number | null
      signal: string | null
    }>()
    let stopRequests = 0
    let stopConfirmations = 0
    const windowsAdapter: ChildProcessLifetimePlatformAdapter = {
      async launch(_request) {
        const input = new PassThrough()
        const requestStop = () => {
          stopRequests += 1
          input.end()
        }
        return {
          stdin: input,
          stdout: new PassThrough(),
          stderr: new PassThrough(),
          result: terminal.promise,
          async stopAndConfirm() {
            stopConfirmations += 1
            requestStop()
            terminal.resolve({ exitCode: 0, signal: null })
          },
        }
      },
    }

    try {
      Object.defineProperty(process, "platform", {
        ...platformDescriptor,
        value: "win32",
      })
      const abortController = new AbortController()
      const controller = createChildProcessLifetimeController({
        windowsAdapter,
      })
      const run = await controller.launch({
        command: "waiting-target",
        signal: abortController.signal,
      })

      abortController.abort()
      assert.deepEqual(await run.result, { exitCode: 0, signal: null })
      assert.equal(stopRequests, 1)
      assert.equal(stopConfirmations, 1)
    } finally {
      if (platformDescriptor) {
        Object.defineProperty(process, "platform", platformDescriptor)
      }
    }
  })
})

describe("child-process lifetime controller", {
  skip: !supportsProcessGroups,
}, () => {
  it("holds the direct result until an outliving grandchild is stopped", async (context) => {
    const marker = await markerPath("outliving-grandchild.txt")
    const controller = createChildProcessLifetimeController()
    context.after(async () => {
      await controller.stopAndConfirm()
    })
    const run = await controller.launch({
      command: process.execPath,
      args: [fixturePath, "parent-exits", marker],
    })

    const result = await run.result
    const contentAtResult = await readMarker(marker)
    await new Promise((resolve) => setTimeout(resolve, 80))

    assert.deepEqual(result, { exitCode: 23, signal: null })
    assert.match(contentAtResult, /grandchild-started/)
    assert.match(contentAtResult, /grandchild-stopped/)
    assert.equal(await readMarker(marker), contentAtResult)
  })

  it("holds a simulated Codex SDK host result until its Codex process and tool descendant stop", async (context) => {
    const marker = await markerPath("codex-sdk-host-descendants.txt")
    const controller = createChildProcessLifetimeController()
    context.after(async () => {
      await controller.stopAndConfirm()
    })
    const run = await controller.launch({
      command: process.execPath,
      args: [fixturePath, "codex-sdk-host-exits", marker],
    })

    const result = await run.result
    const contentAtResult = await readMarker(marker)
    await new Promise((resolve) => setTimeout(resolve, 80))

    assert.deepEqual(result, { exitCode: 24, signal: null })
    assert.match(contentAtResult, /codex-process-stopped/)
    assert.match(contentAtResult, /tool-descendant-started/)
    assert.match(contentAtResult, /tool-descendant-stopped/)
    assert.equal(await readMarker(marker), contentAtResult)
  })

  it("addresses cancellation to the whole process group", async (context) => {
    const marker = await markerPath("cancelled-tree.txt")
    const controller = createChildProcessLifetimeController()
    context.after(async () => {
      await controller.stopAndConfirm()
    })
    const abortController = new AbortController()
    const run = await controller.launch({
      command: process.execPath,
      args: [fixturePath, "tree-waits", marker],
      signal: abortController.signal,
    })
    await waitUntilReady(run.stdout)

    abortController.abort()
    await run.result

    const content = await readMarker(marker)
    assert.match(content, /parent-stopped/)
    assert.match(content, /grandchild-stopped/)
  })

  it("stops every registered owned tree", async (context) => {
    const firstMarker = await markerPath("first-tree.txt")
    const secondMarker = await markerPath("second-tree.txt")
    const controller = createChildProcessLifetimeController()
    context.after(async () => {
      await controller.stopAndConfirm()
    })
    const firstTree = await controller.launch({
      command: process.execPath,
      args: [fixturePath, "tree-waits", firstMarker],
    })
    const secondTree = await controller.launch({
      command: process.execPath,
      args: [fixturePath, "tree-waits", secondMarker],
    })
    await Promise.all([
      waitUntilReady(firstTree.stdout),
      waitUntilReady(secondTree.stdout),
    ])

    await controller.stopAndConfirm()
    await Promise.all([firstTree.result, secondTree.result])
    await controller.stopAndConfirm()

    assert.match(await readMarker(firstMarker), /grandchild-stopped/)
    assert.match(await readMarker(secondMarker), /grandchild-stopped/)
    await assert.rejects(
      async () =>
        controller.launch({
          command: process.execPath,
        }),
      /controller is stopped/,
    )
  })

  it("proves the artifact target through the shared controller contract", async () => {
    const marker = await markerPath("artifact-probe.txt")
    const controller = createChildProcessLifetimeController()
    const run = await startChildProcessLifetimeArtifactProbe(controller, {
      fixturePath,
      markerPath: marker,
      runtimePath: process.execPath,
    })

    await controller.stopAndConfirm()

    assert.deepEqual(await finishChildProcessLifetimeArtifactProbe(run), {
      ownedDescendantStopped: true,
      ownedDescendantStable: true,
    })
  })

  it("gives the target the supplied environment as its whole environment", async (context) => {
    const controller = createChildProcessLifetimeController()
    context.after(async () => {
      await controller.stopAndConfirm()
    })
    const hostOnly = "REPO_EDU_ENV_REPLACEMENT_HOST_ONLY"
    process.env[hostOnly] = "host"
    context.after(() => {
      delete process.env[hostOnly]
    })
    const supplied = { ...process.env }
    delete supplied[hostOnly]

    const child = await controller.launch({
      command: process.execPath,
      args: ["-e", `process.stdout.write(String(process.env.${hostOnly}))`],
      env: supplied,
    })
    child.stdin.end()
    child.stdout.setEncoding("utf8")
    let output = ""
    for await (const chunk of child.stdout) {
      output += String(chunk)
    }
    await child.result

    assert.equal(output, "undefined")
  })

  it("requires absolute artifact probe paths", () => {
    assert.throws(
      () =>
        resolveChildProcessLifetimeArtifactProbeTarget({
          REPO_EDU_CHILD_LIFETIME_ARTIFACT_FIXTURE: "relative-fixture.cjs",
          REPO_EDU_CHILD_LIFETIME_ARTIFACT_MARKER: "/absolute-marker.txt",
          REPO_EDU_CHILD_LIFETIME_ARTIFACT_RUNTIME: process.execPath,
        }),
      /ARTIFACT_FIXTURE must be an absolute path/,
    )
  })

  it("refuses an already-cancelled launch before creating a tree", async () => {
    const abortController = new AbortController()
    abortController.abort()

    await assert.rejects(
      async () =>
        createChildProcessLifetimeController().launch({
          command: process.execPath,
          signal: abortController.signal,
        }),
      (error) => error instanceof DOMException && error.name === "AbortError",
    )
  })

  it("keeps launch failure in the command result", async (context) => {
    const missingExecutable = await markerPath("missing-executable")
    const controller = createChildProcessLifetimeController()
    context.after(async () => {
      await controller.stopAndConfirm()
    })

    const run = await controller.launch({
      command: missingExecutable,
    })

    await assert.rejects(
      run.result,
      (error: NodeJS.ErrnoException) => error.code === "ENOENT",
    )
    await controller.stopAndConfirm()
  })
})

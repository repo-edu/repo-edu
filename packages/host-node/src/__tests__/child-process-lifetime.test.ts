import assert from "node:assert/strict"
import { once } from "node:events"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import { createChildProcessLifetimeAdapter } from "../child-process-lifetime.js"
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

describe("child-process lifetime adapter", {
  skip: !supportsProcessGroups,
}, () => {
  it("holds the direct result until an outliving grandchild is stopped", async (context) => {
    const marker = await markerPath("outliving-grandchild.txt")
    const adapter = createChildProcessLifetimeAdapter()
    context.after(async () => {
      await adapter.stopAndConfirm()
    })
    const run = await adapter.launch({
      command: process.execPath,
      args: [fixturePath, "parent-exits", marker],
      route: "direct-adapter",
    })

    const result = await run.result
    const contentAtResult = await readMarker(marker)
    await new Promise((resolve) => setTimeout(resolve, 80))

    assert.deepEqual(result, { exitCode: 23, signal: null })
    assert.match(contentAtResult, /grandchild-started/)
    assert.match(contentAtResult, /grandchild-stopped/)
    assert.equal(await readMarker(marker), contentAtResult)
  })

  it("holds a managed helper result until its SDK child and tool descendant are stopped", async (context) => {
    const marker = await markerPath("managed-helper-descendants.txt")
    const adapter = createChildProcessLifetimeAdapter()
    context.after(async () => {
      await adapter.stopAndConfirm()
    })
    const run = await adapter.launch({
      command: process.execPath,
      args: [fixturePath, "managed-helper-exits", marker],
      route: "managed-helper",
    })

    const result = await run.result
    const contentAtResult = await readMarker(marker)
    await new Promise((resolve) => setTimeout(resolve, 80))

    assert.deepEqual(result, { exitCode: 24, signal: null })
    assert.match(contentAtResult, /sdk-child-stopped/)
    assert.match(contentAtResult, /tool-descendant-started/)
    assert.match(contentAtResult, /tool-descendant-stopped/)
    assert.equal(await readMarker(marker), contentAtResult)
  })

  it("addresses cancellation to the whole process group", async (context) => {
    const marker = await markerPath("cancelled-tree.txt")
    const adapter = createChildProcessLifetimeAdapter()
    context.after(async () => {
      await adapter.stopAndConfirm()
    })
    const controller = new AbortController()
    const run = await adapter.launch({
      command: process.execPath,
      args: [fixturePath, "tree-waits", marker],
      route: "direct-adapter",
      signal: controller.signal,
    })
    await waitUntilReady(run.stdout)

    controller.abort()
    await run.result

    const content = await readMarker(marker)
    assert.match(content, /parent-stopped/)
    assert.match(content, /grandchild-stopped/)
  })

  it("stops every registered direct and managed-helper tree", async (context) => {
    const directMarker = await markerPath("direct-tree.txt")
    const helperMarker = await markerPath("helper-tree.txt")
    const adapter = createChildProcessLifetimeAdapter()
    context.after(async () => {
      await adapter.stopAndConfirm()
    })
    const direct = await adapter.launch({
      command: process.execPath,
      args: [fixturePath, "tree-waits", directMarker],
      route: "direct-adapter",
    })
    const helper = await adapter.launch({
      command: process.execPath,
      args: [fixturePath, "tree-waits", helperMarker],
      route: "managed-helper",
    })
    await Promise.all([
      waitUntilReady(direct.stdout),
      waitUntilReady(helper.stdout),
    ])

    await adapter.stopAndConfirm()
    await Promise.all([direct.result, helper.result])
    await adapter.stopAndConfirm()

    assert.match(await readMarker(directMarker), /grandchild-stopped/)
    assert.match(await readMarker(helperMarker), /grandchild-stopped/)
    await assert.rejects(
      async () =>
        adapter.launch({
          command: process.execPath,
          route: "direct-adapter",
        }),
      /adapter is stopped/,
    )
  })

  it("proves the artifact target through the shared adapter contract", async () => {
    const marker = await markerPath("artifact-probe.txt")
    const adapter = createChildProcessLifetimeAdapter()
    const run = await startChildProcessLifetimeArtifactProbe(adapter, {
      fixturePath,
      markerPath: marker,
      runtimePath: process.execPath,
    })

    await adapter.stopAndConfirm()

    assert.deepEqual(await finishChildProcessLifetimeArtifactProbe(run), {
      directAdapterRoute: true,
      ownedDescendantStopped: true,
      ownedDescendantStable: true,
    })
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
    const controller = new AbortController()
    controller.abort()

    await assert.rejects(
      async () =>
        createChildProcessLifetimeAdapter().launch({
          command: process.execPath,
          route: "direct-adapter",
          signal: controller.signal,
        }),
      /launch was cancelled/,
    )
  })

  it("keeps launch failure in the command result", async (context) => {
    const missingExecutable = await markerPath("missing-executable")
    const adapter = createChildProcessLifetimeAdapter()
    context.after(async () => {
      await adapter.stopAndConfirm()
    })

    const run = await adapter.launch({
      command: missingExecutable,
      route: "direct-adapter",
    })

    await assert.rejects(
      run.result,
      (error: NodeJS.ErrnoException) => error.code === "ENOENT",
    )
    await adapter.stopAndConfirm()
  })
})

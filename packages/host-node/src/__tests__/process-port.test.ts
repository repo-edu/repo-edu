import assert from "node:assert/strict"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import { createChildProcessLifetimeAdapter } from "../child-process-lifetime.js"
import { createNodeProcessPort } from "../index.js"
import { createWindowsChildProcessLifetimePlatform } from "../windows-child-lifetime.js"

const childTreeFixture = fileURLToPath(
  new URL("./fixtures/child-process-tree.cjs", import.meta.url),
)
const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url))
const windowsLauncherEntryPath = join(
  repoRoot,
  "apps/desktop/resources/host-child-lifetime/windows-launcher.cjs",
)

function createProcessPort() {
  const windowsPlatformAdapter =
    process.platform === "win32"
      ? createWindowsChildProcessLifetimePlatform({
          executablePath: process.execPath,
          launcherEntryPath: windowsLauncherEntryPath,
        })
      : undefined
  const controller = createChildProcessLifetimeAdapter({
    windows: windowsPlatformAdapter,
  })
  return createNodeProcessPort(controller)
}

async function waitForMarker(path: string, pattern: RegExp): Promise<void> {
  const deadline = Date.now() + 2_000
  while (Date.now() < deadline) {
    const content = await readFile(path, "utf8").catch(() => "")
    if (pattern.test(content)) return
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error(`Timed out waiting for marker ${pattern}.`)
}

describe("createNodeProcessPort", () => {
  it("captures stdout, stderr, and non-zero exit codes", async () => {
    const processPort = createProcessPort()

    const result = await processPort.run({
      command: process.execPath,
      args: [
        "-e",
        "process.stdout.write('hello'); process.stderr.write('warn'); process.exit(7)",
      ],
    })

    assert.equal(processPort.cancellation, "best-effort")
    assert.deepStrictEqual(result, {
      exitCode: 7,
      signal: null,
      stdout: "hello",
      stderr: "warn",
    })
  })

  it("writes stdin text and closes stdin for the child process", async () => {
    const processPort = createProcessPort()

    const result = await processPort.run({
      command: process.execPath,
      args: [
        "-e",
        [
          "process.stdin.setEncoding('utf8')",
          "let data = ''",
          "process.stdin.on('data', (chunk) => { data += chunk })",
          "process.stdin.on('end', () => { process.stdout.write(data.toUpperCase()) })",
        ].join("; "),
      ],
      stdinText: "repo-edu",
    })

    assert.equal(result.exitCode, 0)
    assert.equal(result.signal, null)
    assert.equal(result.stdout, "REPO-EDU")
    assert.equal(result.stderr, "")
  })

  it("drains output pressure before reporting the terminal result", async () => {
    const processPort = createProcessPort()
    const outputSize = 512 * 1_024

    const result = await processPort.run({
      command: process.execPath,
      args: [
        "-e",
        [
          `process.stdout.write("o".repeat(${outputSize}))`,
          `process.stderr.write("e".repeat(${outputSize}))`,
        ].join("; "),
      ],
    })

    assert.equal(result.exitCode, 0)
    assert.equal(result.stdout.length, outputSize)
    assert.equal(result.stderr.length, outputSize)
  })

  it("holds the terminal result until an outliving descendant is gone", {
    skip: process.platform !== "darwin" && process.platform !== "linux",
  }, async () => {
    const root = await mkdtemp(join(tmpdir(), "repo-edu-process-port-"))
    const marker = join(root, "outliving-descendant.txt")
    try {
      const processPort = createProcessPort()
      const result = await processPort.run({
        command: process.execPath,
        args: [childTreeFixture, "parent-exits", marker],
      })

      const contentAtResult = await readFile(marker, "utf8")
      await new Promise((resolve) => setTimeout(resolve, 80))

      assert.equal(result.exitCode, 23)
      assert.match(contentAtResult, /grandchild-stopped/)
      assert.equal(await readFile(marker, "utf8"), contentAtResult)
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })

  it("honors abort requests with best-effort termination", async () => {
    const processPort = createProcessPort()
    const controller = new AbortController()

    const runPromise = processPort.run({
      command: process.execPath,
      args: [
        "-e",
        [
          "process.on('SIGTERM', () => process.exit(0))",
          "setInterval(() => {}, 1_000)",
        ].join("; "),
      ],
      signal: controller.signal,
    })

    setTimeout(() => {
      controller.abort()
    }, 50)

    const startedAt = Date.now()
    const result = await runPromise
    const elapsedMs = Date.now() - startedAt

    assert.equal(processPort.cancellation, "best-effort")
    const exitedViaSignalHandler =
      result.exitCode === 0 && result.signal === null
    const terminatedBySignal =
      result.exitCode === null && result.signal === "SIGTERM"
    assert.ok(exitedViaSignalHandler || terminatedBySignal)
    assert.ok(elapsedMs < 1_000)
  })

  it("addresses cancellation to a direct target and its descendant", {
    skip: process.platform !== "darwin" && process.platform !== "linux",
  }, async () => {
    const root = await mkdtemp(join(tmpdir(), "repo-edu-process-port-"))
    const marker = join(root, "cancelled-descendant.txt")
    const controller = new AbortController()
    try {
      const processPort = createProcessPort()
      const run = processPort.run({
        command: process.execPath,
        args: [childTreeFixture, "tree-waits", marker],
        signal: controller.signal,
      })
      await waitForMarker(marker, /grandchild-started/)

      controller.abort()
      await run

      const contentAtResult = await readFile(marker, "utf8")
      await new Promise((resolve) => setTimeout(resolve, 80))
      assert.match(contentAtResult, /parent-stopped/)
      assert.match(contentAtResult, /grandchild-stopped/)
      assert.equal(await readFile(marker, "utf8"), contentAtResult)
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })
})

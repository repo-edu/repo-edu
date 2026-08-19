import assert from "node:assert/strict"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { PassThrough, Readable, Writable } from "node:stream"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import type {
  ChildProcessLifetimeController,
  ChildProcessLifetimeLaunch,
  ChildProcessLifetimePlatformAdapter,
  OwnedChildProcessTree,
} from "../child-process-lifetime.js"
import {
  ChildProcessTreeUnconfirmedError,
  createChildProcessLifetimeController,
} from "../child-process-lifetime.js"
import { createNodeLlmTextClient, launchNodeCodexSdkHost } from "../llm.js"

const claudeTreeFixture = fileURLToPath(
  new URL("./fixtures/claude-cli-tree.cjs", import.meta.url),
)

const claudeSpec = {
  provider: "claude" as const,
  family: "sonnet",
  modelId: "claude-sonnet-4-6",
  effort: "max" as const,
}

describe("createNodeLlmTextClient", () => {
  it("routes the Claude CLI through one controller-owned tree", async () => {
    const launches: ChildProcessLifetimeLaunch[] = []
    let prompt = ""
    const controller: ChildProcessLifetimeController = {
      async launch<TCompleted, TFailed>(request: ChildProcessLifetimeLaunch) {
        launches.push(request)
        const outcome = Promise.withResolvers<{
          readonly outcome: "completed"
          readonly targetResult: { readonly exitCode: 0; readonly signal: null }
          readonly value: undefined
        }>()
        const owned = {
          stdin: new Writable({
            write(chunk, _encoding, done) {
              prompt += String(chunk)
              done()
            },
          }),
          stdout: Readable.from([
            '{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}}\n',
            '{"type":"result","subtype":"success","result":"Hi","usage":{"input_tokens":1,"output_tokens":2}}\n',
          ]),
          stderr: Readable.from([]),
          outcome: outcome.promise,
          requestCancellation() {},
          reportFailure() {},
          reportProofLost() {},
          reportResult() {
            outcome.resolve({
              outcome: "completed",
              targetResult: { exitCode: 0, signal: null },
              value: undefined,
            })
          },
          reportWorkStarted() {},
        }
        return owned as unknown as OwnedChildProcessTree<TCompleted, TFailed>
      },
      async stopAndConfirm() {},
    }
    const client = createNodeLlmTextClient(
      controller,
      { claude: { authMode: "subscription", env: { SAFE: "1" } } },
      { claudeCliExecutable: "/bin/claude" },
    )

    const result = await client.generateText({
      spec: claudeSpec,
      prompt: "Reply ok.",
    })

    assert.equal(launches.length, 1)
    assert.equal(launches[0]?.command, "/bin/claude")
    assert.equal(launches[0]?.env?.SAFE, "1")
    assert.equal(prompt, "Reply ok.")
    assert.equal(result.reply, "Hi")
  })

  it("holds the Claude result until an outliving descendant is gone", {
    skip: process.platform !== "darwin" && process.platform !== "linux",
  }, async () => {
    const root = await mkdtemp(join(tmpdir(), "repo-edu-claude-tree-"))
    const marker = join(root, "outliving-descendant.txt")
    try {
      const client = createNodeLlmTextClient(
        createChildProcessLifetimeController({
          diagnosticSink() {},
          warnUnconfirmedTree(error): never {
            throw error
          },
        }),
        {
          claude: {
            authMode: "subscription",
            env: { REPO_EDU_CLAUDE_TREE_MARKER: marker },
          },
        },
        { claudeCliExecutable: claudeTreeFixture },
      )

      const result = await client.generateText({
        spec: claudeSpec,
        prompt: "Reply ok.",
      })
      const contentAtResult = await readFile(marker, "utf8")
      await new Promise((resolve) => setTimeout(resolve, 80))

      assert.equal(result.reply, "Hi")
      assert.match(contentAtResult, /grandchild-stopped/)
      assert.equal(await readFile(marker, "utf8"), contentAtResult)
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })

  it("ends a Claude stream when confirmation expiry returns unknown", async () => {
    const terminal = Promise.withResolvers<{
      readonly exitCode: number
      readonly signal: null
    }>()
    const stdin = new PassThrough()
    const stdout = new PassThrough()
    const stderr = new PassThrough()
    const adapter: ChildProcessLifetimePlatformAdapter = {
      async launch() {
        return {
          stdin,
          stdout,
          stderr,
          result: terminal.promise,
          async stopAndConfirm() {
            throw new ChildProcessTreeUnconfirmedError("not gone")
          },
        }
      },
    }
    const client = createNodeLlmTextClient(
      createChildProcessLifetimeController({
        diagnosticSink() {},
        warnUnconfirmedTree() {},
        runtimePlatform: "win32",
        windowsAdapter: adapter,
      }),
      { claude: { authMode: "subscription", env: {} } },
      { claudeCliExecutable: "/bin/claude" },
    )
    const run = client.generateText({
      spec: claudeSpec,
      prompt: "Reply ok.",
    })
    await new Promise((resolve) => setImmediate(resolve))

    terminal.resolve({ exitCode: 0, signal: null })

    await assert.rejects(run, /outside outcome is unknown/i)
    assert.equal(stdin.destroyed, true)
    assert.equal(stdout.destroyed, true)
    assert.equal(stderr.destroyed, true)
  })

  it("starts Codex through the Codex SDK host process with a complete Node-mode environment", async () => {
    const launches: ChildProcessLifetimeLaunch[] = []
    const parentValue = process.env.REPO_EDU_CODEX_SDK_HOST_PARENT
    process.env.REPO_EDU_CODEX_SDK_HOST_PARENT = "inherited"
    try {
      const controller: ChildProcessLifetimeController = {
        async launch<TCompleted, TFailed>(request: ChildProcessLifetimeLaunch) {
          launches.push(request)
          const stdin = new PassThrough()
          const stdout = new PassThrough()
          const stderr = new PassThrough()
          const outcome = Promise.withResolvers<
            { readonly outcome: "unknown" } | { readonly outcome: "cancelled" }
          >()
          const owned = {
            stdin,
            stdout,
            stderr,
            outcome: outcome.promise,
            requestCancellation() {
              outcome.resolve({ outcome: "cancelled" })
            },
            reportFailure() {},
            reportProofLost() {
              outcome.resolve({ outcome: "unknown" })
            },
            reportResult() {},
            reportWorkStarted() {},
          }
          return owned as unknown as OwnedChildProcessTree<TCompleted, TFailed>
        },
        async stopAndConfirm() {},
      }
      await launchNodeCodexSdkHost(
        controller,
        {
          command: "/fixed/electron",
          args: ["/fixed/codex-sdk-host.js"],
          env: { REPO_EDU_CODEX_SDK_HOST_OVERRIDE: "override" },
          runAsNode: true,
        },
        new AbortController().signal,
      )

      assert.equal(launches.length, 1)
      assert.equal(launches[0]?.command, "/fixed/electron")
      assert.deepEqual(launches[0]?.args, ["/fixed/codex-sdk-host.js"])
      assert.equal(launches[0]?.signal?.aborted, false)
      assert.equal(launches[0]?.proof, "reported")
      assert.equal(
        launches[0]?.env?.REPO_EDU_CODEX_SDK_HOST_PARENT,
        "inherited",
      )
      assert.equal(
        launches[0]?.env?.REPO_EDU_CODEX_SDK_HOST_OVERRIDE,
        "override",
      )
      assert.equal(launches[0]?.env?.ELECTRON_RUN_AS_NODE, "1")
    } finally {
      if (parentValue === undefined) {
        delete process.env.REPO_EDU_CODEX_SDK_HOST_PARENT
      } else {
        process.env.REPO_EDU_CODEX_SDK_HOST_PARENT = parentValue
      }
    }
  })
})

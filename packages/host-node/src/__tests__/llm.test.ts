import assert from "node:assert/strict"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { PassThrough, Readable, Writable } from "node:stream"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import type {
  ChildProcessLifetimeAdapter,
  ChildProcessLifetimeLaunch,
} from "../child-process-lifetime.js"
import { createChildProcessLifetimeAdapter } from "../child-process-lifetime.js"
import { createNodeLlmTextClient } from "../llm.js"

const claudeTreeFixture = fileURLToPath(
  new URL("./fixtures/claude-cli-tree.cjs", import.meta.url),
)

const claudeSpec = {
  provider: "claude" as const,
  family: "sonnet",
  modelId: "claude-sonnet-4-6",
  effort: "max" as const,
}

const codexSpec = {
  provider: "codex" as const,
  family: "gpt-5.4",
  modelId: "gpt-5.4",
  effort: "medium" as const,
}

describe("createNodeLlmTextClient", () => {
  it("routes the Claude CLI through one direct adapter-owned tree", async () => {
    const launches: ChildProcessLifetimeLaunch[] = []
    let prompt = ""
    let stopConfirmations = 0
    const lifetime: ChildProcessLifetimeAdapter = {
      async launch(request) {
        launches.push(request)
        return {
          route: request.route,
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
          result: Promise.resolve({ exitCode: 0, signal: null }),
          async stopAndConfirm() {
            stopConfirmations++
          },
        }
      },
      async stopAndConfirm() {},
    }
    const client = createNodeLlmTextClient(
      lifetime,
      { claude: { authMode: "subscription", env: { SAFE: "1" } } },
      { claudeCliExecutable: "/bin/claude" },
    )

    const result = await client.generateText({
      spec: claudeSpec,
      prompt: "Reply ok.",
    })

    assert.equal(launches.length, 1)
    assert.equal(launches[0]?.command, "/bin/claude")
    assert.equal(launches[0]?.route, "direct-adapter")
    assert.equal(launches[0]?.env?.SAFE, "1")
    assert.equal(prompt, "Reply ok.")
    assert.equal(stopConfirmations, 1)
    assert.equal(result.reply, "Hi")
  })

  it("holds the Claude result until an outliving descendant is gone", {
    skip: process.platform !== "darwin" && process.platform !== "linux",
  }, async () => {
    const root = await mkdtemp(join(tmpdir(), "repo-edu-claude-tree-"))
    const marker = join(root, "outliving-descendant.txt")
    try {
      const client = createNodeLlmTextClient(
        createChildProcessLifetimeAdapter(),
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

  it("starts Codex through the managed helper with a complete Node-mode environment", async () => {
    const launches: ChildProcessLifetimeLaunch[] = []
    let stopConfirmations = 0
    const parentValue = process.env.REPO_EDU_CODEX_HELPER_PARENT
    process.env.REPO_EDU_CODEX_HELPER_PARENT = "inherited"
    try {
      const lifetime: ChildProcessLifetimeAdapter = {
        async launch(request) {
          launches.push(request)
          const stdin = new PassThrough()
          const stdout = new PassThrough()
          const stderr = new PassThrough()
          const result = new Promise<{ exitCode: number; signal: null }>(
            (resolve) => {
              let writes = 0
              stdin.on("data", () => {
                writes += 1
                if (writes === 2) {
                  setImmediate(() => resolve({ exitCode: 1, signal: null }))
                }
              })
            },
          )
          return {
            route: request.route,
            stdin,
            stdout,
            stderr,
            result,
            async stopAndConfirm() {
              stopConfirmations += 1
              if (!stdin.writableEnded) stdin.end()
              if (!stdout.destroyed) stdout.destroy()
              await result
            },
          }
        },
        async stopAndConfirm() {},
      }
      const client = createNodeLlmTextClient(lifetime, undefined, {
        codexHelper: {
          command: "/fixed/electron",
          args: ["/fixed/codex-helper.js"],
          env: { REPO_EDU_CODEX_HELPER_OVERRIDE: "override" },
          runAsNode: true,
        },
      })

      await assert.rejects(
        () => client.generateText({ spec: codexSpec, prompt: "Reply ok." }),
        /outside outcome is unknown/,
      )

      assert.equal(launches.length, 1)
      assert.equal(launches[0]?.command, "/fixed/electron")
      assert.deepEqual(launches[0]?.args, ["/fixed/codex-helper.js"])
      assert.equal(launches[0]?.route, "managed-helper")
      assert.equal(launches[0]?.signal?.aborted, false)
      assert.equal(launches[0]?.env?.REPO_EDU_CODEX_HELPER_PARENT, "inherited")
      assert.equal(launches[0]?.env?.REPO_EDU_CODEX_HELPER_OVERRIDE, "override")
      assert.equal(launches[0]?.env?.ELECTRON_RUN_AS_NODE, "1")
      assert.equal(stopConfirmations, 1)
    } finally {
      if (parentValue === undefined) {
        delete process.env.REPO_EDU_CODEX_HELPER_PARENT
      } else {
        process.env.REPO_EDU_CODEX_HELPER_PARENT = parentValue
      }
    }
  })
})

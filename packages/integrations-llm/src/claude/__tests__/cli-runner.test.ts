import assert from "node:assert/strict"
import { Readable, Writable } from "node:stream"
import { describe, it } from "node:test"
import {
  LlmError,
  type LlmStreamEvent,
} from "@repo-edu/integrations-llm-contract"
import { resolveClaudeAuth } from "../auth"
import {
  buildClaudeCliArgs,
  buildClaudeCliSpawnOptions,
  type ClaudeCliSpawn,
  findClaudeCliExecutable,
  runClaudeCliStream,
} from "../cli-runner"

const claudeSpec = {
  provider: "claude" as const,
  family: "sonnet",
  modelId: "claude-sonnet-4-6",
  effort: "max" as const,
}

type FakeSpawnOptions = {
  exitCode?: number
  exitSignal?: string | null
}

function fakeSpawn(
  stdoutChunks: AsyncIterable<string> | Iterable<string>,
  stderrChunks: AsyncIterable<string> | Iterable<string> = [],
  fakeOptions: FakeSpawnOptions = {},
) {
  const calls: {
    command: string
    args: readonly string[]
    env: NodeJS.ProcessEnv | undefined
    shell: boolean | string | undefined
    stdin: string
    killed: boolean
  }[] = []
  const spawn: ClaudeCliSpawn = (command, args, spawnOptions) => {
    const call = {
      command,
      args,
      env: spawnOptions.env,
      shell: spawnOptions.shell,
      stdin: "",
      killed: false,
    }
    calls.push(call)
    const stdin = new Writable({
      write(chunk, _encoding, callback) {
        call.stdin += String(chunk)
        callback()
      },
    })
    return {
      stdin,
      stdout: Readable.from(stdoutChunks),
      stderr: Readable.from(stderrChunks),
      kill() {
        call.killed = true
        return true
      },
      once(event, listener: unknown) {
        if (event === "exit" || event === "close") {
          queueMicrotask(() =>
            (listener as (code: number | null, signal: string | null) => void)(
              fakeOptions.exitCode ?? 0,
              fakeOptions.exitSignal ?? null,
            ),
          )
        }
        return undefined
      },
    }
  }
  return { spawn, calls }
}

async function drainCliStream(stdoutChunks: string[]): Promise<void> {
  const { spawn } = fakeSpawn(stdoutChunks)
  for await (const _event of runClaudeCliStream(
    {
      spec: claudeSpec,
      prompt: "Reply ok.",
      executable: "/bin/claude",
      spawn,
    },
    { authMode: "subscription", childEnv: {} },
  )) {
    // Drain stream.
  }
}

function isClaudeToolGuardrail(error: unknown): boolean {
  return (
    error instanceof LlmError &&
    error.kind === "guardrail" &&
    error.context.provider === "claude" &&
    error.context.authMode === "subscription"
  )
}

describe("buildClaudeCliArgs", () => {
  it("constructs tool-free stream-json argv with native effort", () => {
    assert.deepStrictEqual(buildClaudeCliArgs(claudeSpec), [
      "-p",
      "--verbose",
      "--output-format",
      "stream-json",
      "--include-partial-messages",
      "--model",
      "claude-sonnet-4-6",
      "--tools",
      "",
      "--strict-mcp-config",
      "--effort",
      "max",
    ])
  })
})

describe("buildClaudeCliSpawnOptions", () => {
  it("runs Windows cmd shims through a shell", () => {
    assert.equal(
      buildClaudeCliSpawnOptions("C:\\Users\\me\\bin\\claude.cmd", {}, "win32")
        .shell,
      true,
    )
    assert.equal(
      buildClaudeCliSpawnOptions("C:\\Users\\me\\bin\\claude.exe", {}, "win32")
        .shell,
      false,
    )
  })
})

describe("findClaudeCliExecutable", () => {
  it("returns null when PATH and fallback locations do not contain claude", () => {
    assert.equal(
      findClaudeCliExecutable({
        PATH: "",
        HOME: "/definitely/not/repo-edu-home",
      }),
      null,
    )
  })
})

describe("runClaudeCliStream", () => {
  it("parses stream-json lines and uses sanitized subscription env", async () => {
    const { spawn, calls } = fakeSpawn([
      '{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}}\n',
      '{"type":"result","subtype":"success","result":"Hi","usage":{"input_tokens":1,"output_tokens":2}}\n',
    ])

    const resolved = resolveClaudeAuth({
      authMode: "subscription",
      env: { ANTHROPIC_API_KEY: "sk-leak", SAFE: "1" },
    })
    assert.equal(resolved.authMode, "subscription")

    const events: LlmStreamEvent[] = []
    for await (const event of runClaudeCliStream(
      {
        spec: claudeSpec,
        prompt: "Reply ok.",
        executable: "/bin/claude",
        spawn,
      },
      resolved,
    )) {
      events.push(event)
    }

    assert.equal(calls[0]?.stdin, "Reply ok.")
    assert.equal(calls[0]?.env?.ANTHROPIC_API_KEY, undefined)
    assert.equal(calls[0]?.env?.SAFE, "1")
    assert.deepStrictEqual(
      events.filter((event) => event.kind === "text-delta"),
      [{ kind: "text-delta", text: "Hi" }],
    )
    const done = events.find((event) => event.kind === "done")
    assert.equal(done?.usage.inputTokens, 1)
    assert.equal(done?.usage.outputTokens, 2)
    assert.equal(done?.usage.authMode, "subscription")
  })

  it("maps missing executable to LlmError auth", async () => {
    const savedPath = process.env.PATH
    const savedHome = process.env.HOME
    process.env.PATH = ""
    process.env.HOME = "/definitely/not/repo-edu-home"
    try {
      await assert.rejects(
        async () => {
          for await (const _event of runClaudeCliStream(
            { spec: claudeSpec, prompt: "x" },
            { authMode: "subscription", childEnv: {} },
          )) {
            // Drain stream.
          }
        },
        (error: unknown) =>
          error instanceof LlmError &&
          error.kind === "auth" &&
          error.context.provider === "claude" &&
          error.context.authMode === "subscription",
      )
    } finally {
      if (savedPath === undefined) {
        delete process.env.PATH
      } else {
        process.env.PATH = savedPath
      }
      if (savedHome === undefined) {
        delete process.env.HOME
      } else {
        process.env.HOME = savedHome
      }
    }
  })

  it("waits for delayed auth stderr before classifying CLI exit failures", async () => {
    const delayedStderr = (async function* () {
      await new Promise((resolve) => setImmediate(resolve))
      yield "Please log in to Claude."
    })()
    const { spawn } = fakeSpawn([], delayedStderr, { exitCode: 1 })

    await assert.rejects(
      async () => {
        for await (const _event of runClaudeCliStream(
          {
            spec: claudeSpec,
            prompt: "Reply ok.",
            executable: "/bin/claude",
            spawn,
          },
          { authMode: "subscription", childEnv: {} },
        )) {
          // Drain stream.
        }
      },
      (error: unknown) =>
        error instanceof LlmError &&
        error.kind === "auth" &&
        error.message.includes("Please log in"),
    )
  })

  it("does not emit done before a failed CLI close is classified", async () => {
    const { spawn } = fakeSpawn(
      [
        '{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}}\n',
        '{"type":"result","subtype":"success","result":"Hi","usage":{"input_tokens":1,"output_tokens":2}}\n',
      ],
      ["Unexpected CLI failure."],
      { exitCode: 1 },
    )
    const events: LlmStreamEvent[] = []

    await assert.rejects(
      async () => {
        for await (const event of runClaudeCliStream(
          {
            spec: claudeSpec,
            prompt: "Reply ok.",
            executable: "/bin/claude",
            spawn,
          },
          { authMode: "subscription", childEnv: {} },
        )) {
          events.push(event)
        }
      },
      (error: unknown) =>
        error instanceof LlmError &&
        error.kind === "other" &&
        error.message.includes("Unexpected CLI failure"),
    )
    assert.equal(
      events.some((event) => event.kind === "done"),
      false,
    )
  })

  it("rejects pre-aborted requests without spawning Claude", async () => {
    const { spawn, calls } = fakeSpawn([])
    const controller = new AbortController()
    controller.abort()

    await assert.rejects(
      async () => {
        for await (const _event of runClaudeCliStream(
          {
            spec: claudeSpec,
            prompt: "Reply ok.",
            executable: "/bin/claude",
            signal: controller.signal,
            spawn,
          },
          { authMode: "subscription", childEnv: {} },
        )) {
          // Drain stream.
        }
      },
      (error: unknown) =>
        error instanceof DOMException && error.name === "AbortError",
    )
    assert.equal(calls.length, 0)
  })

  it("kills the Claude child and preserves AbortError when cancelled", async () => {
    const { spawn, calls } = fakeSpawn([])
    const controller = new AbortController()

    await assert.rejects(
      async () => {
        for await (const _event of runClaudeCliStream(
          {
            spec: claudeSpec,
            prompt: "Reply ok.",
            executable: "/bin/claude",
            signal: controller.signal,
            spawn,
          },
          { authMode: "subscription", childEnv: {} },
        )) {
          controller.abort()
        }
      },
      (error: unknown) =>
        error instanceof DOMException && error.name === "AbortError",
    )
    assert.equal(calls[0]?.killed, true)
  })

  it("kills the Claude child when the consumer stops reading early", async () => {
    const { spawn, calls } = fakeSpawn([
      '{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}}\n',
      '{"type":"result","subtype":"success","result":"Hi","usage":{"input_tokens":1,"output_tokens":2}}\n',
    ])
    const iterator = runClaudeCliStream(
      {
        spec: claudeSpec,
        prompt: "Reply ok.",
        executable: "/bin/claude",
        spawn,
      },
      { authMode: "subscription", childEnv: {} },
    )[Symbol.asyncIterator]()

    await iterator.next()
    await iterator.return?.()

    assert.equal(calls[0]?.killed, true)
  })

  it("rejects stream-json tool block starts as guardrail failures", async () => {
    const { spawn, calls } = fakeSpawn([
      '{"type":"stream_event","event":{"type":"content_block_start","content_block":{"type":"tool_use","name":"Read","input":{"file_path":"README.md"}}}}\n',
    ])
    await assert.rejects(async () => {
      for await (const _event of runClaudeCliStream(
        {
          spec: claudeSpec,
          prompt: "Reply ok.",
          executable: "/bin/claude",
          spawn,
        },
        { authMode: "subscription", childEnv: {} },
      )) {
        // Drain stream.
      }
    }, isClaudeToolGuardrail)
    assert.equal(calls[0]?.killed, true)
  })

  it("rejects assistant tool use messages as guardrail failures", async () => {
    await assert.rejects(
      () =>
        drainCliStream([
          '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_1","name":"Read","input":{"file_path":"README.md"}}]}}\n',
        ]),
      isClaudeToolGuardrail,
    )
  })

  it("rejects user tool result messages as guardrail failures", async () => {
    await assert.rejects(
      () =>
        drainCliStream([
          '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"toolu_1","content":"file contents"}]}}\n',
        ]),
      isClaudeToolGuardrail,
    )
  })

  it("rejects tool progress messages as guardrail failures", async () => {
    await assert.rejects(
      () =>
        drainCliStream([
          '{"type":"tool_progress","tool_name":"Read","elapsed_time_seconds":1}\n',
        ]),
      isClaudeToolGuardrail,
    )
  })
})

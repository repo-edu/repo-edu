import assert from "node:assert/strict"
import { Readable, Writable } from "node:stream"
import { describe, it } from "node:test"
import { LlmError } from "@repo-edu/integrations-llm-contract"
import { resolveClaudeAuth } from "../auth"
import {
  buildClaudeCliArgs,
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

function fakeSpawn(stdoutChunks: string[], stderrChunks: string[] = []) {
  const calls: {
    command: string
    args: readonly string[]
    env: NodeJS.ProcessEnv | undefined
    stdin: string
    killed: boolean
  }[] = []
  const spawn: ClaudeCliSpawn = (command, args, options) => {
    const call = {
      command,
      args,
      env: options.env,
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
        if (event === "exit") {
          queueMicrotask(() =>
            (listener as (code: number | null, signal: string | null) => void)(
              0,
              null,
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

    const events = []
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

  it("rejects stream-json tool block starts as guardrail failures", async () => {
    await assert.rejects(
      () =>
        drainCliStream([
          '{"type":"stream_event","event":{"type":"content_block_start","content_block":{"type":"tool_use","name":"Read","input":{"file_path":"README.md"}}}}\n',
        ]),
      isClaudeToolGuardrail,
    )
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

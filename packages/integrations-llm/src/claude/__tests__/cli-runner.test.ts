import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { PassThrough, Readable, Writable } from "node:stream"
import { describe, it } from "node:test"
import {
  LlmError,
  type LlmStreamEvent,
} from "@repo-edu/integrations-llm-contract"
import { resolveClaudeAuth } from "../auth"
import type { ClaudeCliLaunch, ClaudeCliOutcome } from "../cli-process"
import {
  buildClaudeCliArgs,
  buildClaudeCliLaunchOptions,
  findClaudeCliExecutable,
  runClaudeCliStream,
} from "../cli-runner"

const claudeSpec = {
  provider: "claude" as const,
  family: "sonnet",
  modelId: "claude-sonnet-4-6",
  effort: "max" as const,
}

type FakeLaunchOptions = {
  exitCode?: number
  exitSignal?: string | null
  stdinWriteError?: Error
}

function fakeLaunch(
  stdoutChunks: AsyncIterable<string> | Iterable<string>,
  stderrChunks: AsyncIterable<string> | Iterable<string> = [],
  fakeOptions: FakeLaunchOptions = {},
) {
  const calls: {
    command: string
    args: readonly string[]
    cwd: string | URL | undefined
    env: NodeJS.ProcessEnv | undefined
    shell: boolean | string | undefined
    stdin: string
    stopped: boolean
  }[] = []
  const launch: ClaudeCliLaunch = async (request) => {
    const call = {
      command: request.command,
      args: request.args,
      cwd: request.cwd,
      env: request.env,
      shell: request.shell,
      stdin: "",
      stopped: false,
    }
    calls.push(call)
    const stdin = new Writable({
      write(chunk, _encoding, callback) {
        call.stdin += String(chunk)
        if (fakeOptions.stdinWriteError) {
          callback(fakeOptions.stdinWriteError)
          return
        }
        callback()
      },
    })
    const outcome = Promise.withResolvers<ClaudeCliOutcome>()
    const targetResult = {
      exitCode: fakeOptions.exitCode ?? 0,
      signal: fakeOptions.exitSignal ?? null,
    }
    return {
      stdin,
      stdout: Readable.from(stdoutChunks),
      stderr: Readable.from(stderrChunks),
      outcome: outcome.promise,
      requestCancellation() {
        call.stopped = true
        outcome.resolve({ outcome: "cancelled" })
      },
      reportFailure() {},
      reportProofLost() {
        call.stopped = true
        outcome.resolve({ outcome: "unknown" })
      },
      reportResult(result) {
        call.stopped = true
        outcome.resolve({ ...result, targetResult })
      },
      reportWorkStarted() {},
    }
  }
  return { launch, calls }
}

async function drainCliStream(stdoutChunks: string[]): Promise<void> {
  const { launch } = fakeLaunch(stdoutChunks)
  for await (const _event of runClaudeCliStream(
    {
      spec: claudeSpec,
      prompt: "Reply ok.",
      executable: "/bin/claude",
      launch,
    },
    { authMode: "subscription", childEnv: {} },
  )) {
    // Drain stream.
  }
}

type LiveCliProcess = {
  launch: ClaudeCliLaunch
  stdout: PassThrough
  errorOutput: PassThrough
  result: PromiseWithResolvers<{
    exitCode: number | null
    signal: string | null
  }>
  stopped(): boolean
}

// Streams the test opens and closes itself, so a turn can end while the error
// output is still being read.
function liveLaunch(): LiveCliProcess {
  const stdout = new PassThrough()
  const errorOutput = new PassThrough()
  const result = Promise.withResolvers<{
    exitCode: number | null
    signal: string | null
  }>()
  let targetResult = {
    exitCode: 0 as number | null,
    signal: null as string | null,
  }
  void result.promise.then((value) => {
    targetResult = value
  })
  const outcome = Promise.withResolvers<ClaudeCliOutcome>()
  let stopped = false
  const stopStreams = () => {
    stdout.destroy()
    errorOutput.destroy()
  }
  const launch: ClaudeCliLaunch = async () => ({
    stdin: new Writable({
      write(_chunk, _encoding, callback) {
        callback()
      },
    }),
    stdout,
    stderr: errorOutput,
    outcome: outcome.promise,
    requestCancellation() {
      stopped = true
      stopStreams()
      outcome.resolve({ outcome: "cancelled" })
    },
    reportFailure() {},
    reportProofLost() {
      stopped = true
      stopStreams()
      outcome.resolve({ outcome: "unknown" })
    },
    reportResult(reported) {
      stopped = true
      stopStreams()
      outcome.resolve({ ...reported, targetResult })
    },
    reportWorkStarted() {},
  })
  return { launch, stdout, errorOutput, result, stopped: () => stopped }
}

async function withoutUnhandledRejections(
  run: () => Promise<void>,
): Promise<void> {
  const seen: unknown[] = []
  const onUnhandled = (reason: unknown) => {
    seen.push(reason)
  }
  process.on("unhandledRejection", onUnhandled)
  try {
    await run()
    await new Promise((resolve) => setImmediate(resolve))
    await new Promise((resolve) => setImmediate(resolve))
  } finally {
    process.off("unhandledRejection", onUnhandled)
  }
  assert.equal(
    seen.length,
    0,
    `unhandled rejections: ${seen.map((reason) => String(reason)).join(", ")}`,
  )
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
      "--no-session-persistence",
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

describe("buildClaudeCliLaunchOptions", () => {
  it("runs Windows cmd shims through a shell", () => {
    assert.equal(
      buildClaudeCliLaunchOptions("C:\\Users\\me\\bin\\claude.cmd", {}, "win32")
        .shell,
      true,
    )
    assert.equal(
      buildClaudeCliLaunchOptions("C:\\Users\\me\\bin\\claude.exe", {}, "win32")
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
    const { launch, calls } = fakeLaunch([
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
        launch,
      },
      resolved,
    )) {
      events.push(event)
    }

    assert.equal(calls[0]?.stdin, "Reply ok.")
    assert.equal(typeof calls[0]?.cwd, "string")
    assert.match(String(calls[0]?.cwd), /repo-edu-claude-/)
    assert.equal(existsSync(String(calls[0]?.cwd)), false)
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
    const { launch } = fakeLaunch([], delayedStderr, { exitCode: 1 })

    await assert.rejects(
      async () => {
        for await (const _event of runClaudeCliStream(
          {
            spec: claudeSpec,
            prompt: "Reply ok.",
            executable: "/bin/claude",
            launch,
          },
          { authMode: "subscription", childEnv: {} },
        )) {
          // Drain stream.
        }
      },
      (error: unknown) =>
        error instanceof LlmError &&
        error.kind === "other" &&
        error.message.includes("Please log in"),
    )
  })

  it("maps silent subscription CLI exit code 1 to login guidance", async () => {
    const { launch } = fakeLaunch([], [], { exitCode: 1 })

    await assert.rejects(
      async () => {
        for await (const _event of runClaudeCliStream(
          {
            spec: claudeSpec,
            prompt: "Reply ok.",
            executable: "/bin/claude",
            launch,
          },
          { authMode: "subscription", childEnv: {} },
        )) {
          // Drain stream.
        }
      },
      (error: unknown) =>
        error instanceof LlmError &&
        error.kind === "auth" &&
        error.message.includes("Claude CLI is not logged in") &&
        error.message.includes("claude auth login"),
    )
  })

  it("keeps the login guidance when the error-output read also fails", async () => {
    const readFailure = new Error("error output read failed")
    const live = liveLaunch()
    let failure: unknown

    await withoutUnhandledRejections(async () => {
      const drained = (async () => {
        try {
          for await (const _event of runClaudeCliStream(
            {
              spec: claudeSpec,
              prompt: "Reply ok.",
              executable: "/bin/claude",
              launch: live.launch,
            },
            { authMode: "subscription", childEnv: {} },
          )) {
            // Drain stream.
          }
        } catch (error) {
          failure = error
        }
      })()

      setImmediate(() => {
        live.stdout.end()
        live.result.resolve({ exitCode: 1, signal: null })
        live.errorOutput.destroy(readFailure)
      })
      await drained
    })

    assert.ok(failure instanceof LlmError)
    assert.equal(failure.kind, "auth")
    assert.ok(failure.message.includes("claude auth login"))
    assert.equal(failure.cause, undefined)
    assert.equal(live.stopped(), true)
  })

  it("uses the terminal stream result instead of reclassifying process exit", async () => {
    const { launch } = fakeLaunch(
      [
        '{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}}\n',
        '{"type":"result","subtype":"success","result":"Hi","usage":{"input_tokens":1,"output_tokens":2}}\n',
      ],
      ["Unexpected CLI failure."],
      { exitCode: 1 },
    )
    const events: LlmStreamEvent[] = []

    for await (const event of runClaudeCliStream(
      {
        spec: claudeSpec,
        prompt: "Reply ok.",
        executable: "/bin/claude",
        launch,
      },
      { authMode: "subscription", childEnv: {} },
    )) {
      events.push(event)
    }
    assert.equal(
      events.some((event) => event.kind === "done"),
      true,
    )
  })

  it("keeps stdin EPIPE inside CLI failure classification", async () => {
    const writeError = new Error("write EPIPE") as Error & { code: string }
    writeError.code = "EPIPE"
    const { launch, calls } = fakeLaunch([], ["CLI rejected prompt."], {
      exitCode: 1,
      stdinWriteError: writeError,
    })

    await assert.rejects(
      async () => {
        for await (const _event of runClaudeCliStream(
          {
            spec: claudeSpec,
            prompt: "x".repeat(1_000),
            executable: "/bin/claude",
            launch,
          },
          { authMode: "subscription", childEnv: {} },
        )) {
          // Drain stream.
        }
      },
      (error: unknown) =>
        error instanceof LlmError &&
        error.kind === "other" &&
        error.message.includes("write EPIPE"),
    )
    assert.equal(calls[0]?.stopped, true)
  })

  it("rejects pre-aborted requests without spawning Claude", async () => {
    const { launch, calls } = fakeLaunch([])
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
            launch,
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
    const { launch, calls } = fakeLaunch([])
    const controller = new AbortController()

    await assert.rejects(
      async () => {
        for await (const _event of runClaudeCliStream(
          {
            spec: claudeSpec,
            prompt: "Reply ok.",
            executable: "/bin/claude",
            signal: controller.signal,
            launch,
          },
          { authMode: "subscription", childEnv: {} },
        )) {
          controller.abort()
        }
      },
      (error: unknown) =>
        error instanceof DOMException && error.name === "AbortError",
    )
    assert.equal(calls[0]?.stopped, true)
  })

  it("kills the Claude child when the consumer stops reading early", async () => {
    const { launch, calls } = fakeLaunch([
      '{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}}\n',
      '{"type":"result","subtype":"success","result":"Hi","usage":{"input_tokens":1,"output_tokens":2}}\n',
    ])
    const iterator = runClaudeCliStream(
      {
        spec: claudeSpec,
        prompt: "Reply ok.",
        executable: "/bin/claude",
        launch,
      },
      { authMode: "subscription", childEnv: {} },
    )[Symbol.asyncIterator]()

    await iterator.next()
    await iterator.return?.()

    assert.equal(calls[0]?.stopped, true)
  })

  it("rejects stream-json tool block starts as guardrail failures", async () => {
    const { launch, calls } = fakeLaunch([
      '{"type":"stream_event","event":{"type":"content_block_start","content_block":{"type":"tool_use","name":"Read","input":{"file_path":"README.md"}}}}\n',
    ])
    await assert.rejects(async () => {
      for await (const _event of runClaudeCliStream(
        {
          spec: claudeSpec,
          prompt: "Reply ok.",
          executable: "/bin/claude",
          launch,
        },
        { authMode: "subscription", childEnv: {} },
      )) {
        // Drain stream.
      }
    }, isClaudeToolGuardrail)
    assert.equal(calls[0]?.stopped, true)
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

  it("settles the error-output reader when a guardrail ends the turn", async () => {
    const live = liveLaunch()

    await withoutUnhandledRejections(async () => {
      const drained = assert.rejects(async () => {
        for await (const _event of runClaudeCliStream(
          {
            spec: claudeSpec,
            prompt: "Reply ok.",
            executable: "/bin/claude",
            launch: live.launch,
          },
          { authMode: "subscription", childEnv: {} },
        )) {
          // Drain stream.
        }
      }, isClaudeToolGuardrail)

      setImmediate(() => {
        live.stdout.write(
          '{"type":"tool_progress","tool_name":"Read","elapsed_time_seconds":1}\n',
        )
        live.result.resolve({ exitCode: 0, signal: null })
      })
      await drained
    })

    assert.equal(live.stopped(), true)
  })

  it("keeps a completed result when error output cannot be read", async () => {
    const live = liveLaunch()

    await withoutUnhandledRejections(async () => {
      const drained = (async () => {
        for await (const _event of runClaudeCliStream(
          {
            spec: claudeSpec,
            prompt: "Reply ok.",
            executable: "/bin/claude",
            launch: live.launch,
          },
          { authMode: "subscription", childEnv: {} },
        )) {
          // Drain stream.
        }
      })()

      setImmediate(() => {
        live.stdout.end(
          '{"type":"result","subtype":"success","result":"Hi","usage":{"input_tokens":1,"output_tokens":2}}\n',
        )
        live.result.resolve({ exitCode: 0, signal: null })
        live.errorOutput.destroy(new Error("error output read failed"))
      })
      await drained
    })

    assert.equal(live.stopped(), true)
  })

  it("keeps the first reported failure when the error-output read also fails", async () => {
    const live = liveLaunch()
    let failure: unknown

    await withoutUnhandledRejections(async () => {
      const drained = (async () => {
        try {
          for await (const _event of runClaudeCliStream(
            {
              spec: claudeSpec,
              prompt: "Reply ok.",
              executable: "/bin/claude",
              launch: live.launch,
            },
            { authMode: "subscription", childEnv: {} },
          )) {
            // Drain stream.
          }
        } catch (error) {
          failure = error
        }
      })()

      setImmediate(() => {
        live.errorOutput.destroy(new Error("error output read failed"))
        setImmediate(() => {
          live.stdout.write(
            '{"type":"tool_progress","tool_name":"Read","elapsed_time_seconds":1}\n',
          )
          live.result.resolve({ exitCode: 0, signal: null })
        })
      })
      await drained
    })

    assert.ok(isClaudeToolGuardrail(failure))
    assert.equal((failure as Error).cause, undefined)
  })
})

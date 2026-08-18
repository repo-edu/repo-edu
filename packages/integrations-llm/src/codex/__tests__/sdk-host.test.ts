import assert from "node:assert/strict"
import { PassThrough } from "node:stream"
import { describe, it } from "node:test"
import {
  LlmError,
  type LlmStreamEvent,
} from "@repo-edu/integrations-llm-contract"
import {
  type CodexSdkHostLaunch,
  createCodexLlmTextClient,
} from "../sdk-host-client"
import { type CodexSdkHostRun, runCodexSdkHostServer } from "../sdk-host-server"
import { codexSpec, request } from "./codex-runner-test-helpers"

const usage = {
  inputTokens: 3,
  cachedInputTokens: 1,
  outputTokens: 2,
  reasoningOutputTokens: 1,
  wallMs: 25,
  authMode: "subscription" as const,
}

function createServerHarness(
  run: CodexSdkHostRun,
  options: { readonly stopError?: Error } = {},
): {
  readonly launch: CodexSdkHostLaunch
  readonly launchCount: () => number
  readonly stopCount: () => number
} {
  let launches = 0
  let stops = 0
  return {
    launch: async () => {
      launches += 1
      const hostToSdkHost = new PassThrough()
      const sdkHostToHost = new PassThrough()
      const stderr = new PassThrough()
      const server = runCodexSdkHostServer(hostToSdkHost, sdkHostToHost, {
        run,
      })
      return {
        stdin: hostToSdkHost,
        stdout: sdkHostToHost,
        stderr,
        result: server.then(() => ({ exitCode: 0, signal: null })),
        async stopAndConfirm() {
          stops += 1
          if (!hostToSdkHost.writableEnded) hostToSdkHost.end()
          await server
          if (options.stopError) {
            throw options.stopError
          }
        },
      }
    },
    launchCount: () => launches,
    stopCount: () => stops,
  }
}

function createLostSdkHostLaunch(
  errorOutput = "",
  stopError?: Error,
): CodexSdkHostLaunch {
  return async () => {
    const stdin = new PassThrough()
    const stdout = new PassThrough()
    const stderr = new PassThrough()
    const result = new Promise<{ exitCode: number; signal: null }>(
      (resolve) => {
        let writes = 0
        stdin.on("data", () => {
          writes += 1
          if (writes === 2) {
            if (errorOutput.length > 0) stderr.write(errorOutput)
            setImmediate(() => resolve({ exitCode: 1, signal: null }))
          }
        })
      },
    )
    return {
      stdin,
      stdout,
      stderr,
      result,
      async stopAndConfirm() {
        if (!stdin.destroyed) stdin.destroy()
        if (!stdout.destroyed) stdout.destroy()
        await result
        if (stopError) {
          throw stopError
        }
      },
    }
  }
}

describe("Codex SDK host process", () => {
  it("runs one request and preserves streamed events, traces, and known success", async () => {
    const requests: string[] = []
    const traces: string[] = []
    const harness = createServerHarness(async function* ({
      request: sdkHostRequest,
      trace,
    }) {
      requests.push(sdkHostRequest.prompt)
      assert.deepEqual(sdkHostRequest.spec, codexSpec)
      trace("trace-one")
      yield { kind: "activity", label: "Contacting Codex." }
      yield { kind: "text-delta", text: "pong" }
      yield { kind: "done", usage }
    })
    const client = createCodexLlmTextClient(undefined, {
      launch: harness.launch,
      trace: (text) => traces.push(text),
    })

    const events: LlmStreamEvent[] = []
    for await (const event of client.streamText(request(codexSpec))) {
      events.push(event)
    }

    assert.deepEqual(requests, ["ping"])
    assert.equal(harness.launchCount(), 1)
    assert.equal(harness.stopCount(), 1)
    assert.deepEqual(traces, ["trace-one"])
    assert.deepEqual(events, [
      { kind: "activity", label: "Contacting Codex." },
      { kind: "text-delta", text: "pong" },
      { kind: "done", usage },
    ])
  })

  it("reconstructs a known Codex SDK host process failure", async () => {
    const harness = createServerHarness(async function* () {
      yield await Promise.reject(
        new LlmError("rate_limit", "429 retry-after 5s", {
          context: {
            provider: "codex",
            authMode: "subscription",
            retryAfterMs: 5_000,
          },
        }),
      )
    })
    const client = createCodexLlmTextClient(undefined, {
      launch: harness.launch,
    })

    await assert.rejects(
      () => client.generateText(request(codexSpec)),
      (error: unknown) =>
        error instanceof LlmError &&
        error.kind === "rate_limit" &&
        error.context.retryAfterMs === 5_000,
    )
    assert.equal(harness.stopCount(), 1)
  })

  it("keeps a known Codex SDK host process failure when stop confirmation also fails", async () => {
    const stopError = new Error(
      "The Codex SDK host process tree could not be confirmed.",
    )
    const harness = createServerHarness(
      async function* () {
        yield await Promise.reject(
          new LlmError("rate_limit", "429 retry-after 5s", {
            context: {
              provider: "codex",
              authMode: "subscription",
              retryAfterMs: 5_000,
            },
          }),
        )
      },
      { stopError },
    )
    const client = createCodexLlmTextClient(undefined, {
      launch: harness.launch,
    })

    await assert.rejects(
      () => client.generateText(request(codexSpec)),
      (error: unknown) =>
        error instanceof LlmError &&
        error.kind === "rate_limit" &&
        error.context.retryAfterMs === 5_000 &&
        error.cause === stopError,
    )
    assert.equal(harness.stopCount(), 1)
  })

  it("starts bounded stop after a known reply before waiting for process completion", {
    timeout: 1_000,
  }, async () => {
    let stops = 0
    const launch: CodexSdkHostLaunch = async () => {
      const hostToSdkHost = new PassThrough()
      const sdkHostToHost = new PassThrough()
      const stderr = new PassThrough()
      const server = runCodexSdkHostServer(hostToSdkHost, sdkHostToHost, {
        run: async function* () {
          yield { kind: "text-delta", text: "pong" }
          yield { kind: "done", usage }
        },
      })
      const terminal = Promise.withResolvers<{
        exitCode: number
        signal: null
      }>()
      return {
        stdin: hostToSdkHost,
        stdout: sdkHostToHost,
        stderr,
        result: terminal.promise,
        async stopAndConfirm() {
          stops += 1
          if (!hostToSdkHost.writableEnded) hostToSdkHost.end()
          await server
          terminal.resolve({ exitCode: 0, signal: null })
        },
      }
    }
    const client = createCodexLlmTextClient(undefined, { launch })

    const result = await client.generateText(request(codexSpec))

    assert.equal(result.reply, "pong")
    assert.equal(stops, 1)
  })

  it("cancels the Codex SDK host process request and confirms its tree", async () => {
    const started = Promise.withResolvers<void>()
    let sdkHostObservedCancellation = false
    const harness = createServerHarness(async function* ({ signal }) {
      started.resolve()
      await new Promise<void>((resolve) => {
        signal.addEventListener(
          "abort",
          () => {
            sdkHostObservedCancellation = true
            resolve()
          },
          { once: true },
        )
      })
      throw new DOMException("Operation cancelled.", "AbortError")
    })
    const controller = new AbortController()
    const client = createCodexLlmTextClient(undefined, {
      launch: harness.launch,
    })
    const result = client.generateText({
      ...request(codexSpec),
      signal: controller.signal,
    })

    await started.promise
    controller.abort()

    await assert.rejects(
      () => result,
      (error: unknown) =>
        error instanceof DOMException && error.name === "AbortError",
    )
    assert.equal(sdkHostObservedCancellation, true)
    assert.equal(harness.stopCount(), 1)
  })

  it("settles cancellation once when the Codex SDK host process does not answer", async () => {
    let stops = 0
    const controller = new AbortController()
    const client = createCodexLlmTextClient(undefined, {
      launch: async () => {
        const stdin = new PassThrough()
        const stdout = new PassThrough()
        const stderr = new PassThrough()
        return {
          stdin,
          stdout,
          stderr,
          result: new Promise(() => undefined),
          async stopAndConfirm() {
            stops += 1
            stdout.end()
            stderr.end()
          },
        }
      },
    })
    const result = client.generateText({
      ...request(codexSpec),
      signal: controller.signal,
    })

    await new Promise<void>((resolve) => setImmediate(resolve))
    controller.abort()

    await assert.rejects(
      result,
      (error: unknown) =>
        error instanceof DOMException && error.name === "AbortError",
    )
    assert.equal(stops, 1)
  })

  it("cancels pending Codex SDK host process startup through its launch signal", async () => {
    const launchStarted = Promise.withResolvers<void>()
    let startupSignal: AbortSignal | undefined
    const controller = new AbortController()
    const client = createCodexLlmTextClient(undefined, {
      launch: async (signal) => {
        startupSignal = signal
        launchStarted.resolve()
        return await new Promise<never>((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => reject(new Error("Codex SDK host process startup stopped")),
            { once: true },
          )
        })
      },
    })
    const result = client.generateText({
      ...request(codexSpec),
      signal: controller.signal,
    })

    await launchStarted.promise
    controller.abort()

    await assert.rejects(
      () => result,
      (error: unknown) =>
        error instanceof DOMException && error.name === "AbortError",
    )
    assert.notEqual(startupSignal, controller.signal)
    assert.equal(startupSignal?.aborted, true)
  })

  it("reports Codex SDK host process loss as an unknown outside outcome", async () => {
    const client = createCodexLlmTextClient(undefined, {
      launch: createLostSdkHostLaunch(),
    })

    await assert.rejects(
      () => client.generateText(request(codexSpec)),
      (error: unknown) =>
        error instanceof LlmError &&
        error.kind === "other" &&
        error.context.provider === "codex" &&
        /outside outcome is unknown/.test(error.message),
    )
  })

  it("keeps the unknown outcome when stop confirmation also fails", async () => {
    const stopError = new Error(
      "The Codex SDK host process tree could not be confirmed.",
    )
    const client = createCodexLlmTextClient(undefined, {
      launch: createLostSdkHostLaunch("", stopError),
    })

    await assert.rejects(
      () => client.generateText(request(codexSpec)),
      (error: unknown) =>
        error instanceof LlmError &&
        /outside outcome is unknown/.test(error.message) &&
        error.cause instanceof AggregateError &&
        error.cause.errors.includes(stopError),
    )
  })

  it("keeps the lost Codex SDK host process output in the reported failure", async () => {
    const client = createCodexLlmTextClient(undefined, {
      launch: createLostSdkHostLaunch(
        "[codex-sdk-host] Error: cannot find module\n",
      ),
    })

    await assert.rejects(
      () => client.generateText(request(codexSpec)),
      (error: unknown) =>
        error instanceof LlmError && /cannot find module/.test(error.message),
    )
  })
})

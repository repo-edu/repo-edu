import assert from "node:assert/strict"
import { PassThrough } from "node:stream"
import { describe, it } from "node:test"
import {
  LlmError,
  type LlmStreamEvent,
} from "@repo-edu/integrations-llm-contract"
import {
  type CodexHelperLaunch,
  createCodexLlmTextClient,
} from "../helper-client"
import { type CodexHelperRun, runCodexHelperServer } from "../helper-server"
import { codexSpec, request } from "./codex-runner-test-helpers"

const usage = {
  inputTokens: 3,
  cachedInputTokens: 1,
  outputTokens: 2,
  reasoningOutputTokens: 1,
  wallMs: 25,
  authMode: "subscription" as const,
}

function createServerHarness(run: CodexHelperRun): {
  readonly launch: CodexHelperLaunch
  readonly launchCount: () => number
  readonly stopCount: () => number
} {
  let launches = 0
  let stops = 0
  return {
    launch: async () => {
      launches += 1
      const hostToHelper = new PassThrough()
      const helperToHost = new PassThrough()
      const stderr = new PassThrough()
      const server = runCodexHelperServer(hostToHelper, helperToHost, { run })
      return {
        stdin: hostToHelper,
        stdout: helperToHost,
        stderr,
        result: server.then(() => ({ exitCode: 0, signal: null })),
        async stopAndConfirm() {
          stops += 1
          if (!hostToHelper.writableEnded) hostToHelper.end()
          await server
        },
      }
    },
    launchCount: () => launches,
    stopCount: () => stops,
  }
}

function createLostHelperLaunch(errorOutput = ""): CodexHelperLaunch {
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
      },
    }
  }
}

describe("Codex managed helper", () => {
  it("runs one request and preserves streamed events, traces, and known success", async () => {
    const requests: string[] = []
    const traces: string[] = []
    const harness = createServerHarness(async function* ({
      request: helperRequest,
      trace,
    }) {
      requests.push(helperRequest.prompt)
      assert.deepEqual(helperRequest.spec, codexSpec)
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
    assert.equal(harness.stopCount(), 0)
    assert.deepEqual(traces, ["trace-one"])
    assert.deepEqual(events, [
      { kind: "activity", label: "Contacting Codex." },
      { kind: "text-delta", text: "pong" },
      { kind: "done", usage },
    ])
  })

  it("reconstructs a known helper failure", async () => {
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
  })

  it("cancels the helper request and confirms its process tree", async () => {
    const started = Promise.withResolvers<void>()
    let helperObservedCancellation = false
    const harness = createServerHarness(async function* ({ signal }) {
      started.resolve()
      await new Promise<void>((resolve) => {
        signal.addEventListener(
          "abort",
          () => {
            helperObservedCancellation = true
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
    assert.equal(helperObservedCancellation, true)
    assert.equal(harness.stopCount(), 1)
  })

  it("cancels during helper startup without sending a request", async () => {
    const launchStarted = Promise.withResolvers<void>()
    const releaseLaunch = Promise.withResolvers<void>()
    let requests = 0
    const harness = createServerHarness(async function* () {
      requests += 1
      yield { kind: "done", usage }
    })
    const controller = new AbortController()
    const client = createCodexLlmTextClient(undefined, {
      launch: async () => {
        launchStarted.resolve()
        await releaseLaunch.promise
        return await harness.launch()
      },
    })
    const result = client.generateText({
      ...request(codexSpec),
      signal: controller.signal,
    })

    await launchStarted.promise
    controller.abort()
    releaseLaunch.resolve()

    await assert.rejects(
      () => result,
      (error: unknown) =>
        error instanceof DOMException && error.name === "AbortError",
    )
    assert.equal(requests, 0)
    assert.equal(harness.stopCount(), 1)
  })

  it("reports helper loss as an unknown outside outcome", async () => {
    const client = createCodexLlmTextClient(undefined, {
      launch: createLostHelperLaunch(),
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

  it("keeps the lost helper's error output in the reported failure", async () => {
    const client = createCodexLlmTextClient(undefined, {
      launch: createLostHelperLaunch(
        "[codex-helper] Error: cannot find module\n",
      ),
    })

    await assert.rejects(
      () => client.generateText(request(codexSpec)),
      (error: unknown) =>
        error instanceof LlmError && /cannot find module/.test(error.message),
    )
  })
})
